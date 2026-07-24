"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Keyboard, X } from "lucide-react";

type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> };
declare global { interface Window { BarcodeDetector?: new (options?: { formats?: string[] }) => Detector } }

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState("");
  const [message, setMessage] = useState("Opening camera...");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const stop = () => { stopped = true; cancelAnimationFrame(frame); stream?.getTracks().forEach((track) => track.stop()); };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.BarcodeDetector) {
        setMessage("Camera scanning is not supported here. Enter the barcode below.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new window.BarcodeDetector({ formats: ["ean_13", "upc_a", "upc_e", "code_128", "qr_code"] });
        setMessage("Point your camera at a barcode");
        const scan = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes[0]?.rawValue?.trim();
            if (value) { stop(); onDetected(value); return; }
          } catch { /* Low light and unsupported frames should not break manual fallback. */ }
          frame = requestAnimationFrame(scan);
        };
        frame = requestAnimationFrame(scan);
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
