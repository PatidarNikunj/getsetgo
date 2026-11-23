import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";

import { AiClientService } from "../ai/ai-client.service";
import { CacheService } from "../cache/cache.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateNoteInput, Note, NoteSummary, NotesPageInput } from "./note.models";
import { NoteSummaryDoc } from "./note-summary.schema";

const LIST_CACHE_PREFIX = "notes:list:";
const LIST_CACHE_TTL_SECONDS = 60;

type CachedNote = Omit<Note, "createdAt" | "updatedAt" | "summary"> & {
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly ai: AiClientService,
    @InjectModel(NoteSummaryDoc.name) private readonly summaries: Model<NoteSummaryDoc>,
  ) {}

  /** Newest first. Pages are cached in Redis and dropped whenever a note changes. */
  async list({ take, skip }: NotesPageInput): Promise<Note[]> {
    const key = `${LIST_CACHE_PREFIX}${take}:${skip}`;
    const cached = await this.cache.get<CachedNote[]>(key);
    if (cached) {
      return cached.map((n) => ({
        ...n,
        createdAt: new Date(n.createdAt),
        updatedAt: new Date(n.updatedAt),
      }));
    }
    const notes = await this.prisma.note.findMany({ orderBy: { createdAt: "desc" }, take, skip });
    await this.cache.set(key, notes, LIST_CACHE_TTL_SECONDS);
    return notes;
  }

  async get(id: string): Promise<Note> {
    const note = await this.prisma.note.findUnique({ where: { id } });
    if (!note) throw new NotFoundException("Note not found");
    return note;
  }

  async create(input: CreateNoteInput): Promise<Note> {
    const note = await this.prisma.note.create({ data: input });
    await this.cache.invalidate(LIST_CACHE_PREFIX);
    return note;
  }

  async delete(id: string): Promise<boolean> {
    const { count } = await this.prisma.note.deleteMany({ where: { id } });
    if (count === 0) throw new NotFoundException("Note not found");
    await this.summaries.deleteMany({ noteId: id });
    await this.cache.invalidate(LIST_CACHE_PREFIX);
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
  async summarize(id: string, requestId?: string): Promise<Note> {
    const note = await this.get(id);
    const result = await this.ai.summarize(
      { note_id: note.id, title: note.title, content: note.content },
      requestId,
    );
    const doc = await this.summaries.create({
      noteId: note.id,
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
