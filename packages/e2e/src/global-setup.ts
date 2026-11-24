/** Fail fast with a clear message if the API isn't running, instead of 20 confusing timeouts. */
export default async function globalSetup(): Promise<void> {
  const apiUrl = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");
  try {
    const res = await fetch(`${apiUrl}/health/ready`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`status ${res.status}: ${await res.text()}`);
  } catch (error) {
    throw new Error(
      `The API at ${apiUrl} isn't ready (${(error as Error).message}).\n` +
        "Start it first: pnpm infra:up && pnpm stack:up   (or run pnpm dev in another terminal)",
    );
  }
}
