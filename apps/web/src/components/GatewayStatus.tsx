"use client";

import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api";

const POLL_INTERVAL_MS = 8000;

export function GatewayStatus() {
  const [online, setOnline] =
    useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const result =
        await fetchHealth();

      if (!cancelled) {
        setOnline(result);
      }
    };

    check();

    const interval = setInterval(
      check,
      POLL_INTERVAL_MS
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const label =
    online === null
      ? "verificando"
      : online
        ? "gateway online"
        : "gateway offline";

  const dotColor =
    online === null
      ? "bg-mute"
      : online
        ? "bg-ok"
        : "bg-danger";

  return (
    <div className="flex items-center gap-2 font-mono text-xs text-mute">
      <span
        className={`h-1.5 w-1.5 rounded-full ${dotColor} ${
          online ? "pulse-dot" : ""
        }`}
        aria-hidden="true"
      />

      <span>{label}</span>
    </div>
  );
}
