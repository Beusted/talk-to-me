import React, { useState, useEffect } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRoomContext, useVoiceAssistant } from "@livekit/components-react";
import { usePartyState } from "@/hooks/usePartyState";
import { ConnectionState } from "livekit-client";

interface Language {
  code: string;
  name: string;
  flag: string;
}

const LanguageSelect = () => {
  const room = useRoomContext();
  const { agent } = useVoiceAssistant();
  const { state, dispatch } = usePartyState();
  const [languages, setLanguages] = useState<Language[]>([]);

  const handleChange = async (value: string) => {
    dispatch({
      type: "SET_CAPTIONS_LANGUAGE",
      payload: value,
    });
    await room.localParticipant.setAttributes({
      captions_language: value,
    });
  };

  useEffect(() => {
    async function getLanguages() {
      // Retry logic: agent might not be ready immediately
      const maxRetries = 5;
      const retryDelay = 1000; // 1 second

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Add a small delay before first attempt to let agent initialize
          if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }

          const response = await room.localParticipant.performRpc({
            destinationIdentity: "agent",
            method: "get/languages",
            payload: "",
            responseTimeout: 5000, // 5 second timeout
          });
          const languages = JSON.parse(response);
          setLanguages(languages);
          return; // Success, exit retry loop
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

  return (
    <div className="flex items-center">
      <Select
        value={state.captionsLanguage}
        onValueChange={handleChange}
        disabled={!state.captionsEnabled}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Captions language" />
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
  );
};

export default LanguageSelect;
