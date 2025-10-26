import React, { useState, useEffect } from "react";
import { useRoomContext, useVoiceAssistant } from "@livekit/components-react";
import { usePartyState } from "@/hooks/usePartyState";
import { ArrowLeftRight, Mic, MicOff } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LeaveButton from "@/components/controls/leave-button";
import CaptionsToggle from "@/components/controls/captions-toggle";

interface Language {
  code: string;
  name: string;
  flag: string;
}

const SingleUserControls = () => {
  const room = useRoomContext();
  const { agent } = useVoiceAssistant();
  const { state, dispatch } = usePartyState();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  // Fetch available languages
  useEffect(() => {
    async function getLanguages() {
      const maxRetries = 5;
      const retryDelay = 1000;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }

          const response = await room.localParticipant.performRpc({
            destinationIdentity: "agent",
            method: "get/languages",
            payload: "",
            responseTimeout: 5000,
          });
          const languages = JSON.parse(response);
          setLanguages(languages);
          return;
        } catch (error) {
          console.warn(
            `RPC call attempt ${attempt + 1}/${maxRetries} failed:`,
            error
          );
          if (attempt === maxRetries - 1) {
            console.error("RPC call failed after all retries");
          }
        }
      }
    }

    if (agent) {
      getLanguages();
    }
  }, [room, agent]);

  // Update participant attributes when languages change
  useEffect(() => {
    const updateAttributes = async () => {
      try {
        // In single mode, show the output language as captions
        // (the language the current speaker will hear)
        const captionsLang =
          state.currentSpeaker === "user1"
            ? state.outputLanguage
            : state.inputLanguage;

        // Update local captions language
        dispatch({ type: "SET_CAPTIONS_LANGUAGE", payload: captionsLang });

        // Only update if we have an agent connection
        if (agent) {
          await room.localParticipant.setAttributes({
            captions_language: captionsLang,
            input_language: state.inputLanguage,
            output_language: state.outputLanguage,
            current_speaker: state.currentSpeaker,
            mode: "single",
          });
        } else {
          console.log("Agent not connected yet, will retry when agent connects");
        }
      } catch (error) {
        console.warn("Failed to update attributes:", error);
      }
    };

    if (state.inputLanguage && state.outputLanguage) {
      updateAttributes();
    }
  }, [
    state.inputLanguage,
    state.outputLanguage,
    state.currentSpeaker,
    room.localParticipant,
    dispatch,
    agent,
  ]);

  const handleInputLanguageChange = (value: string) => {
    dispatch({ type: "SET_INPUT_LANGUAGE", payload: value });
  };

  const handleOutputLanguageChange = (value: string) => {
    dispatch({ type: "SET_OUTPUT_LANGUAGE", payload: value });
  };

  const handleFlip = () => {
    dispatch({ type: "FLIP_LANGUAGES" });
  };

  const toggleMic = async () => {
    if (room.localParticipant) {
      await room.localParticipant.setMicrophoneEnabled(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const getCurrentLanguageName = (code: string) => {
    const lang = languages.find((l) => l.code === code);
    return lang ? `${lang.flag} ${lang.name}` : code;
  };

  const currentSpeakerLabel =
    state.currentSpeaker === "user1" ? "Speaker 1" : "Speaker 2";

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Current Speaker Indicator */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 border border-blue-500/50">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-blue-400">
              {currentSpeakerLabel} is speaking
            </span>
          </div>
        </div>

        {/* Language Selection and Flip Button */}
        <div className="flex items-center justify-center gap-4 mb-4">
          {/* Input Language (Current Speaker's Language) */}
          <div className="flex-1 max-w-xs">
            <label className="block text-xs text-gray-400 mb-2">
              {state.currentSpeaker === "user1"
                ? "Your Language (Input)"
                : "Their Language"}
            </label>
            <Select
              value={state.inputLanguage}
              onValueChange={handleInputLanguageChange}
            >
              <SelectTrigger className="w-full bg-white/5 border-white/10 text-white">
                <SelectValue>
                  {getCurrentLanguageName(state.inputLanguage)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Flip Button */}
          <button
            onClick={handleFlip}
            className="mt-6 p-4 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 transition-all hover:scale-110 shadow-lg hover:shadow-blue-500/50"
            title="Flip languages and switch speaker"
          >
            <ArrowLeftRight className="h-6 w-6 text-white" />
          </button>

          {/* Output Language (Translation Target) */}
          <div className="flex-1 max-w-xs">
            <label className="block text-xs text-gray-400 mb-2">
              {state.currentSpeaker === "user1"
                ? "Their Language"
                : "Your Language (Input)"}
            </label>
            <Select
              value={state.outputLanguage}
              onValueChange={handleOutputLanguageChange}
            >
              <SelectTrigger className="w-full bg-white/5 border-white/10 text-white">
                <SelectValue>
                  {getCurrentLanguageName(state.outputLanguage)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-center gap-4">
          {/* Mic Toggle */}
          <button
            onClick={toggleMic}
            className={`p-3 rounded-full transition-all ${
              isMuted
                ? "bg-red-500/20 hover:bg-red-500/30"
                : "bg-white/10 hover:bg-white/20"
            }`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <MicOff className="h-5 w-5 text-red-400" />
            ) : (
              <Mic className="h-5 w-5 text-white" />
            )}
          </button>

          {/* Captions Toggle */}
          <CaptionsToggle />

          {/* Leave Button */}
          <LeaveButton />
        </div>
      </div>
    </div>
  );
};

export default SingleUserControls;
