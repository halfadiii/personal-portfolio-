"use client";

import { toast } from "sonner";

/** §6.9 — click to copy, with a Sonner toast reading "Email copied". */
export function CopyEmail({ email }: { email: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied");
    } catch {
      toast.error(`Copying was blocked. The address is ${email}.`);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="group label-mono border-hairline text-signal ease-brief hover:border-signal flex items-center gap-3 border px-4 py-3 transition-colors duration-[var(--dur-ui)]"
    >
      <span>{email}</span>
      <span className="text-steel ease-brief group-hover:text-signal transition-colors duration-[var(--dur-ui)]">
        Copy email
      </span>
    </button>
  );
}
