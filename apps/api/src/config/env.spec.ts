import { validateEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  MONGODB_URI: "mongodb://u:p@localhost:27017/db",
  REDIS_URL: "redis://:p@localhost:6379/0",
  AI_SERVICE_URL: "http://localhost:8000",
  SERVICE_JWT_SECRET: "x".repeat(32),
  CORS_ORIGINS: "http://localhost:3000, http://localhost:3001",
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
});
