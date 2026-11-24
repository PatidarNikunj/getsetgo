import {
  type ArgumentsHost,
  Body,
  Catch,
  Controller,
  type ExceptionFilter,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle, ThrottlerException } from "@nestjs/throttler";
import { generateCodeVerifier, generateState } from "arctic";
import type { Request, Response } from "express";

import { CacheService } from "../cache/cache.service";
import type { Env } from "../config/env";
import { Public } from "../security/public.decorator";
import {
  clearOAuthStateCookie,
  clearSessionCookies,
  noStore,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  readCookie,
  REFRESH_COOKIE,
  setOAuthStateCookie,
  setSessionCookies,
} from "./cookies";
import { OriginGuard, requestOrigin } from "./origin.guard";
import { GitHubProvider } from "./providers/github.provider";
import { GoogleProvider } from "./providers/google.provider";
import {
  isProviderId,
  type OAuthProvider,
  ProviderError,
  type ProviderId,
} from "./providers/provider";
import { TestProvider } from "./providers/test.provider";
import { RecaptchaService } from "./recaptcha.service";
import { SessionsService } from "./sessions.service";

/** Error codes shown on the sign-in page (contracts/auth-rest.md). */
export type SignInError =
  "denied" | "invite_only" | "expired" | "bot" | "rate_limited" | "unavailable" | "failed";

interface PendingSignIn {
  provider: ProviderId;
  codeVerifier: string;
  origin: string;
  returnTo: string;
}

const SAFE_RETURN_TO = /^\/(?![/\\])[^\s\\]*$/;

/** Only same-site relative paths, so sign-in can't become an open redirect. */
export function safeReturnTo(value: unknown): string {
  return typeof value === "string" && value.length <= 512 && SAFE_RETURN_TO.test(value)
    ? value
    : "/";
}

function signInErrorUrl(error: SignInError): string {
  return `/sign-in?error=${error}`;
}

/** Rate-limited browser flows land back on the sign-in page with a message, not a JSON 429. */
@Catch(ThrottlerException)
class RedirectWhenRateLimited implements ExceptionFilter {
  catch(_exception: ThrottlerException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    noStore(res);
    res.redirect(303, signInErrorUrl("rate_limited"));
  }
}

/**
 * Sign-in over REST, reached through each web app's /api/auth/* rewrite so the cookies are
 * first-party (research D6). Every route here is public; the cookies are the credentials.
 */
