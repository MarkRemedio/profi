"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Controls returned by ZXing; only stop() is needed here. */
type ScannerControls = { stop: () => void };

type CameraOption = { deviceId: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Fires for every accepted scan. The dialog deliberately stays open so a
   * cashier can scan several items in a row, which is how a real till is used.
   */
  onDetected: (code: string) => void;
};

/**
 * Ignore repeats of the same barcode inside this window. The camera decodes
 * many frames per second, so one physical scan would otherwise fire dozens of
 * times and add a pile of duplicate items to the basket.
 */
const DUPLICATE_WINDOW_MS = 1500;

/** Short confirmation tone, so the cashier does not have to watch the screen. */
function playBeep() {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.08);
    oscillator.onended = () => ctx.close();
  } catch {
    // Audio is a nicety; never let it break a scan.
  }
}

export function BarcodeScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [lastCode, setLastCode] = useState("");

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  // Keep the newest callback without restarting the camera every render.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) {
      stopScanner();
      return;
    }

    let cancelled = false;

    async function start() {
      setStatus("starting");
      setErrorMessage("");

      // getUserMedia only exists on HTTPS and localhost. Without this check the
      // failure surfaces as an unhelpful "undefined is not a function".
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setErrorMessage(
          "Camera access needs a secure connection. Open the till over HTTPS, or use a USB scanner with the box above."
        );
        return;
      }

      try {
        // Loaded on demand so the decoder is not shipped to every page.
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;

        const video = videoRef.current;
        if (!video) {
          setStatus("error");
          setErrorMessage("Could not attach the camera preview. Close and reopen the scanner.");
          return;
        }

        const reader = new BrowserMultiFormatReader();

        // Labels are blank until permission is granted, so enumerate after the
        // reader has already prompted via decodeFromVideoDevice below.
        const chosen = deviceId ?? undefined;

        const controls = await reader.decodeFromVideoDevice(
          chosen,
          video,
          (result) => {
            if (!result) return; // NotFoundException on frames without a barcode
            const code = result.getText().trim();
            if (!code) return;

            const now = Date.now();
            const last = lastScanRef.current;
            if (last.code === code && now - last.at < DUPLICATE_WINDOW_MS) return;
            lastScanRef.current = { code, at: now };

            setLastCode(code);
            playBeep();
            onDetectedRef.current(code);
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setStatus("scanning");

        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setCameras(
          devices
            .filter((d) => d.kind === "videoinput")
            .map((d, index) => ({
              deviceId: d.deviceId,
              label: d.label || `Camera ${index + 1}`,
            }))
        );
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        const name = (error as { name?: string })?.name;
        setErrorMessage(
          name === "NotAllowedError"
            ? "Camera permission was blocked. Allow camera access for this site in your browser settings, then try again."
            : name === "NotFoundError"
              ? "No camera found on this device."
              : "Could not start the camera. Try again, or use a USB scanner with the box above."
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [open, deviceId, stopScanner]);

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex((c) => c.deviceId === deviceId);
    const next = cameras[(currentIndex + 1) % cameras.length];
    // Changing deviceId re-runs the effect, which stops the old stream first.
    setDeviceId(next.deviceId);
    setLastCode("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-2xl w-[94vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-indigo-600" />
            Scan with camera
          </DialogTitle>
          <DialogDescription>
            Hold a barcode steady in the frame. Items are added to the basket as they
            are read, so you can keep scanning.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
          />

          {status === "scanning" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-4/5 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}

          {status === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Starting camera…</p>
            </div>
          )}

          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
              <CameraOff className="h-7 w-7 text-slate-300" />
              <p className="text-sm text-slate-200">{errorMessage}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 truncate">
            {lastCode ? (
              <>
                Last read: <span className="font-mono text-slate-700">{lastCode}</span>
              </>
            ) : (
              "No barcode read yet."
            )}
          </p>

          <div className="flex items-center gap-2 shrink-0">
            {cameras.length > 1 && (
              <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={switchCamera}>
                <SwitchCamera className="h-4 w-4" />
                Switch
              </Button>
            )}
            <Button size="sm" className="rounded-lg" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
