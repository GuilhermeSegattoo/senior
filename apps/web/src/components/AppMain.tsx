"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function AppMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const canvas = pathname === "/canvas";
  return (
    <main className={canvas ? "relative min-h-0 flex-1 overflow-hidden" : "blueprint-grid min-h-0 flex-1 overflow-y-auto"}>
      {children}
    </main>
  );
}
