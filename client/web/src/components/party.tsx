"use client";

import {
  useRoomContext,
  useParticipants,
  RoomAudioRenderer,
  useRemoteParticipants,
} from "@livekit/components-react";
import {
  Participant,
  TrackPublication,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  RemoteAudioTrack,
} from "livekit-client";
import { Headphones } from "react-feather";
import HostControls from "@/components/host-controls";
import ListenerControls from "@/components/listener-controls";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import CircleVisualizer from "./circle-visualizer";
import { usePartyState } from "@/hooks/usePartyState";
import { useTranscriptionsByParticipant } from "@/hooks/useTranscriptions";

interface PartyProps {
  partyId: string;
}

export default function Party({ partyId }: PartyProps) {
  const [host, setHost] = useState<Participant | undefined>();

  const room = useRoomContext();
  const participants = useParticipants();
  const remoteParticipants = useRemoteParticipants();
  const { state } = usePartyState();
  const transcriptsByParticipant = useTranscriptionsByParticipant(state.captionsLanguage);

  useEffect(() => {
    const host = participants.find((p) => {
      return p.permissions?.canPublish;
    });
    if (host) {
      setHost(host);
    }

    // Debug: log all participants
    console.log("[Debug] All participants:", participants.map(p => ({
      identity: p.identity,
      isLocal: p.isLocal,
      audioTracks: Array.from(p.audioTrackPublications.values() as IterableIterator<TrackPublication>).map(pub => ({
        trackName: pub.trackName,
        trackSid: pub.trackSid,
        isSubscribed: pub.isSubscribed
      }))
    })));
  }, [participants]);

  // Listen for track published events
  useEffect(() => {
    if (!room) return;

    const handleTrackPublished = (publication: TrackPublication, participant: Participant) => {
      console.log(`[Track Published] Participant: ${participant.identity}, Track: ${publication.trackName}, Kind: ${publication.kind}`);
    };

    const handleTrackSubscribed = (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log(`[Track Subscribed] Participant: ${participant.identity}, Track: ${publication.trackName}, Kind: ${track.kind}`);
    };

    room.on("trackPublished", handleTrackPublished);
    room.on("trackSubscribed", handleTrackSubscribed);

    return () => {
      room.off("trackPublished", handleTrackPublished);
      room.off("trackSubscribed", handleTrackSubscribed);
    };
  }, [room]);

  // Custom audio handling: only play TTS audio for listeners
  useEffect(() => {
    if (!room || !host) return;

    const isHost = host === room.localParticipant;
    const setRemoteTrackMuted = (
      publication: RemoteTrackPublication,
      muted: boolean,
      trackName: string
    ) => {
      const audioTrack = publication.audioTrack as RemoteAudioTrack | undefined;

      if (!audioTrack) {
        console.log(
          `[Audio Filter] Remote audio track not ready to ${
            muted ? "mute" : "unmute"
          }: ${trackName}`
        );
        return;
      }

      audioTrack.setVolume(muted ? 0 : 1);
      audioTrack.attachedElements.forEach((element) => {
        element.muted = muted;
      });
    };

    const handleTrackMuting = () => {
      // Subscribe to all remote participants' tracks
      remoteParticipants.forEach((participant) => {
        participant.audioTrackPublications.forEach((publication) => {
          const trackName = publication.trackName;
          const participantIdentity = participant.identity;

          console.log(`[Audio Filter] Participant: ${participantIdentity}, Track: ${trackName}, Subscribed: ${publication.isSubscribed}, HasTrack: ${!!publication.audioTrack}, IsHost: ${isHost}`);

          if (isHost) {
            // Host: mute all remote audio (shouldn't hear their own voice back or TTS)
            if (publication.audioTrack) {
              setRemoteTrackMuted(publication, true, trackName);
              console.log(`[Audio Filter] Muted for host: ${trackName}`);
            }
          } else {
            // Listener: play audio from agent participant (TTS), mute audio from host
            if (participantIdentity === "agent") {
              console.log(`[Audio Filter] Found agent track: ${trackName}`);
              if (publication.audioTrack) {
                setRemoteTrackMuted(publication, false, trackName);
                console.log(`[Audio Filter] UNMUTED agent TTS track: ${trackName}`);
              } else {
                console.log(`[Audio Filter] Agent track not ready yet: ${trackName}`);
              }
            } else {
              // Mute the original speaker audio from the host
              if (publication.audioTrack) {
                setRemoteTrackMuted(publication, true, trackName);
                console.log(`[Audio Filter] Muted host track: ${trackName}`);
              }
            }
          }
        });
      });
    };

    // Run immediately
    handleTrackMuting();

    // Also listen for track subscription changes
    const handleTrackSubscribed = () => {
      console.log("[Audio Filter] Track subscription changed, reapplying filters");
      handleTrackMuting();
    };

    room.on("trackSubscribed", handleTrackSubscribed);

    return () => {
      room.off("trackSubscribed", handleTrackSubscribed);
    };
  }, [room, remoteParticipants, host]);

  return (
    <div className="w-full h-full p-8 flex flex-col relative">
      <div className="flex flex-col justify-between h-full w-full">
        <div className="flex justify-between">
          <div className="flex flex-col">
            <p>Listening Party</p>
            <h1 className="font-bold">{ partyId }</h1>
          </div>
          <div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="uppercase bg-[#E71A32] font-bold text-white"
              >
                Live
              </Button>
              <Button variant="outline">
                <Headphones />
                <p>{participants.length}</p>
              </Button>
            </div>
          </div>
        </div>
        {host === room.localParticipant ? (
          <HostControls />
        ) : (
          <ListenerControls />
        )}
      </div>
      <div className="absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]">
        <div className="flex flex-col items-center relative gap-24">
          {/* Active speakers as circles with per-person transcript bubbles */}
          <div className="flex flex-wrap items-center justify-center gap-6 max-w-[1000px]">
            {participants
              .filter((p) => p.identity !== "agent")
              .map((p) => (
                <CircleVisualizer
                  key={p.sid ?? p.identity}
                  speaker={p}
                  size={125}
                  threshold={0.05}
                  transcript={transcriptsByParticipant[p.sid]}
                />
              ))}
          </div>
        </div>
      </div>
      <RoomAudioRenderer />
    </div>
  );
}
