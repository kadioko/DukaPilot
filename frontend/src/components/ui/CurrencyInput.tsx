"use client";

import { useRef, type InputHTMLAttributes } from "react";

type CurrencyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> & {
  value: string | number;
  onChange: (value: string) => void;
};

function formatGroupedInteger(value: string | number) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function CurrencyInput({ value, onChange, inputMode = "numeric", ...props }: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(raw: string, caret: number | null) {
    const digitsBeforeCaret = raw.slice(0, caret ?? raw.length).replace(/\D/g, "").length;
    const digits = raw.replace(/\D/g, "");
    onChange(digits);

    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const formatted = formatGroupedInteger(digits);
      let position = 0;
      let seenDigits = 0;
      if (digitsBeforeCaret > 0) {
        while (position < formatted.length && seenDigits < digitsBeforeCaret) {
          if (/\d/.test(formatted[position])) seenDigits += 1;
          position += 1;
        }
      }
      input.setSelectionRange(position, position);
    });
  }

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      inputMode={inputMode}
      value={formatGroupedInteger(value)}
      onChange={(event) => handleChange(event.currentTarget.value, event.currentTarget.selectionStart)}
    />
  );
}
