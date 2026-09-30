import { NextRequest, NextResponse } from "next/server";
import { authenticated, configured, equalSecret, makeSession, sessionCookie, localDevelopment, sameOrigin } from "@/lib/server-auth";

import { loginClientIp, loginRateLimit } from "@/lib/login-rate-limit";
export async function GET(request: NextRequest) {
  return NextResponse.json({ authenticated: localDevelopment(request) || authenticated(request.cookies.get(sessionCookie)?.value), configured: configured() });
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  if (!configured()) return NextResponse.json({ error: "Configure senha, segredo de sessão e token no servidor." }, { status: 503 });
  const ip = loginClientIp(request.headers);
  const retryAfter = loginRateLimit.retryAfter(ip);
  if (retryAfter) return NextResponse.json({ error: "Aguarde antes de tentar novamente." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  const raw = await request.text();
  if (raw.length > 4096) { loginRateLimit.failure(ip); return NextResponse.json({ error: "Entrada inválida." }, { status: 413 }); }
  let password: unknown;
  try { password = JSON.parse(raw).password; } catch { loginRateLimit.failure(ip); return NextResponse.json({ error: "Entrada inválida." }, { status: 400 }); }
  if (typeof password !== "string" || !equalSecret(password, process.env.SENIOR_WEB_PASSWORD!)) {
    loginRateLimit.failure(ip);
    return NextResponse.json({ error: "Senha inválida." }, { status: 401 });
  }
  loginRateLimit.success(ip);
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(sessionCookie, makeSession(), { httpOnly: true, sameSite: "strict", secure: process.env.SENIOR_COOKIE_SECURE !== "false", path: "/", maxAge: 12 * 3600 });
  return response;
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(sessionCookie, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
