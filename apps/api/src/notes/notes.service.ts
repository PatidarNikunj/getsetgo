import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";

import { AiClientService } from "../ai/ai-client.service";
import { CacheService } from "../cache/cache.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateNoteInput, Note, NoteSummary, NotesPageInput } from "./note.models";
import { NoteSummaryDoc } from "./note-summary.schema";

const LIST_CACHE_TTL_SECONDS = 60;

/** Cached note pages are per owner, so one user's list can never be served to another. */
export function notesCacheGroup(ownerId: string): string {
  return `notes:list:${ownerId}`;
}

type CachedNote = Omit<Note, "createdAt" | "updatedAt" | "summary"> & {
  createdAt: string;
  updatedAt: string;
};

/**
 * Notes are private: every method takes the owner and only touches that owner's notes. Another
 * user's note is reported as "not found", exactly like a missing one (FR-014).
 */
@Injectable()
export class NotesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly ai: AiClientService,
    @InjectModel(NoteSummaryDoc.name) private readonly summaries: Model<NoteSummaryDoc>,
  ) {}

  /**
   * FR-019: summaries written before sign-in existed have no owner. Their notes were deleted by
   * the auth migration; delete the summaries too. Idempotent, so it simply runs at every start.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const { deletedCount } = await this.summaries.deleteMany({ ownerId: { $exists: false } });
      if (deletedCount > 0) this.logger.log(`Deleted ${deletedCount} ownerless note summaries`);
    } catch (err) {
      this.logger.warn(`Ownerless summary purge failed: ${(err as Error).message}`);
    }
  }

  /** Newest first. Pages are cached in Redis until one of the owner's notes changes. */
  async list(ownerId: string, { take, skip }: NotesPageInput): Promise<Note[]> {
    // Versioned keys: a write bumps the version, so a slower read can't re-cache stale data.
    const version = await this.cache.version(notesCacheGroup(ownerId));
    const key = `${notesCacheGroup(ownerId)}:v${version}:${take}:${skip}`;
    const cached = version === "unavailable" ? undefined : await this.cache.get<CachedNote[]>(key);
    if (cached) {
      return cached.map((n) => ({
        ...n,
        createdAt: new Date(n.createdAt),
        updatedAt: new Date(n.updatedAt),
      }));
    }
    const notes = await this.prisma.note.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    });
    if (version !== "unavailable") await this.cache.set(key, notes, LIST_CACHE_TTL_SECONDS);
    return notes;
  }

  async get(ownerId: string, id: string): Promise<Note> {
    const note = await this.prisma.note.findFirst({ where: { id, ownerId } });
    if (!note) throw new NotFoundException("Note not found");
    return note;
  }

  async create(ownerId: string, input: CreateNoteInput): Promise<Note> {
    // Users are never created here; if the owner is gone (account just deleted), refuse.
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!owner) throw new UnauthorizedException("Sign in required");
    const note = await this.prisma.note.create({ data: { ...input, ownerId } });
    await this.cache.bumpVersion(notesCacheGroup(ownerId));
    return note;
  }

  async delete(ownerId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.note.deleteMany({ where: { id, ownerId } });
    if (count === 0) throw new NotFoundException("Note not found");
    await this.summaries.deleteMany({ noteId: id });
    await this.cache.bumpVersion(notesCacheGroup(ownerId));
    return true;
  }

  async latestSummary(noteId: string): Promise<NoteSummary | null> {
    const doc = await this.summaries.findOne({ noteId }).sort({ createdAt: -1 }).lean();
    return doc
      ? {
          summary: doc.summary,
          keyPoints: doc.keyPoints,
          model: doc.model,
          createdAt: doc.createdAt,
        }
      : null;
  }

  /** Ask apps/ai (Claude) for a summary and store it in MongoDB. */
  async summarize(ownerId: string, id: string, requestId?: string): Promise<Note> {
    const note = await this.get(ownerId, id);
    const result = await this.ai.summarize(
      { note_id: note.id, title: note.title, content: note.content },
      requestId,
    );
    const doc = await this.summaries.create({
      noteId: note.id,
      ownerId,
      summary: result.summary,
      keyPoints: result.key_points,
      model: result.model,
      runId: result.run_id,
    });
    return {
      ...note,
      summary: {
        summary: doc.summary,
        keyPoints: doc.keyPoints,
        model: doc.model,
        createdAt: doc.createdAt,
      },
    };
  }
}
