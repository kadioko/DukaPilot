"use client";

import { useEffect, useState, createContext, useContext, useCallback, useRef } from "react";
import { Check, X, AlertTriangle, Info } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

// ── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

let _idCounter = 0;

// ── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = ++_idCounter;
    setToasts((prev) => [...prev.slice(-3), { id, message, variant }]); // max 4 visible
    const timer = setTimeout(() => dismiss(id), variant === "error" ? 5000 : 3000);
    timers.current.set(id, timer);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastBubble key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Individual bubble ─────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "bg-green-600 text-white",
  error:   "bg-red-600 text-white",
  warning: "bg-amber-500 text-white",
  info:    "bg-gray-800 text-white",
};

const VARIANT_ICON: Record<ToastVariant, React.ReactNode> = {
  success: <Check className="w-4 h-4 flex-shrink-0" />,
  error:   <X className="w-4 h-4 flex-shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 flex-shrink-0" />,
  info:    <Info className="w-4 h-4 flex-shrink-0" />,
};

function ToastBubble({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation on mount
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
        transition-all duration-300
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}
        ${VARIANT_STYLES[item.variant]}`}
      role="status"
    >
      {VARIANT_ICON[item.variant]}
      <span className="flex-1">{item.message}</span>
      <button
        onClick={() => onDismiss(item.id)}
        className="ml-1 opacity-70 hover:opacity-100 transition-opacity min-h-0 p-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
