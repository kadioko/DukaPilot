"use client";

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-semibold text-gray-800 mb-2">
          Hitilafu imetokea
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Something went wrong. Please try again or refresh the page.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="bg-green-600 text-white text-sm font-medium px-5 py-3 rounded-lg hover:bg-green-700 transition-colors"
          >
            Jaribu tena
          </button>
          <button
            onClick={() => (window.location.href = "/dashboard")}
            className="bg-gray-200 text-gray-700 text-sm font-medium px-5 py-3 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Rudi nyumbani
          </button>
        </div>
      </div>
    </div>
  );
}
