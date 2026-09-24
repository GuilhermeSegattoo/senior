"use client";

import { useState } from "react";
import { askChief } from "@/lib/api";

interface ChatMessage {
  role: "user" | "chief";
  text: string;
}

export function ChiefChat() {
  const [open, setOpen] =
    useState(false);

  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  const [input, setInput] =
    useState("");

  const [sending, setSending] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function handleSend(
    event: React.FormEvent
  ) {
    event.preventDefault();

    const trimmed = input.trim();

    if (!trimmed || sending) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        role: "user",
        text: trimmed,
      },
    ]);

    setInput("");
    setSending(true);
    setError(null);

    try {
      const response =
        await askChief(trimmed);

      setMessages((current) => [
        ...current,
        {
          role: "chief",
          text: response,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível falar com o Chief."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() =>
          setOpen((value) => !value)
        }
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-line bg-panel-raised px-4 py-3 font-mono text-xs uppercase tracking-wider text-paper shadow-lg transition-colors hover:border-signal hover:text-signal"
      >
        <span
          className="h-1.5 w-1.5 rounded-full bg-signal pulse-dot"
          aria-hidden="true"
        />
        {open ? "fechar" : "chief"}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[32rem] w-96 flex-col rounded-lg border border-line bg-panel-raised shadow-2xl">
          <div className="border-b border-line px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-wider text-mute">
              Chief
            </p>

            <p className="text-xs text-mute">
              Cross-project — fale
              sobre qualquer projeto.
            </p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length ===
              0 && (
              <p className="text-sm text-mute">
                Pergunte algo, ex:
                &quot;o que está
                rodando no
                Thumdra?&quot;
              </p>
            )}

            {messages.map(
              (message, index) => (
                <div
                  key={index}
                  className={
                    message.role ===
                    "user"
                      ? "text-right"
                      : ""
                  }
                >
                  <p
                    className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-md px-3 py-2 text-left text-sm ${
                      message.role ===
                      "user"
                        ? "bg-signal text-ink"
                        : "bg-panel text-paper"
                    }`}
                  >
                    {message.text}
                  </p>
                </div>
              )
            )}

            {sending && (
              <p className="font-mono text-xs text-mute">
                Chief está
                pensando…
              </p>
            )}
          </div>

          {error && (
            <p className="px-4 pb-2 text-xs text-danger">
              {error}
            </p>
          )}

          <form
            onSubmit={handleSend}
            className="flex gap-2 border-t border-line p-3"
          >
            <input
              type="text"
              value={input}
              onChange={(event) =>
                setInput(
                  event.target
                    .value
                )
              }
              placeholder="Fale com o Chief..."
              className="flex-1 rounded-md border border-line bg-ink px-3 py-2 text-sm text-paper outline-none placeholder:text-mute focus:border-signal"
            />

            <button
              type="submit"
              disabled={sending}
              className="rounded-md bg-signal px-3 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      )}
    </>
  );
}
