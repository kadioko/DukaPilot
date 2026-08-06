"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production") {
      window.localStorage.removeItem("__vercel_toolbar_injector");
    }
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    const checkForUpdate = () => registration?.update().catch(() => {});
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((nextRegistration) => {
        registration = nextRegistration;
        return nextRegistration.update();
      })
      .catch((err) => console.error("SW registration failed:", err));

    window.addEventListener("focus", checkForUpdate);
    return () => window.removeEventListener("focus", checkForUpdate);
  }, []);

  return null;
}
