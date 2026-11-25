import { validateEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  MONGODB_URI: "mongodb://u:p@localhost:27017/db",
  REDIS_URL: "redis://:p@localhost:6379/0",
  AI_SERVICE_URL: "http://localhost:8000",
  SERVICE_JWT_SECRET: "x".repeat(32),
  CORS_ORIGINS: "http://localhost:3000, http://localhost:3001",
  AUTH_JWT_SECRET: "y".repeat(32),
};

describe("validateEnv", () => {
  it("parses a valid environment with defaults", () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:3000", "http://localhost:3001"]);
  });

  it("rejects a short service secret", () => {
    expect(() => validateEnv({ ...valid, SERVICE_JWT_SECRET: "short" })).toThrow(
      /SERVICE_JWT_SECRET/,
    );
  });

  it("rejects a missing database URL", () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("defaults to production with the test provider off", () => {
    const env = validateEnv(valid);
    expect(env.APP_ENV).toBe("production");
    expect(env.AUTH_TEST_PROVIDER).toBeUndefined();
    expect(env.GITHUB_OAUTH_APPS).toEqual({});
  });

  it("never allows the test sign-in provider in production", () => {
    expect(() =>
      validateEnv({ ...valid, APP_ENV: "production", AUTH_TEST_PROVIDER: "enabled" }),
    ).toThrow(/AUTH_TEST_PROVIDER/);
    expect(
      validateEnv({ ...valid, APP_ENV: "test", AUTH_TEST_PROVIDER: "enabled" }).AUTH_TEST_PROVIDER,
    ).toBe("enabled");
  });

  it("requires a long auth secret", () => {
    expect(() => validateEnv({ ...valid, AUTH_JWT_SECRET: "short" })).toThrow(/AUTH_JWT_SECRET/);
  });

  it("parses GitHub OAuth apps per origin and rejects bad JSON", () => {
    const apps = { "http://localhost:3000": { clientId: "id", clientSecret: "secret" } };
    expect(
      validateEnv({ ...valid, GITHUB_OAUTH_APPS: JSON.stringify(apps) }).GITHUB_OAUTH_APPS,
    ).toEqual(apps);
    expect(() => validateEnv({ ...valid, GITHUB_OAUTH_APPS: "{nope" })).toThrow(
      /GITHUB_OAUTH_APPS/,
    );
  });

  it("requires Google credentials as a pair", () => {
    expect(() => validateEnv({ ...valid, GOOGLE_CLIENT_ID: "id" })).toThrow(/GOOGLE_CLIENT_ID/);
  });
});
