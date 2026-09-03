"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, MessageCircleWarning, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>) => void;
    };
  }
}

type Connection = {
  connected: boolean;
  message?: string;
  wabaId?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  isOnBusinessApp?: boolean;
  platformType?: string;
};

const appId = process.env.NEXT_PUBLIC_META_APP_ID || "";
const configId = process.env.NEXT_PUBLIC_META_WHATSAPP_COEXISTENCE_CONFIG_ID || "";

function loadFacebookSdk(): Promise<NonNullable<Window["FB"]>> {
  if (window.FB) return Promise.resolve(window.FB);
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("facebook-jssdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => window.FB ? resolve(window.FB) : reject(new Error("Facebook SDK did not load")), { once: true });
      existing.addEventListener("error", () => reject(new Error("Facebook SDK could not load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onload = () => window.FB ? resolve(window.FB) : reject(new Error("Facebook SDK did not load"));
    script.onerror = () => reject(new Error("Facebook SDK could not load"));
    document.body.appendChild(script);
  });
}

export default function WhatsAppCoexistencePanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState<Connection | null>(null);
  const codeRef = useRef("");
  const wabaIdRef = useRef("");

  async function complete(code: string, wabaId: string) {
    setBusy(true);
    setMessage("Verifying the connected number with Meta...");
    try {
      const result = await api.post<Connection>("/admin/whatsapp/coexistence/complete", { code, wabaId });
      setConnection(result);
      setMessage(result.connected ? "WhatsApp Business App coexistence is confirmed." : (result.message || "Meta has not confirmed coexistence yet."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Meta could not verify the connection.");
    } finally {
      setBusy(false);
      codeRef.current = "";
      wabaIdRef.current = "";
    }
  }

  useEffect(() => {
    function onMetaMessage(event: MessageEvent) {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      const data = payload as { type?: string; event?: string; data?: { waba_id?: string } };
      if (data?.type !== "WA_EMBEDDED_SIGNUP" || data.event !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") return;
      const wabaId = String(data.data?.waba_id || "");
      if (!wabaId) return;
      wabaIdRef.current = wabaId;
      if (codeRef.current) void complete(codeRef.current, wabaId);
      else setMessage("Connection approved. Finishing the secure Meta sign-in...");
    }
    window.addEventListener("message", onMetaMessage);
    return () => window.removeEventListener("message", onMetaMessage);
  }, []);

  async function start() {
    if (!appId || !configId) {
      setMessage("Add the Meta App ID and WhatsApp coexistence configuration ID in Vercel before starting.");
      return;
    }
    setBusy(true);
    setMessage("Opening Meta's secure connection flow...");
    try {
      const fb = await loadFacebookSdk();
      fb.init({ appId, cookie: true, xfbml: false, version: "v25.0" });
      fb.login((response) => {
        const code = String(response.authResponse?.code || "");
        if (!code) {
          setBusy(false);
          setMessage("The Meta connection was cancelled or did not return an authorization code.");
          return;
        }
        codeRef.current = code;
        if (wabaIdRef.current) void complete(code, wabaIdRef.current);
        else setMessage("Approve the connection in WhatsApp Business. DukaPilot will verify it when Meta finishes onboarding.");
      }, {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding" },
      });
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Meta's connection flow could not start.");
    }
  }

  const ready = Boolean(appId && configId);
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700"><MessageCircleWarning className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-semibold text-gray-950">WhatsApp Business App connection</h2>
            <p className="mt-1 text-xs leading-5 text-gray-600">Connect the existing DukaPilot business number to Cloud API without removing it from the WhatsApp Business app. This flow only supports Meta&apos;s Business App coexistence onboarding.</p>
          </div>
        </div>
        <button type="button" onClick={() => void start()} disabled={busy || !ready} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-green-700 px-3 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Connect existing WhatsApp Business app
        </button>
        {!ready && <p className="mt-2 text-xs text-amber-700">The browser configuration IDs are not deployed yet. The button stays disabled until they are added.</p>}
        {message && <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-700">{message}</p>}
      </section>
      {connection?.connected && (
        <section className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Coexistence verified</div>
          <p className="mt-2 text-xs">{connection.verifiedName || "WhatsApp number"} {connection.displayPhoneNumber ? `(${connection.displayPhoneNumber})` : ""} is on the Business App and Cloud API.</p>
          <p className="mt-1 font-mono text-[11px]">Phone ID: {connection.phoneNumberId} · WABA: {connection.wabaId}</p>
        </section>
      )}
    </div>
  );
}
