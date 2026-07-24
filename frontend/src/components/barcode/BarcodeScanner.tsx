"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Keyboard, X } from "lucide-react";

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState("");
  const [message, setMessage] = useState("Opening camera...");

  useEffect(() => {
    let controls: { stop: () => void } | undefined;
    let stopped = false;
    const stop = () => { stopped = true; controls?.stop(); };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage("This browser cannot open the camera. Enter the barcode below.");
        return;
      }
      try {
        if (!videoRef.current) return;
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        setMessage("Point your camera at a barcode");
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          videoRef.current,
          (result, _error, scanControls) => {
            const value = result?.getText()?.trim();
            if (!value || stopped) return;
            stopped = true;
            scanControls.stop();
            onDetected(value);
          },
        );
        if (stopped) controls.stop();
      } catch {
        setMessage("Camera permission was not granted. Enter the barcode below.");
      }
    })();
    return stop;
  }, [onDetected]);

  const submit = () => { if (manual.trim()) onDetected(manual.trim()); };
  return <div className="fixed inset-0 z-50 flex items-end bg-black/70 sm:items-center sm:justify-center p-3" role="dialog" aria-modal="true" aria-label="Scan barcode">
    <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3"><div className="flex items-center gap-2 font-semibold text-gray-900"><Camera className="h-5 w-5 text-brand-600" />Scan barcode</div><button onClick={onClose} aria-label="Close scanner" className="rounded p-2 text-gray-500"><X className="h-5 w-5" /></button></div>
      <div className="bg-black aspect-[4/3]"><video ref={videoRef} className="h-full w-full object-cover" muted playsInline /></div>
      <div className="space-y-3 p-4"><p className="text-sm text-gray-600">{message}</p><div className="flex gap-2"><label className="sr-only" htmlFor="manual-barcode">Barcode</label><input id="manual-barcode" autoFocus value={manual} onChange={(event) => setManual(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} placeholder="Enter barcode" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2" /><button onClick={submit} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white"><Keyboard className="h-4 w-4" />Use</button></div></div>
    </div>
  </div>;
}
