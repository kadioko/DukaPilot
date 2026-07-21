"use client";

import { useEffect } from "react";
import { captureAttribution, trackMarketingEvent } from "@/lib/marketing";

const PUBLIC_MARKETING_PATHS = new Set([
  "/",
  "/about",
  "/catalog",
  "/contact",
  "/demo",
  "/help",
  "/pricing",
  "/register",
]);

export default function MarketingTracker() {
  useEffect(() => {
    if (!PUBLIC_MARKETING_PATHS.has(window.location.pathname)) return;
    captureAttribution();
    trackMarketingEvent("page_view", { path: window.location.pathname });
  }, []);

  return null;
}
