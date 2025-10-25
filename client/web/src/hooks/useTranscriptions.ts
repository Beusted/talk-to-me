"use client";

import { useEffect, useState } from "react";
import { RoomEvent, TranscriptionSegment } from "livekit-client";
import { useRoomContext } from "@livekit/components-react";

export type TranscriptionsByParticipant = Record<string, string>;

type SegmentWithSid = TranscriptionSegment & {
  participantSid?: string;
  speakerSid?: string;
  participant?: { sid?: string };
};

/**
 * Collect latest transcription text per participant (by participantSid),
 * optionally filtered by language code.
 */
export function useTranscriptionsByParticipant(language?: string) {
  const room = useRoomContext();
  const [byParticipant, setByParticipant] = useState<TranscriptionsByParticipant>({});

  useEffect(() => {
    const handle = (segments: TranscriptionSegment[]) => {
      setByParticipant((prev) => {
        const updated = { ...prev };
        for (const s of segments) {
          const seg = s as SegmentWithSid;
          // Filter by language if provided
          const lang = seg.language && seg.language !== "" ? seg.language : "en";
          if (language && lang !== language) continue;

          const psid = seg.participantSid || seg.speakerSid || seg.participant?.sid;
          if (!psid) continue;
          // Store latest text for this participant
          updated[psid] = seg.text;
        }
        return updated;
      });
    };

    room.on(RoomEvent.TranscriptionReceived, handle);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, handle);
    };
  }, [room, language]);

  return byParticipant;
}
