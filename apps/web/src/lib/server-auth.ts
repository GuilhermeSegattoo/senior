import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export const sessionCookie = "senior_session";
const digest = (text: string) => createHash("sha256").update(text).digest();
export function equalSecret(a: string, b: string) { return timingSafeEqual(digest(a), digest(b)); }
export function configured() {
  return Boolean((process.env.SENIOR_GATEWAY_TOKEN?.length || 0) >= 32 && (process.env.SENIOR_WEB_PASSWORD?.length || 0) >= 16 && (process.env.SENIOR_SESSION_SECRET?.length || 0) >= 32);
}
export function localDevelopment(request: Request) {
  return process.env.NODE_ENV !== "production" && !process.env.SENIOR_GATEWAY_TOKEN &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
}
export function makeSession() {
  const payload = String(Date.now() + 12 * 3600_000);
  return `${payload}.${createHmac("sha256", process.env.SENIOR_SESSION_SECRET!).update(payload).digest("hex")}`;
}
export function authenticated(cookie: string | undefined) {
  if (!configured() || !cookie) return false;
  const [expires, signature, extra] = cookie.split(".");
  if (extra || !/^\d+$/.test(expires) || Number(expires) <= Date.now() || Number(expires) > Date.now() + 12 * 3600_000) return false;
  const expected = createHmac("sha256", process.env.SENIOR_SESSION_SECRET!).update(expires).digest("hex");
  return equalSecret(signature || "", expected);
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const configuredOrigin = process.env.SENIOR_PUBLIC_URL;
    return configuredOrigin ? url.origin === new URL(configuredOrigin).origin :
      ["http:", "https:"].includes(url.protocol) && url.host === request.headers.get("host");
  } catch { return false; }
}