@Public()
@UseGuards(OriginGuard)
@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly origins: string[];
  private readonly providers: Record<ProviderId, OAuthProvider>;

  constructor(
    config: ConfigService<Env, true>,
    private readonly sessions: SessionsService,
    private readonly recaptcha: RecaptchaService,
    private readonly cache: CacheService,
    google: GoogleProvider,
    github: GitHubProvider,
    private readonly testProvider: TestProvider,
  ) {
    this.origins = config.get("CORS_ORIGINS", { infer: true });
    this.providers = { google, github, test: testProvider };
  }

  /** Which buttons the sign-in page shows for a web app origin. */
  @Get("providers")
  providerList(@Query("origin") origin: unknown, @Res({ passthrough: true }) res: Response) {
    noStore(res);
    const known = typeof origin === "string" && this.origins.includes(origin) ? origin : undefined;
    return {
      providers: known
        ? (Object.keys(this.providers) as ProviderId[]).filter((id) =>
            this.providers[id].isConfiguredFor(known),
          )
        : [],
      recaptcha: this.recaptcha.enabled,
    };
  }

  @Post(":provider/start")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseFilters(RedirectWhenRateLimited)
  async start(
    @Param("provider") providerId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    noStore(res);
    const provider = this.provider(providerId);
    const origin = requestOrigin(req, this.origins);
    if (!origin || !provider.isConfiguredFor(origin)) {
      return res.redirect(303, signInErrorUrl("unavailable"));
    }
    if (!(await this.recaptcha.verify(body?.recaptchaToken, req.ip))) {
      this.logger.warn({ event: "auth.sign_in.failed", provider: provider.id, reason: "bot" });
      return res.redirect(303, signInErrorUrl("bot"));
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const pending: PendingSignIn = {
      provider: provider.id,
      codeVerifier,
      origin,
      returnTo: safeReturnTo(body?.returnTo),
    };
    await this.cache.client.set(
      `auth:pending:${state}`,
      JSON.stringify(pending),
      "EX",
      OAUTH_STATE_TTL_SECONDS,
    );
    setOAuthStateCookie(res, state);
    const url = provider.authorizationUrl({
      state,
      codeVerifier,
      redirectUri: this.redirectUri(origin, provider.id),
      origin,
    });
    res.redirect(303, url.toString());
  }

  @Get(":provider/callback")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseFilters(RedirectWhenRateLimited)
  async callback(
    @Param("provider") providerId: string,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    noStore(res);
    const provider = this.provider(providerId);
    const fail = (error: SignInError, reason: string = error): void => {
      this.logger.warn({ event: "auth.sign_in.failed", provider: provider.id, reason });
      res.redirect(303, signInErrorUrl(error));
    };

    const cookieState = readCookie(req, OAUTH_STATE_COOKIE);
    clearOAuthStateCookie(res);
    if (typeof query.error === "string") return fail("denied");

    const { state, code } = query;
    if (typeof state !== "string" || typeof code !== "string" || !cookieState) {
      return fail("expired", "missing_state");
    }
    if (state !== cookieState) return fail("expired", "state_mismatch");
    // Single use: a replayed callback finds nothing (FR-004).
    const raw = await this.cache.client.getdel(`auth:pending:${state}`);
    if (!raw) return fail("expired", "state_unknown");
    const pending = JSON.parse(raw) as PendingSignIn;
    if (pending.provider !== provider.id) return fail("expired", "provider_mismatch");

    let identity;
    try {
      identity = await provider.identify({
        code,
        codeVerifier: pending.codeVerifier,
        redirectUri: this.redirectUri(pending.origin, provider.id),
        origin: pending.origin,
      });
    } catch (err) {
      if (err instanceof ProviderError) {
        return fail(err.reason === "failed" ? "failed" : "unavailable", err.message);
      }
      throw err;
    }

    // Checked before anything is written: no account for people who aren't invited (FR-020).
    if (!this.sessions.allowlist.allows(identity)) return fail("invite_only");

    const userId = await this.sessions.upsertUser(identity);
    const tokens = await this.sessions.createSession(userId);
    setSessionCookies(res, tokens);
    this.logger.log({
      event: "auth.sign_in.succeeded",
      provider: provider.id,
      userId,
      sessionId: tokens.sessionId,
    });
    res.redirect(303, pending.returnTo);
  }

  /** Renew the session: rotates the refresh token (FR-009, FR-010). */
  @Post("refresh")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Res() res: Response): Promise<void> {
    const raw = readCookie(req, REFRESH_COOKIE);
    const result = raw
      ? await this.sessions.rotate(raw)
      : ({ ok: false, reason: "unknown" } as const);
    if (!result.ok) {
      clearSessionCookies(res);
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    setSessionCookies(res, result.tokens);
    res.status(204).end();
  }

  /** Sign out of this browser. Works as a native form post (before hydration) or fetch. */
  @Post("sign-out")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(204)
  async signOut(@Req() req: Request, @Res() res: Response): Promise<void> {
    const raw = readCookie(req, REFRESH_COOKIE);
    const session = raw ? await this.sessions.sessionForRefreshToken(raw) : null;
    if (session) {
      await this.sessions.revoke(session.id, "SIGN_OUT");
      this.logger.log({ event: "auth.sign_out", userId: session.userId, sessionId: session.id });
    }
    clearSessionCookies(res);
    if (req.accepts(["json", "html"]) === "html") {
      res.redirect(303, "/sign-in?signedOut=1");
      return;
    }
    res.status(204).end();
  }

  // ---------- Test provider only (research D12): 404 unless enabled ----------

  @Get("test/authorize")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  testAuthorizeForm(@Query() query: Record<string, unknown>, @Res() res: Response): void {
    this.requireTestProvider();
    const { redirect_uri: redirectUri, state, code_challenge: challenge } = query;
    if (
      typeof redirectUri !== "string" ||
      typeof state !== "string" ||
      typeof challenge !== "string" ||
      !this.isOwnCallback(redirectUri)
    ) {
      res.status(400).send("Bad request");
      return;
    }
    noStore(res);
    res.type("html").send(testAuthorizePage({ redirectUri, state, challenge }));
  }

  @Post("test/authorize")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async testAuthorize(@Body() body: Record<string, unknown>, @Res() res: Response): Promise<void> {
    this.requireTestProvider();
    const {
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      login,
      email,
      action,
    } = body ?? {};
    if (
      typeof redirectUri !== "string" ||
      typeof state !== "string" ||
      typeof challenge !== "string" ||
      !this.isOwnCallback(redirectUri)
    ) {
      res.status(400).send("Bad request");
      return;
    }
    const target = new URL(redirectUri);
    target.searchParams.set("state", state);
    if (action === "cancel") {
      target.searchParams.set("error", "access_denied");
      res.redirect(303, target.toString());
      return;
    }
    try {
      const code = await this.testProvider.issueCode({
        login: typeof login === "string" ? login.trim() : "",
        email: typeof email === "string" && email.trim() ? email.trim() : undefined,
        codeChallenge: challenge,
        redirectUri,
      });
      target.searchParams.set("code", code);
    } catch {
      target.searchParams.set("error", "invalid_request");
    }
    res.redirect(303, target.toString());
  }

  private provider(id: string): OAuthProvider {
    if (!isProviderId(id) || (id === "test" && !this.testProvider.enabled)) {
      throw new NotFoundException();
    }
    return this.providers[id];
  }

  private redirectUri(origin: string, provider: ProviderId): string {
    return `${origin}/api/auth/${provider}/callback`;
  }

  private isOwnCallback(redirectUri: string): boolean {
    return this.origins.some((origin) => redirectUri === this.redirectUri(origin, "test"));
  }

  private requireTestProvider(): void {
    if (!this.testProvider.enabled) throw new NotFoundException();
  }
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A plain, script-free, accessible form standing in for a provider's consent screen. */
function testAuthorizePage(p: { redirectUri: string; state: string; challenge: string }): string {
  const hidden = (name: string, value: string) =>
    `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test sign-in provider</title></head>
<body>
<main>
<h1>Test sign-in provider</h1>
<p>For local development and automated tests only. Never available in production.</p>
<form method="post" action="/api/auth/test/authorize">
${hidden("redirect_uri", p.redirectUri)}
${hidden("state", p.state)}
${hidden("code_challenge", p.challenge)}
<p><label for="login">Test identity</label><br>
<input id="login" name="login" required pattern="[A-Za-z0-9][A-Za-z0-9._\\-]{0,63}" autocomplete="username"></p>
<p><label for="email">Email (optional, treated as verified)</label><br>
<input id="email" name="email" type="email" autocomplete="email"></p>
<p><button type="submit" name="action" value="continue">Continue</button>
<button type="submit" name="action" value="cancel" formnovalidate>Cancel</button></p>
</form>
</main>
</body>
</html>`;
}
