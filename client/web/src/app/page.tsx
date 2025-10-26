"use client";

import { useRouter } from "next/navigation";
import { Users, User } from "lucide-react";

// Utility to generate a random ID
function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export default function Home() {
  const router = useRouter();

  const handleModeSelect = (mode: "single" | "multi") => {
    const randomId = generateRandomId();
    if (mode === "single") {
      router.push(`/single/${randomId}`);
    } else {
      router.push(`/parties/${randomId}`);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Talk to Me</h1>
          <p className="text-gray-400">Real-time voice translation for face-to-face conversations</p>
        </div>

        <div className="space-y-4">
          {/* Single User Mode */}
          <button
            onClick={() => handleModeSelect("single")}
            className="w-full group relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 p-6 text-left transition-all hover:shadow-lg hover:shadow-blue-500/50 hover:scale-[1.02]"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-white/20 p-3">
                <User className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-white mb-1">
                  Single Conversation
                </h2>
                <p className="text-sm text-white/80">
                  Share one device. Take turns speaking and flip between two languages.
                </p>
              </div>
            </div>
          </button>

          {/* Multi User Mode */}
          <button
            onClick={() => handleModeSelect("multi")}
            className="w-full group relative overflow-hidden rounded-xl bg-gradient-to-r from-green-500 to-teal-600 p-6 text-left transition-all hover:shadow-lg hover:shadow-green-500/50 hover:scale-[1.02]"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-white/20 p-3">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-white mb-1">
                  Multi-User Party
                </h2>
                <p className="text-sm text-white/80">
                  Join with multiple devices. Everyone picks their language.
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
