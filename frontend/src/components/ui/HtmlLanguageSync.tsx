"use client";

import { useEffect } from "react";
import { useLang } from "@/lib/i18n";

export default function HtmlLanguageSync() {
  const lang = useLang();

  useEffect(() => {
    document.documentElement.lang = lang === "sw" ? "sw" : "en";
  }, [lang]);

  return null;
}
