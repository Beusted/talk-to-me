"use client";

import { useEffect, useMemo, useState } from "react";
import { RoomEvent, TranscriptionSegment } from "livekit-client";
import { useRoomContext } from "@livekit/components-react";
import { Button } from "@/components/ui/button";
import { Mode } from "@/hooks/usePartyState";

type SegmentWithMeta = TranscriptionSegment & {
  final?: boolean;
  participantSid?: string;
  speakerSid?: string;
  participant?: { sid?: string };
  firstReceivedTime?: number;
};

type LogItem = {
  id: string;
  text: string;
  language: string;
  participantSid?: string;
  time: number;
};

interface TranscriptLogProps {
  language?: string; // filter by language code (e.g. "en")
  mode?: Mode;
  inputLanguage?: string;
  outputLanguage?: string;
}

export default function TranscriptLog({
  language,
  mode = "multi",
  inputLanguage = "en",
  outputLanguage = "es",
}: TranscriptLogProps) {
  const room = useRoomContext();
  const [collapsed, setCollapsed] = useState(false);
  const [items, setItems] = useState<LogItem[]>([]);

  useEffect(() => {
    const handle = (segments: TranscriptionSegment[]) => {
      setItems((prev) => {
        const byId = new Map(prev.map((it) => [it.id, it]));
        for (const s of segments as SegmentWithMeta[]) {
          const lang = s.language && s.language !== "" ? s.language : "en";
          if (language && lang !== language) continue;

          // Only keep final segments for the log if available; otherwise, accept interim
          const isFinal = typeof s.final === "boolean" ? s.final : true;
          if (!isFinal) continue;

          const psid = s.participantSid || s.speakerSid || s.participant?.sid;
          const time = s.firstReceivedTime ?? Date.now();
          const existing = byId.get(s.id);

          const next: LogItem = {
            id: s.id,
            text: s.text,
            language: lang,
            participantSid: psid,
            time: existing ? existing.time : time,
          };
          byId.set(s.id, next);
        }
        // Sort by time and keep last 100
        const nextItems = Array.from(byId.values())
          .sort((a, b) => a.time - b.time)
          .slice(-100);
        return nextItems;
      });
    };

    room.on(RoomEvent.TranscriptionReceived, handle);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, handle);
    };
  }, [room, language]);

  const content = useMemo(() => {
    if (mode === "single") {
      // Group items by timestamp to pair translations
      const itemsByLang = items.reduce((acc, item) => {
        if (!acc[item.language]) {
          acc[item.language] = [];
        }
        acc[item.language].push(item);
        return acc;
      }, {} as Record<string, LogItem[]>);

      const inputItems = itemsByLang[inputLanguage] || [];
      const outputItems = itemsByLang[outputLanguage] || [];
      const maxLen = Math.max(inputItems.length, outputItems.length);

      return Array.from({ length: maxLen }).map((_, i) => {
        const inputItem = inputItems[i];
        const outputItem = outputItems[i];
        return (
          <li key={`pair-${i}`} className="text-sm leading-snug break-words border-b border-white/10 pb-2 mb-2">
            {inputItem && (
              <div className="mb-1">
                <span className="text-blue-400 text-xs uppercase font-semibold">{inputLanguage}: </span>
                <span>{inputItem.text}</span>
              </div>
            )}
            {outputItem && (
              <div>
                <span className="text-purple-400 text-xs uppercase font-semibold">{outputLanguage}: </span>
                <span>{outputItem.text}</span>
              </div>
            )}
          </li>
        );
      });
    }

    // Multi-user mode: original behavior
    return items.map((it) => (
      <li key={it.id} className="text-sm leading-snug break-words">
        {it.text}
      </li>
    ));
  }, [items, mode, inputLanguage, outputLanguage]);

  return (
    <div className="absolute right-0 top-0 h-full flex items-stretch">
      {/* Toggle handle when collapsed */}
      {collapsed ? (
        <div className="flex items-center h-full">
          <Button
            variant="outline"
            className="rounded-l-none rounded-r-none border-r-0"
            onClick={() => setCollapsed(false)}
            aria-label="Show transcript log"
          >
            Show Log
          </Button>
        </div>
      ) : null}

      {/* Panel */}
      {!collapsed && (
        <div className="w-80 h-full bg-black/70 text-white p-3 overflow-y-auto border-l border-white/10">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Transcript Log</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCollapsed(true)}
              aria-label="Hide transcript log"
            >
              Hide
            </Button>
          </div>
          <ul className="space-y-2">{content}</ul>
        </div>
      )}
    </div>
  );
}
