import { useRoomContext } from "@livekit/components-react";
import { useState, useEffect } from "react";
import {
  TranscriptionSegment,
  RoomEvent,
} from "livekit-client";
import { usePartyState } from "@/hooks/usePartyState";

export default function Captions() {
  const room = useRoomContext();
  const { state } = usePartyState();
  const [transcriptions, setTranscriptions] = useState<{
    [language: string]: {
      [id: string]: TranscriptionSegment;
    };
  }>({});

  useEffect(() => {
    const updateTranscriptions = (
      segments: TranscriptionSegment[]
    ) => {
      setTranscriptions((prev) => {
        // Create a copy of the previous state
        const newTranscriptions = { ...prev };

        for (const segment of segments) {
          // Extract the language and id from the segment
          let { language } = segment;
          const { id } = segment;

          if (language === "") {
            language = "en";
          }

          // Ensure the language group exists
          if (!newTranscriptions[language]) {
            newTranscriptions[language] = {};
          }

          // Update or add the transcription segment in the correct group
          newTranscriptions[language][id] = segment;
        }

        return newTranscriptions;
      });
    };

    room.on(RoomEvent.TranscriptionReceived, updateTranscriptions);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, updateTranscriptions);
    };
  }, [room]);

  // In single mode, show both input and output languages
  if (state.mode === "single") {
    const inputSegments = Object.values(transcriptions[state.inputLanguage] || {})
      .sort((a, b) => a.firstReceivedTime - b.firstReceivedTime)
      .slice(-1);

    const outputSegments = Object.values(transcriptions[state.outputLanguage] || {})
      .sort((a, b) => a.firstReceivedTime - b.firstReceivedTime)
      .slice(-1);

    return (
      <div
        className={`text-center space-y-2${
          state.captionsEnabled ? " visible" : " invisible"
        }`}
      >
        {/* Input language (what was spoken) */}
        {inputSegments.length > 0 && (
          <div className="text-blue-400 text-2xl font-semibold">
            {inputSegments[0].text}
          </div>
        )}

        {/* Output language (translation) */}
        {outputSegments.length > 0 && (
          <div className="text-purple-400 text-3xl font-bold">
            {outputSegments[0].text}
          </div>
        )}
      </div>
    );
  }

  // Multi-user mode: show only selected language
  return (
    <ul
      className={`text-center${
        state.captionsEnabled ? " visible" : " invisible"
      }`}
    >
      {/* Safely access the transcriptions for the selected captionsLanguage */}
      {Object.values(transcriptions[state.captionsLanguage] || {})
        .sort((a, b) => a.firstReceivedTime - b.firstReceivedTime)
        .slice(-2)
        .map((segment, i, arr) => (
          <li
            key={segment.id}
            className={i === 0 && arr.length > 1 ? "opacity-50" : "opacity-100"}
          >
            {segment.text}
          </li>
        ))}
    </ul>
  );
}
