import type { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import { REUSE_GRACE_MS, SessionsService } from "./sessions.service";
import { hashToken, TokensService } from "./tokens.service";

const config = {
  get: (key: string) => ({ AUTH_ALLOWLIST: "test:alice", AUTH_JWT_SECRET: "k".repeat(32) })[key],
} as unknown as ConfigService<Env, true>;

/** Just enough of Prisma for rotate(): one session with one token. */
function setup(token: { usedAt: Date | null }, opts: { revoked?: boolean; login?: string } = {}) {
  const session = {
    id: "s1",
    userId: "u1",
    revokedAt: opts.revoked ? new Date() : null,
    expiresAt: new Date(Date.now() + 60_000),
    user: { account: { provider: "TEST", login: opts.login ?? "alice", email: null } },
  };
  const prisma = {
    refreshToken: {
      findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) =>
        Promise.resolve(
          where.tokenHash === hashToken("raw") ? { id: "t1", usedAt: token.usedAt, session } : null,
        ),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockReturnValue("create"),
    },
    session: {
      update: jest.fn().mockReturnValue("update"),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const service = new SessionsService(
    prisma as unknown as PrismaService,
    new TokensService(config),
    config,
  );
  return { service, prisma };
}

describe("SessionsService.rotate (data-model.md renewal table)", () => {
  it("rejects unknown tokens", async () => {
    const { service } = setup({ usedAt: null });
    await expect(service.rotate("nope")).resolves.toEqual({ ok: false, reason: "unknown" });
  });

  it("rotates an unused token: marks it used and issues a successor", async () => {
    const { service, prisma } = setup({ usedAt: null });
    const result = await service.rotate("raw");
    expect(result.ok).toBe(true);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    if (result.ok) expect(result.tokens.refreshToken).not.toBe("raw");
  });

  it("treats reuse within the grace window as a benign race", async () => {
    const { service, prisma } = setup({ usedAt: new Date(Date.now() - REUSE_GRACE_MS / 2) });
    await expect(service.rotate("raw")).resolves.toMatchObject({ ok: true });
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it("revokes the session when a used token comes back later (theft)", async () => {
    const { service, prisma } = setup({ usedAt: new Date(Date.now() - REUSE_GRACE_MS - 1000) });
    await expect(service.rotate("raw")).resolves.toEqual({ ok: false, reason: "reuse" });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedReason: "REUSE" },
    });
  });

  it("refuses revoked sessions and identities removed from the allowlist", async () => {
    await expect(setup({ usedAt: null }, { revoked: true }).service.rotate("raw")).resolves.toEqual(
      {
        ok: false,
        reason: "inactive",
      },
    );
    const { service, prisma } = setup({ usedAt: null }, { login: "mallory" });
    await expect(service.rotate("raw")).resolves.toEqual({ ok: false, reason: "allowlist" });
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedReason: "ALLOWLIST" }) }),
    );
  });
});
