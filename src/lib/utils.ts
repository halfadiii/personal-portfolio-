import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** `2024-03` -> `Mar 2024`; `present` passes through. */
export function formatMonth(iso: string): string {
  if (iso === "present") return "Present";
  const [year, month] = iso.split("-");
  const label = new Date(Number(year), Number(month) - 1, 1).toLocaleString(
    "en-US",
    { month: "short", timeZone: "UTC" },
  );
  return `${label} ${year}`;
}

/** `Jun 2022 – Mar 2024`, en dash, mono-friendly. */
export function formatRange(start: string, end: string): string {
  return `${formatMonth(start)} – ${formatMonth(end)}`;
}

/** Whole months between two `YYYY-MM` strings, inclusive of the start month. */
export function monthSpan(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

export function padIndex(index: number): string {
  return String(index).padStart(2, "0");
}
