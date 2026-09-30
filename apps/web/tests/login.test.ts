import test from "node:test";
import assert from "node:assert/strict";
import { LoginRateLimit, loginClientIp } from "../src/lib/login-rate-limit.js";
import { NextRequest } from "next/server.js";
import nextConfig from "../next.config.js";
import { POST } from "../src/app/api/auth/route.js";

test("per-IP exponential backoff expires and successful login resets only that IP", () => {
  let now = 10000;
  const limit = new LoginRateLimit(() => now);
  for (let i=0;i<5;i++) limit.failure("198.51.100.1");
  assert.equal(limit.retryAfter("198.51.100.1"), 1);
  assert.equal(limit.retryAfter("198.51.100.2"), 0);
  now += 1000; limit.failure("198.51.100.1");
  assert.equal(limit.retryAfter("198.51.100.1"), 2);
  limit.success("198.51.100.2"); assert.equal(limit.retryAfter("198.51.100.1"), 2);
  limit.success("198.51.100.1"); assert.equal(limit.retryAfter("198.51.100.1"), 0);
  for (let i=0;i<30;i++) limit.failure("198.51.100.1");
  assert.equal(limit.retryAfter("198.51.100.1"), 60);
  now += 15*60000; assert.equal(limit.retryAfter("198.51.100.1"), 0);
});
test("trusted Traefik XFF uses appended IP and cannot be bypassed by spoofing the prefix", () => {
  assert.equal(loginClientIp(new Headers({"x-forwarded-for":"spoofed, 198.51.100.20"}), true), "198.51.100.20");
  assert.equal(loginClientIp(new Headers({"x-forwarded-for":"198.51.100.1, 198.51.100.20"}), true), "198.51.100.20");
  assert.equal(loginClientIp(new Headers({"x-forwarded-for":"2001:db8::1"}), true), "2001:db8::1");
  assert.equal(loginClientIp(new Headers({"x-forwarded-for":"bad"}), true), "invalid-ingress");
  assert.equal(loginClientIp(new Headers({"x-forwarded-for":"198.51.100.1"}), false), "untrusted-ingress");
});
test("login route limits one client, allows another and returns Retry-After", async () => {
  const saved = { ...process.env };
  Object.assign(process.env, { SENIOR_GATEWAY_TOKEN: "fixture-".repeat(8), SENIOR_WEB_PASSWORD: "fixture-password-123456789", SENIOR_SESSION_SECRET: "fixture-secret-".repeat(4), SENIOR_TRUST_PROXY: "true" });
  const request = (ip: string, password: string) => new NextRequest("https://senior.test/api/auth", {
    method: "POST", headers: {host:"senior.test",origin:"https://senior.test","x-forwarded-for":ip,"content-type":"application/json"}, body: JSON.stringify({password}),
  });
  try {
    for(let i=0;i<5;i++) assert.equal((await POST(request("203.0.113.1","wrong"))).status,401);
    const blocked=await POST(request("spoofed, 203.0.113.1","wrong"));
    assert.equal(blocked.status,429); assert.equal(blocked.headers.get("retry-after"),"1");
    const good=await POST(request("203.0.113.2",process.env.SENIOR_WEB_PASSWORD!));
    assert.equal(good.status,200); assert.match(good.headers.get("set-cookie")!,/HttpOnly/);
  } finally { for(const key of Object.keys(process.env)) if(!(key in saved)) delete process.env[key]; Object.assign(process.env,saved); }
});

test("web adds HSTS to HTTPS responses routed by Traefik", async () => {
  const rules = await nextConfig.headers!();
  assert.ok(rules.some(rule => rule.headers.some(header => header.key === "Strict-Transport-Security" && header.value === "max-age=31536000")));
});
