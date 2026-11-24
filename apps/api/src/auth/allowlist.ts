/**
 * Who may sign in (FR-020, research D8). AUTH_ALLOWLIST is comma-separated and case-insensitive:
 * - `alice@example.com`: a provider-verified email, from any provider
 * - `github:octocat`: a GitHub login
 * - `test:alice` or `test:e2e-*`: test-provider logins (the only place a wildcard is allowed)
 */
export interface AllowlistIdentity {
  provider: "GOOGLE" | "GITHUB" | "TEST";
  /** Only if the provider marked it verified. */
  email?: string | null;
  login?: string | null;
}

export class Allowlist {
  private readonly emails = new Set<string>();
  private readonly githubLogins = new Set<string>();
  private readonly testLogins = new Set<string>();
  private readonly testPrefixes: string[] = [];

  constructor(raw: string) {
    for (const entry of raw.split(",").map((e) => e.trim().toLowerCase())) {
      if (!entry) continue;
      if (entry.startsWith("github:")) {
        this.githubLogins.add(entry.slice("github:".length));
      } else if (entry.startsWith("test:")) {
        const login = entry.slice("test:".length);
        if (login.endsWith("*")) this.testPrefixes.push(login.slice(0, -1));
        else this.testLogins.add(login);
      } else if (entry.includes("@") && !entry.includes("*")) {
        this.emails.add(entry);
      }
      // Anything else (e.g. a wildcard email) is ignored on purpose: fail closed.
    }
  }

  allows(identity: AllowlistIdentity): boolean {
    const email = identity.email?.toLowerCase();
    const login = identity.login?.toLowerCase();
    if (identity.provider === "TEST") {
      if (!login) return false;
      return this.testLogins.has(login) || this.testPrefixes.some((p) => login.startsWith(p));
    }
    if (email && this.emails.has(email)) return true;
    return identity.provider === "GITHUB" && !!login && this.githubLogins.has(login);
  }
}
