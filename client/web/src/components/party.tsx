"use client";

import {
  useRoomContext,
  useParticipants,
  RoomAudioRenderer,
  useRemoteParticipants,
} from "@livekit/components-react";
import { Participant, TrackPublication } from "livekit-client";
import { Headphones } from "react-feather";
import HostControls from "@/components/host-controls";
import ListenerControls from "@/components/listener-controls";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import CircleVisualizer from "./circle-visualizer";
import Captions from "@/components/captions";

export default function Party() {
  const [host, setHost] = useState<Participant | undefined>();

  const room = useRoomContext();
  const participants = useParticipants();
  const remoteParticipants = useRemoteParticipants();

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
      audioTracks: Array.from(p.audioTrackPublications.values()).map(pub => ({
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

    const handleTrackSubscribed = (track: MediaStreamTrack, publication: TrackPublication, participant: Participant) => {
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
              publication.audioTrack.setMuted(true);
              console.log(`[Audio Filter] Muted for host: ${trackName}`);
            }
          } else {
            // Listener: play audio from agent participant (TTS), mute audio from host
            if (participantIdentity === "agent") {
              console.log(`[Audio Filter] Found agent track: ${trackName}`);
              if (publication.audioTrack) {
                publication.audioTrack.setMuted(false);
                console.log(`[Audio Filter] UNMUTED agent TTS track: ${trackName}`);
              } else {
                console.log(`[Audio Filter] Agent track not ready yet: ${trackName}`);
              }
            } else {
              // Mute the original speaker audio from the host
              if (publication.audioTrack) {
                publication.audioTrack.setMuted(true);
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
            <h1 className="font-bold">Talk To Me - </h1>
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
        {host && (
          <div className="flex flex-col items-center relative gap-24">
            {/* Visualizer Container */}
            <div className="relative flex items-center justify-center w-[125px] h-[125px]">
              <CircleVisualizer speaker={host} />
            </div>

            {/* Transcript */}
            <Captions />
          </div>
        )}
      </div>
      <RoomAudioRenderer />
    </div>
  );
}
