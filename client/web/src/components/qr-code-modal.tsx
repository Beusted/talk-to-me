"use client";

import QRCode from "react-qr-code";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";

interface QRCodeModalProps {
  url: string;
  size?: number;
}

export default function QRCodeModal({ url, size = 48 }: QRCodeModalProps) {
  return (
    <Dialog>
      {/* Small QR Code - Clickable Trigger */}
      <DialogTrigger asChild>
        <div
          className="cursor-pointer hover:opacity-80 transition-opacity shrink-0"
          title="Click to enlarge QR code"
        >
          <QRCode
            value={url}
            size={size}
            className="border-2 border-gray-200 rounded p-1 bg-white w-10 h-10 sm:w-12 sm:h-12"
            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
          />
        </div>
      </DialogTrigger>

      {/* Dialog Content */}
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-center text-base sm:text-lg">Scan to Join Party</DialogTitle>
          <DialogDescription className="sr-only">
            Scan this QR code to join the listening party
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 sm:gap-4 py-2 sm:py-4">
          <div className="w-full flex justify-center p-3 sm:p-4 bg-neutral-50 rounded-lg">
            <div className="w-full max-w-[240px] sm:max-w-[280px] aspect-square">
              <QRCode
                value={url}
                size={256}
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
              />
            </div>
          </div>
          <p className="text-xs sm:text-sm text-neutral-600 text-center break-all w-full">
            {url}
          </p>
        </div>
        <DialogFooter className="sm:justify-center">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
