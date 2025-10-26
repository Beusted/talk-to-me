"use client";

import React, { useReducer, use, useEffect } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import Party from "@/components/party";
import { State, reducer, PartyStateContext } from "@/hooks/usePartyState";

type PartyIdType = { party_id: string };

type SinglePageProps = {
  params: Promise<PartyIdType>;
};

// Initial state for single-user mode
const initialState: State = {
  token: undefined,
  serverUrl: "",
  shouldConnect: false,
  captionsEnabled: true,
  captionsLanguage: "en",
  isHost: true, // Always host in single mode (both users speak)
  mode: "single",
  currentSpeaker: "user1",
  inputLanguage: "en",
  outputLanguage: "es",
};

// SinglePage component
export default function SinglePage({ params }: SinglePageProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { party_id } = use<PartyIdType>(params);

  // Auto-connect in single mode (no lobby)
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const params = new URLSearchParams({
          party_id: party_id,
          name: "single-user",
          host: "true", // Always allow publishing in single mode
          color: "#3B82F6", // Default blue color
        });

        const response = await fetch(`/api/token?${params.toString()}`);

        if (!response.ok) {
          throw new Error("Failed to fetch token");
        }

        const data = await response.json();

        dispatch({ type: "SET_TOKEN", payload: data.token });
        dispatch({ type: "SET_SERVER_URL", payload: data.serverUrl });
        dispatch({ type: "SET_SHOULD_CONNECT", payload: true });
      } catch (error) {
        console.error("Error fetching token:", error);
      }
    };

    fetchToken();
  }, [party_id, dispatch]);

  return (
    <PartyStateContext.Provider value={{ state, dispatch }}>
      <LiveKitRoom
        token={state.token}
        serverUrl={state.serverUrl}
        connect={state.shouldConnect}
        audio={true} // Always enable audio in single mode
        className="w-full h-full"
      >
        {state.shouldConnect && <Party partyId={party_id} />}
      </LiveKitRoom>
    </PartyStateContext.Provider>
  );
}
