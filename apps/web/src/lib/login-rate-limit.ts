import { isIP } from "node:net";

type Entry = { failures: number; blockedUntil: number; touched: number };
export class LoginRateLimit {
  private entries = new Map<string, Entry>();
  constructor(private readonly now = Date.now) {}
  private prune() {
    const now = this.now();
    for (const [ip, value] of this.entries) if (now - value.touched >= 15 * 60_000) this.entries.delete(ip);
    // Bound memory without evicting live penalties (rotation cannot reset them).
  }
  retryAfter(ip: string) {
    this.prune();
    if (!this.entries.has(ip) && this.entries.size >= 10_000) return 60;
    return Math.max(0, Math.ceil(((this.entries.get(ip)?.blockedUntil || 0) - this.now()) / 1000));
  }
  failure(ip: string) {
    const previous = this.entries.get(ip);
    const failures = (previous?.failures || 0) + 1;
    const delay = failures < 5 ? 0 : Math.min(60_000, 1000 * 2 ** Math.min(failures - 5, 6));
    this.entries.set(ip, { failures, blockedUntil: this.now() + delay, touched: this.now() });
  }
  success(ip: string) { this.entries.delete(ip); }
}

// Only enable behind the private Traefik ingress. Traefik must append RemoteAddr
// (notAppendXForwardedFor=false) and reject untrusted incoming forwarded headers.
// Choose the last hop it appended, never a client-controlled leftmost value.
export function loginClientIp(headers: Headers, trustProxy = process.env.SENIOR_TRUST_PROXY === "true") {
  if (!trustProxy) return "untrusted-ingress";
  const forwarded = headers.get("x-forwarded-for") || "";
  if (forwarded.length > 1024) return "invalid-ingress";
  const ip = forwarded.split(",").at(-1)?.trim() || "";
  return isIP(ip) ? ip : "invalid-ingress";
}
export const loginRateLimit = new LoginRateLimit();
