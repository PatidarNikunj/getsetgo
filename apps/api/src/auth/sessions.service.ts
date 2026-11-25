import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env";
import type { SessionRevokedReason } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";
import { Allowlist } from "./allowlist";
import { SESSION_TTL_SECONDS } from "./cookies";
import type { ProviderIdentity } from "./providers/provider";
import { hashToken, TokensService } from "./tokens.service";

/** Parallel tabs may renew with the same token at the same moment; that isn't theft (research D3). */
export const REUSE_GRACE_MS = 10_000;
const ENDED_SESSION_RETENTION_MS = SESSION_TTL_SECONDS * 1000;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
  sessionId: string;
}

export type RotateResult =
  | { ok: true; tokens: IssuedTokens }
  | { ok: false; reason: "unknown" | "inactive" | "reuse" | "allowlist" };

/**
 * Users, sessions and refresh-token rotation with reuse detection (data-model.md). A session is
 * one signed-in browser; its refresh tokens form a family. Presenting an already-used token
 * (outside the grace window) means a copy exists somewhere else, so the whole session ends.
 */
@Injectable()
export class SessionsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SessionsService.name);
  readonly allowlist: Allowlist;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    config: ConfigService<Env, true>,
  ) {
    this.allowlist = new Allowlist(config.get("AUTH_ALLOWLIST", { infer: true }));
  }

  /** Housekeeping: drop sessions that ended more than 30 days ago (tokens cascade). */
  async onApplicationBootstrap(): Promise<void> {
    const cutoff = new Date(Date.now() - ENDED_SESSION_RETENTION_MS);
    try {
      const { count } = await this.prisma.session.deleteMany({
        where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
      });
      if (count > 0) this.logger.log(`Removed ${count} old sessions`);
    } catch (err) {
      this.logger.warn(`Session sweep failed: ${(err as Error).message}`);
    }
  }

  /**
   * Find or create the user for a provider account. Identity is (provider, providerAccountId);
   * accounts are never merged by email (FR-003). Profile fields are refreshed on every sign-in.
   */
  async upsertUser(identity: ProviderIdentity): Promise<string> {
    const now = new Date();
    const profile = {
      displayName: identity.displayName,
      email: identity.email ?? null,
      avatarUrl: identity.avatarUrl ?? null,
    };
    const accountFields = {
      login: identity.login ?? null,
      email: identity.email ?? null,
      lastSignInAt: now,
    };
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.providerAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: identity.provider,
            providerAccountId: identity.providerAccountId,
          },
        },
      });
      if (existing) {
        await tx.providerAccount.update({ where: { id: existing.id }, data: accountFields });
        await tx.user.update({ where: { id: existing.userId }, data: profile });
        return existing.userId;
      }
      const user = await tx.user.create({
        data: {
          ...profile,
          account: {
            create: {
              provider: identity.provider,
              providerAccountId: identity.providerAccountId,
              ...accountFields,
            },
          },
        },
      });
      return user.id;
    });
  }

  async createSession(userId: string): Promise<IssuedTokens> {
    const now = new Date();
    const refresh = this.tokens.createRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000),
        refreshTokens: { create: { tokenHash: refresh.hash } },
      },
    });
    return this.issue(userId, session.id, refresh.token);
  }

  /** Exchange a refresh token for a new pair (FR-009, FR-010). */
  async rotate(rawToken: string): Promise<RotateResult> {
    const now = new Date();
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { session: { include: { user: { include: { account: true } } } } },
    });
    if (!token) return { ok: false, reason: "unknown" };
    const { session } = token;
    if (session.revokedAt || session.expiresAt <= now) return { ok: false, reason: "inactive" };

    const account = session.user.account;
    if (!account || !this.allowlist.allows(account)) {
      await this.revoke(session.id, "ALLOWLIST");
      return { ok: false, reason: "allowlist" };
    }

    if (token.usedAt) {
      if (now.getTime() - token.usedAt.getTime() > REUSE_GRACE_MS) {
        await this.revoke(session.id, "REUSE");
        this.logger.warn({
          event: "auth.refresh.reuse_detected",
          userId: session.userId,
          sessionId: session.id,
        });
        return { ok: false, reason: "reuse" };
      }
      // Benign race: issue a sibling successor below without revoking anything.
    } else {
      // Atomic check-and-set: only one request can be the first to use this token.
      await this.prisma.refreshToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
    }

    const refresh = this.tokens.createRefreshToken();
    await this.prisma.$transaction([
      this.prisma.refreshToken.create({ data: { sessionId: session.id, tokenHash: refresh.hash } }),
      this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000) },
      }),
    ]);
    return { ok: true, tokens: await this.issue(session.userId, session.id, refresh.token) };
  }

  /** The session a refresh token belongs to, if it is still active. */
  async sessionForRefreshToken(rawToken: string): Promise<{ id: string; userId: string } | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: { session: { select: { id: true, userId: true, revokedAt: true } } },
    });
    return token && !token.session.revokedAt ? token.session : null;
  }

  async revoke(sessionId: string, reason: SessionRevokedReason): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAll(userId: string, reason: SessionRevokedReason): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return count;
  }

  private async issue(
    userId: string,
    sessionId: string,
    refreshToken: string,
  ): Promise<IssuedTokens> {
    const accessToken = await this.tokens.signAccessToken({ userId, sessionId });
    return { accessToken, refreshToken, userId, sessionId };
  }
}
