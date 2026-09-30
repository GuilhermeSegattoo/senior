"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ChiefChat() {
  const pathname = usePathname();
  if (pathname === "/assistant") return null;
  return <Link href="/assistant" className="fixed bottom-4 right-4 z-40 rounded-full border border-signal/50 bg-panel-raised px-4 py-3 text-xs text-signal shadow-lg">Falar com o Senior ↗</Link>;
}
