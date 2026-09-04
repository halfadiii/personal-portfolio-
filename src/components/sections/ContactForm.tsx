"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { contactSchema, type ContactInput } from "@/lib/contact-schema";
import { cn } from "@/lib/utils";

/**
 * §6.9 — the contact form. Zod validates here and again on the route (§9).
 * Errors say what broke and what to do (§10).
 */
export function ContactForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", message: "", company: "" },
  });

  async function onSubmit(values: ContactInput) {
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });

      if (response.status === 429) {
        toast.error(
          "Too many messages from this address. Try again in an hour.",
        );
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(
          body?.error ??
            "The message did not send. Email the address above instead.",
        );
        return;
      }

      setSent(true);
      reset();
      toast.success("Message sent. Reply usually lands within a day.");
    } catch {
      toast.error(
        "The network dropped the message. Email the address above instead.",
      );
    }
  }

  if (sent) {
    return (
      <div className="border-hairline border p-6">
        <p className="label-mono text-signal">Message sent</p>
        <p className="measure text-body text-steel mt-2">
          It landed. A reply usually follows within a day.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="label-mono border-hairline text-signal ease-brief hover:bg-signal hover:text-void mt-4 border px-3 py-2 transition-colors duration-[var(--dur-ui)]"
        >
          Write another
        </button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
    >
      <Field
        label="Name"
        error={errors.name?.message}
        input={
          <input
            {...register("name")}
            type="text"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            className={inputClass}
          />
        }
      />

      <Field
        label="Email"
        error={errors.email?.message}
        input={
          <input
            {...register("email")}
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            className={inputClass}
          />
        }
      />

      <Field
        label="Message"
        error={errors.message?.message}
        input={
          <textarea
            {...register("message")}
            rows={6}
            aria-invalid={Boolean(errors.message)}
            className={cn(inputClass, "resize-y")}
          />
        }
      />

      {/* Honeypot — visually and semantically hidden from real users. */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor="company">Company</label>
        <input
          {...register("company")}
          id="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="label-mono border-signal text-signal ease-brief hover:bg-signal hover:text-void w-fit border px-5 py-3 transition-colors duration-[var(--dur-ui)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full border border-hairline bg-panel px-4 py-3 font-sans text-body text-signal transition-colors duration-[var(--dur-ui)] ease-brief placeholder:text-steel hover:border-steel focus-visible:border-signal aria-[invalid=true]:border-signal";

function Field({
  label,
  error,
  input,
}: {
  label: string;
  error?: string;
  input: React.ReactElement;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label-mono text-signal">{label}</span>
      {input}
      {/* §4.1 — colour is reserved for data, so an error is marked by weight
          and a mono prefix, never by turning the field red. */}
      {error ? (
        <span role="alert" className="label-mono text-signal">
          error — {error}
        </span>
      ) : null}
    </label>
  );
}
