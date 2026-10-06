"use client";

import { createContext } from "react";
import type { CanvasCard } from "@/lib/canvas-layout";

export interface CanvasActions {
  close(id: string): void;
  patch(id: string, partial: Partial<Pick<CanvasCard, "title" | "note" | "sessionId">>): void;
}

export const CanvasActionsContext = createContext<CanvasActions | null>(null);
