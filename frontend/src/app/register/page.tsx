"use client";
import { Suspense } from "react";
import { LoginPageContent } from "../page";

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent initialView="register" />
    </Suspense>
  );
}
