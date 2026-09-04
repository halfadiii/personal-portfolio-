"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="label-mono border-hairline text-signal ease-brief hover:bg-signal hover:text-void border px-3 py-2 transition-colors duration-[var(--dur-ui)]"
    >
      Print
    </button>
  );
}
