import { useState } from "react";
import { usePartyState } from "@/hooks/usePartyState";
import { TokenResult } from "@/app/api/token/route";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckedState } from "@radix-ui/react-checkbox";

interface LobbyProps {
  partyId: string;
}

const PALETTE: string[] = [
  "#EF4444", "#F59E0B", "#FBBF24", "#84CC16", "#22C55E",
  "#10B981", "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6",
  "#A855F7", "#D946EF", "#EC4899", "#F43F5E", "#14B8A6",
  "#0EA5E9", "#60A5FA", "#34D399", "#F97316", "#EAB308",
];

export default function Lobby({ partyId }: LobbyProps) {
  const [name, setName] = useState<string>("");
  const [isHost, setIsHost] = useState<boolean>(false);
  const [color, setColor] = useState<string>(() => {
    const idx = Math.floor(Math.random() * PALETTE.length);
    return PALETTE[idx];
  });
  const { dispatch } = usePartyState();

  const onJoin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent the default form submission behavior

    try {
      // Fetch the token from the /api/token endpoint
      const response = await fetch(
        `/api/token?party_id=${encodeURIComponent(
          partyId
        )}&name=${encodeURIComponent(name)}&host=${isHost}&color=${encodeURIComponent(color)}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch token");
      }

      const data = (await response.json()) as TokenResult;

      dispatch({ type: "SET_TOKEN", payload: data.token });
      dispatch({ type: "SET_SERVER_URL", payload: data.serverUrl });
      dispatch({ type: "SET_IS_HOST", payload: isHost });
      dispatch({ type: "SET_SHOULD_CONNECT", payload: true });
    } catch (error) {
      console.error("Error:", error);
      // Handle error (e.g., show an error message to the user)
    }
  };

  const randomizeColor = () => {
    const idx = Math.floor(Math.random() * PALETTE.length);
    setColor(PALETTE[idx]);
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <Card>
        <form action="#" onSubmit={onJoin}>
          <CardHeader>
            <CardTitle>Join Party</CardTitle>
            <CardDescription>
              Join or create a party to chat or listen in
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col space-y-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Your display name in the party"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="items-top flex space-x-2">
              <Checkbox
                id="host"
                checked={isHost}
                onCheckedChange={(checked: CheckedState) =>
                  setIsHost(checked === "indeterminate" ? false : checked)
                }
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="host"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Party host
                </label>
              </div>
            </div>

            {/* Color picker */}
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <Label>Circle color</Label>
                <div className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded-full border"
                    style={{ backgroundColor: color }}
                    aria-label="Selected color preview"
                  />
                  <Button type="button" variant="outline" onClick={randomizeColor}>
                    Random
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-10 gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-7 rounded-full border ${c === color ? "ring-2 ring-offset-2 ring-black" : ""}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Select color ${c}`}
                  />
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button className="w-full">Join</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
