"use client";

import { useEffect } from "react";
import { captureAttribution, trackMarketingEvent } from "@/lib/marketing";

export default function MarketingTracker() {
  useEffect(() => {
    captureAttribution();
    trackMarketingEvent("page_view", { path: window.location.pathname });
  }, []);

  return null;
}
