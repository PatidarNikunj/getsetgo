import { Logger, UnauthorizedException } from "@nestjs/common";
import { Context, Mutation, Query, Resolver } from "@nestjs/graphql";
import type { Response } from "express";

import { PrismaService } from "../prisma/prisma.service";
import { AccountService } from "./account.service";
import { Viewer } from "./auth.models";
import { clearSessionCookies } from "./cookies";
import { type AuthUser, CurrentUser } from "./current-user.decorator";
import { SessionsService } from "./sessions.service";

/** GraphQL side of sign-in: who am I, sign out everywhere, delete my account. Never @Public(). */
@Resolver(() => Viewer)
export class AuthResolver {
  private readonly logger = new Logger(AuthResolver.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly accounts: AccountService,
  ) {}

  @Query(() => Viewer, { description: "The signed-in user" })
  async me(@CurrentUser() user: AuthUser): Promise<Viewer> {
    const found = await this.prisma.user.findUnique({
      where: { id: user.userId },
      include: { account: true },
    });
    // A deleted account whose 15-minute access cookie hasn't expired yet.
    if (!found?.account) throw new UnauthorizedException("Sign in required");
    return {
      id: found.id,
      displayName: found.displayName,
      email: found.email,
      avatarUrl: found.avatarUrl,
      provider: found.account.provider,
      login: found.account.login,
      createdAt: found.createdAt,
    };
  }

  @Mutation(() => Boolean, {
    description: "End every session of the signed-in user, including this one",
  })
  async signOutEverywhere(
    @CurrentUser() user: AuthUser,
    @Context("res") res: Response,
  ): Promise<boolean> {
    const count = await this.sessions.revokeAll(user.userId, "SIGN_OUT_EVERYWHERE");
    clearSessionCookies(res);
    this.logger.log({ event: "auth.sign_out_everywhere", userId: user.userId, sessions: count });
    return true;
  }

  @Mutation(() => Boolean, {
    description: "Permanently delete the signed-in user, their notes, summaries and sessions",
  })
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Context("res") res: Response,
  ): Promise<boolean> {
    await this.accounts.deleteAccount(user.userId);
    clearSessionCookies(res);
    return true;
  }
}
