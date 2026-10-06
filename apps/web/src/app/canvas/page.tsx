import type { Metadata } from "next";
import { CanvasWorkspace } from "@/components/CanvasWorkspace";

export const metadata: Metadata = {
  title: "Quadro — Senior",
  description: "Quadro infinito com conversas, notas e agentes lado a lado.",
};

export default function CanvasPage() {
  return <CanvasWorkspace />;
}
