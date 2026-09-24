import type { Metadata } from "next";
import Link from "next/link";
import {
  Space_Grotesk,
  Inter,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { GatewayStatus } from "@/components/GatewayStatus";
import { ChiefChat } from "@/components/ChiefChat";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Senior",
  description:
    "Ambiente operacional de engenharia de software com agentes autônomos supervisionados.",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="flex h-screen flex-col overflow-hidden bg-ink text-paper"
        suppressHydrationWarning
      >
        <header className="shrink-0 border-b border-line bg-panel/60 backdrop-blur-sm">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-baseline gap-2">
              <Link
                href="/"
                className="flex items-baseline gap-2"
              >
                <span className="font-mono text-xs text-mute">
                  [
                </span>
                <span className="font-display text-lg font-medium tracking-tight text-paper">
                  SENIOR
                </span>
                <span className="font-mono text-xs text-mute">
                  ]
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-4">
              <Link
                href="/settings"
                className="font-mono text-[11px] uppercase tracking-wider text-mute hover:text-signal"
              >
                provedores
              </Link>

              <GatewayStatus />
            </div>
          </div>
        </header>

        <main className="blueprint-grid min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>

        <ChiefChat />
      </body>
    </html>
  );
}
