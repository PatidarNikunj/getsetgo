// Prints curl -H arguments with a visitor IP signed exactly like the web apps sign it.
// Usage: node --experimental-strip-types --no-warnings sign-ip.mjs <ip> <secret>
import { clientIpHeaders } from "../../../../packages/web-security/src/client-ip.ts";

const [ip, secret] = process.argv.slice(2);
const headers = await clientIpHeaders(new Headers({ "x-real-ip": ip }), secret);
console.log(
  Object.entries(headers)
    .map(([name, value]) => `-H\n${name}: ${value}`)
    .join("\n"),
);
