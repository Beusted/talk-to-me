import { Participant, Track } from "livekit-client";
import { useTrackVolume } from "@livekit/components-react";
import { useState, useEffect, useRef } from "react";

// Helpers
function parseColorFromMetadata(meta?: string | null): string | undefined {
  if (!meta) return undefined;
  try {
    const obj = JSON.parse(meta);
    if (typeof obj?.color === "string") return obj.color;
  } catch {
    // If metadata is just a color string
    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(meta)) return meta;
  }
  return undefined;
}

function textColorForBg(hex?: string): "#000" | "#fff" {
  if (!hex) return "#fff";
  const c = hex.replace("#", "");
  const bigint = parseInt(c.length === 3 ? c.split("").map((ch) => ch + ch).join("") : c, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000" : "#fff";
}

export interface CircleVisualizerProps {
  speaker: Participant;
  size?: number; // outer container size in px
  threshold?: number; // speaking threshold (0..1)
  showOnlyWhenSpeaking?: boolean;
}

export default function CircleVisualizer({
  speaker,
  size = 125,
  threshold = 0.05,
  showOnlyWhenSpeaking = false,
}: CircleVisualizerProps) {
  // Safely get the first audio publication (may be undefined for listeners)
  const pubs = Array.from(speaker.audioTrackPublications.values());
  const publication =
    pubs.find((p) => p.source === Track.Source.Microphone) ?? pubs[0];

  // Hook to track the current volume (falls back gracefully when no track)
  const volume = useTrackVolume({
    publication,
    source: Track.Source.Microphone,
    participant: speaker,
  });

  // State to control the smoothed volume, used for rendering
  const [smoothedVolume, setSmoothedVolume] = useState(0);

  // Ref to persist the latest smoothed volume across renders
  const lastVolumeRef = useRef(0);

  // Ref to store the most recent raw volume (updated on every volume change)
  const volumeRef = useRef(0);

  // Smoothing factor to control how aggressively the volume is smoothed
  const smoothingFactor = 0.1;

  // Update the volumeRef whenever the volume changes
  useEffect(() => {
    if (volume !== undefined) {
      volumeRef.current = volume; // Update ref with the latest volume
    }
  }, [volume]);

  // Main smoothing logic using an interval
  useEffect(() => {
    const interval = setInterval(() => {
      const currentVolume = volumeRef.current; // Get the latest volume
      const newVolume =
        smoothingFactor * currentVolume +
        (1 - smoothingFactor) * lastVolumeRef.current;

      lastVolumeRef.current = newVolume; // Update the ref for the next iteration
      setSmoothedVolume(newVolume); // Update state for rendering
    }, 25); // Update every 25ms

    return () => clearInterval(interval); // Cleanup interval on unmount
  }, [smoothingFactor]); // Only depends on the smoothing factor

  const isSpeaking = smoothedVolume > threshold;

  // If we only want to show active talkers, hide when below threshold
  if (showOnlyWhenSpeaking && !isSpeaking) {
    return null;
  }

  // Compute inner circle size to keep layout stable even for silent participants
  const innerSize = Math.round(size * (0.55 + Math.min(0.6, smoothedVolume)));

  // Color from participant metadata (fallback to black)
  const color = parseColorFromMetadata(speaker.metadata) ?? "#000000";
  const labelColor = textColorForBg(color);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <div
        style={{ width: `${innerSize}px`, height: `${innerSize}px`, backgroundColor: color }}
        className={`rounded-full flex items-center justify-center transition-all duration-75 ${isSpeaking ? "opacity-100 ring-2 ring-white" : "opacity-40"}`}
      >
        <div
          className="font-bold text-xs sm:text-sm truncate max-w-[90%] text-center px-2"
          style={{ color: labelColor }}
        >
          {speaker.identity}
        </div>
      </div>
    </div>
  );
}
