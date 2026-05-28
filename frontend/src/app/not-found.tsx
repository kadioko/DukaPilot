"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-sm">
        <div className="text-6xl font-bold text-green-600 mb-2">404</div>
        <h1 className="text-xl font-semibold text-gray-800 mb-2">
          Ukurasa haujapatikana
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Page not found. The page you are looking for does not exist.
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-green-600 text-white text-sm font-medium px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
        >
          Rudi kwenye Dashibodi
        </Link>
      </div>
    </div>
  );
}
