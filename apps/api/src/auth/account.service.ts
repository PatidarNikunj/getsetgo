import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";

import { CacheService } from "../cache/cache.service";
import { NoteSummaryDoc } from "../notes/note-summary.schema";
import { notesCachePrefix } from "../notes/notes.service";
import { PrismaService } from "../prisma/prisma.service";
import { SessionsService } from "./sessions.service";

/** Right to erasure (FR-018, research D11). Safe to retry if a step fails. */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly cache: CacheService,
    @InjectModel(NoteSummaryDoc.name) private readonly summaries: Model<NoteSummaryDoc>,
  ) {}

  async deleteAccount(userId: string): Promise<void> {
    // 1. Stop renewals right away.
    await this.sessions.revokeAll(userId, "SIGN_OUT_EVERYWHERE");
    // 2. AI summaries live in MongoDB; delete them before the notes they point to.
    const noteIds = (
      await this.prisma.note.findMany({ where: { ownerId: userId }, select: { id: true } })
    ).map((n) => n.id);
    await this.summaries.deleteMany({ $or: [{ ownerId: userId }, { noteId: { $in: noteIds } }] });
    // 3. The user row; provider account, sessions, refresh tokens and notes cascade.
    await this.prisma.user.deleteMany({ where: { id: userId } });
    // 4. Cached note lists.
    await this.cache.invalidate(notesCachePrefix(userId));
    this.logger.log({ event: "auth.account.deleted", userId, notes: noteIds.length });
  }
}
