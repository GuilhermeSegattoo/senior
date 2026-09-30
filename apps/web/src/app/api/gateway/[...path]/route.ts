import { NextRequest } from "next/server";
import { authenticated, configured, localDevelopment, sessionCookie, sameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!localDevelopment(request)) {
    if (!configured()) return Response.json({ error: "Servidor ainda não configurado para acesso seguro." }, { status: 503 });
    if (!authenticated(request.cookies.get(sessionCookie)?.value)) return Response.json({ error: "Entre no Senior para continuar." }, { status: 401 });
  }
  if (request.method !== "GET" && !sameOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const { path: segments } = await context.params;
  if (segments.some(x => !/^[a-zA-Z0-9_-]+$/.test(x))) return Response.json({ error: "Rota inválida." }, { status: 400 });
  const headers: Record<string, string> = {};
  if (process.env.SENIOR_GATEWAY_TOKEN) headers.authorization = `Bearer ${process.env.SENIOR_GATEWAY_TOKEN}`;
  const type = request.headers.get("content-type"); if (type) headers["content-type"] = type;
  const eventId = request.headers.get("last-event-id"); if (eventId) headers["last-event-id"] = eventId;
  let body: string | undefined;
  if (request.method !== "GET") {
    body = await request.text();
    if (body.length > 256 * 1024) return Response.json({ error: "Entrada muito grande." }, { status: 413 });
  }
  const url = `${process.env.SENIOR_API_URL || "http://127.0.0.1:4000"}/${segments.join("/")}${request.nextUrl.search}`;
  try {
    const upstream = await fetch(url, { method: request.method, headers, body, cache: "no-store", signal: request.signal });
    return new Response(upstream.body, { status: upstream.status, headers: {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store", "x-accel-buffering": "no",
    } });
  } catch { return Response.json({ error: "Gateway indisponível. Verifique o serviço do Senior." }, { status: 502 }); }
}
export const GET = proxy;
export const POST = proxy;
