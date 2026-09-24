import type { Metadata } from "next";
import {
  Space_Grotesk,
  Inter,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { GatewayStatus } from "@/components/GatewayStatus";

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
    >
      <body className="min-h-full flex flex-col bg-ink text-paper">
        <header className="border-b border-line bg-panel/60 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xs text-mute">
                [
              </span>
              <span className="font-display text-lg font-medium tracking-tight text-paper">
                SENIOR
              </span>
              <span className="font-mono text-xs text-mute">
                ]
              </span>
            </div>

            <GatewayStatus />
          </div>
        </header>

        <main className="blueprint-grid flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
