import { NextRequest, NextResponse } from "next/server";
import { authenticated, configured, equalSecret, makeSession, sessionCookie, localDevelopment, sameOrigin } from "@/lib/server-auth";

let attempts = 0, windowStart = Date.now();
export async function GET(request: NextRequest) {
  return NextResponse.json({ authenticated: localDevelopment(request) || authenticated(request.cookies.get(sessionCookie)?.value), configured: configured() });
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  if (!configured()) return NextResponse.json({ error: "Configure senha, segredo de sessão e token no servidor." }, { status: 503 });
  if (Date.now() - windowStart > 60_000) { attempts = 0; windowStart = Date.now(); }
  if (++attempts > 10) return NextResponse.json({ error: "Aguarde um minuto antes de tentar novamente." }, { status: 429 });
  const raw = await request.text();
  if (raw.length > 4096) return NextResponse.json({ error: "Entrada inválida." }, { status: 413 });
  let password: unknown;
  try { password = JSON.parse(raw).password; } catch { return NextResponse.json({ error: "Entrada inválida." }, { status: 400 }); }
  if (typeof password !== "string" || !equalSecret(password, process.env.SENIOR_WEB_PASSWORD!)) return NextResponse.json({ error: "Senha inválida." }, { status: 401 });
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
