import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";

import { AppModule } from "../src/app.module";

export const ORIGIN = "http://localhost:3000";

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.use(cookieParser());
  app.useBodyParser("urlencoded", { extended: false });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}

/** A tiny browser cookie jar: applies Set-Cookie (including deletions) like a browser would. */
export class Jar {
  private readonly cookies = new Map<string, string>();

  apply(setCookie: string[] | string | undefined): void {
    const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    for (const line of list) {
      const [pair, ...attributes] = line.split(";").map((s) => s.trim());
      const eq = pair?.indexOf("=") ?? -1;
      if (!pair || eq < 0) continue;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const expired = attributes.some(
        (a) => /^expires=/i.test(a) && new Date(a.slice(8)).getTime() < Date.now(),
      );
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  set(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  delete(name: string): void {
    this.cookies.delete(name);
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

export interface SignInResult {
  status: number;
  location: string;
}

/** The full test-provider flow: start → provider form → callback, like a browser. */
export async function signIn(
  app: INestApplication,
  jar: Jar,
  login: string,
  opts: { returnTo?: string; cancel?: boolean; email?: string } = {},
): Promise<SignInResult> {
  const server = app.getHttpServer();
  const start = await request(server)
    .post("/auth/test/start")
    .set("Origin", ORIGIN)
    .type("form")
    .send(opts.returnTo ? { returnTo: opts.returnTo } : {});
  jar.apply(start.headers["set-cookie"]);
  if (start.status !== 303) throw new Error(`start answered ${start.status}`);
  const authorize = new URL(start.headers.location as string);

  const consent = await request(server)
    .post("/auth/test/authorize")
    .set("Origin", ORIGIN)
    .type("form")
    .send({
      redirect_uri: authorize.searchParams.get("redirect_uri"),
      state: authorize.searchParams.get("state"),
      code_challenge: authorize.searchParams.get("code_challenge"),
      login,
      email: opts.email ?? "",
      action: opts.cancel ? "cancel" : "continue",
    });
  const callback = new URL(consent.headers.location as string);

  const res = await request(server)
    .get(`/auth/test/callback${callback.search}`)
    .set("Cookie", jar.header());
  jar.apply(res.headers["set-cookie"]);
  return { status: res.status, location: res.headers.location as string };
}

export function gql(
  app: INestApplication,
  jar: Jar | undefined,
  query: string,
  variables?: Record<string, unknown>,
) {
  const req = request(app.getHttpServer()).post("/graphql");
  if (jar) req.set("Cookie", jar.header());
  return req.send({ query, variables });
}

export const uniqueLogin = (prefix = "e2e"): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
