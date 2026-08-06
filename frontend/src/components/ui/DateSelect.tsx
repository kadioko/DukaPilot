"use client";

import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";

interface DateSelectProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  lang: Lang;
  required?: boolean;
  className?: string;
}

const SELECT_CLASS = "min-w-0 rounded-xl border border-gray-300 bg-white px-2 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 sm:text-sm";

function readParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? { year: match[1], month: match[2], day: match[3] } : { year: "", month: "", day: "" };
}

export default function DateSelect({ value, onChange, label, lang, required = false, className = "" }: DateSelectProps) {
  const initial = readParts(value);
  const [day, setDay] = useState(initial.day);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const previousValue = useRef(value);
  const currentYear = new Date().getFullYear();
  const daysInMonth = month ? new Date(Number(year || currentYear), Number(month), 0).getDate() : 31;

  useEffect(() => {
    if (value) {
      const next = readParts(value);
      setDay(next.day);
      setMonth(next.month);
      setYear(next.year);
    } else if (previousValue.current) {
      setDay("");
      setMonth("");
      setYear("");
    }
    previousValue.current = value;
  }, [value]);

  function update(nextDay: string, nextMonth: string, nextYear: string) {
    const maxDay = nextMonth ? new Date(Number(nextYear || currentYear), Number(nextMonth), 0).getDate() : 31;
    const safeDay = nextDay && Number(nextDay) > maxDay ? String(maxDay).padStart(2, "0") : nextDay;
    setDay(safeDay);
    setMonth(nextMonth);
    setYear(nextYear);
    onChange(safeDay && nextMonth && nextYear ? `${nextYear}-${nextMonth}-${safeDay}` : "");
  }

  const months = lang === "sw"
    ? ["Januari", "Februari", "Machi", "Aprili", "Mei", "Juni", "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba"]
    : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className="mb-1 text-sm font-medium text-gray-700">{label}</legend>
      <div className="grid grid-cols-[0.75fr_1.4fr_1fr] gap-2">
        <label className="grid min-w-0 gap-1 text-xs text-gray-500">
          <span>{lang === "sw" ? "Siku" : "Day"}</span>
          <select aria-label={`${label}: ${lang === "sw" ? "siku" : "day"}`} required={required} value={day} onChange={(event) => update(event.target.value, month, year)} className={SELECT_CLASS}>
            <option value="">--</option>
            {Array.from({ length: daysInMonth }, (_, index) => String(index + 1).padStart(2, "0")).map((item) => <option key={item} value={item}>{Number(item)}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs text-gray-500">
          <span>{lang === "sw" ? "Mwezi" : "Month"}</span>
          <select aria-label={`${label}: ${lang === "sw" ? "mwezi" : "month"}`} required={required} value={month} onChange={(event) => update(day, event.target.value, year)} className={SELECT_CLASS}>
            <option value="">--</option>
            {months.map((name, index) => <option key={name} value={String(index + 1).padStart(2, "0")}>{name}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs text-gray-500">
          <span>{lang === "sw" ? "Mwaka" : "Year"}</span>
          <select aria-label={`${label}: ${lang === "sw" ? "mwaka" : "year"}`} required={required} value={year} onChange={(event) => update(day, month, event.target.value)} className={SELECT_CLASS}>
            <option value="">----</option>
            {Array.from({ length: 16 }, (_, index) => String(currentYear - 5 + index)).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
