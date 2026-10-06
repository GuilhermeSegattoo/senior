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

// Only enable behind private ingress. Count trusted proxies from the right:
// 1 = Traefik, 2 = Cloudflare + Traefik. Never trust an arbitrary client prefix.
export function loginClientIp(headers: Headers, trustProxy = process.env.SENIOR_TRUST_PROXY === "true",
  hops: string | number = process.env.SENIOR_TRUSTED_PROXY_HOPS ?? "1") {
  if (!trustProxy) return "untrusted-ingress";
  const rawHops = String(hops);
  if (!/^[1-9]\d?$/.test(rawHops) || Number(rawHops) > 16) return "invalid-ingress";
  const count = Number(rawHops);
  const forwarded = headers.get("x-forwarded-for") || "";
  if (forwarded.length > 1024) return "invalid-ingress";
  const chain = forwarded.split(",").map(value => value.trim());
  if (chain.length < count) return "invalid-ingress";
  const trustedSuffix = chain.slice(-count);
  if (trustedSuffix.some(ip => !isIP(ip))) return "invalid-ingress";
  return trustedSuffix[0];
}
export const loginRateLimit = new LoginRateLimit();
