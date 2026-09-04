import { z } from "zod";

/** Validated identically on the client and on the server (§9). */
export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Tell me what to call you.")
    .max(120, "That name is longer than the form allows."),
  email: z
    .string()
    .trim()
    .min(1, "An email address is needed to reply.")
    .email("That address is missing an @ or a domain."),
  message: z
    .string()
    .trim()
    .min(20, "A little more detail — 20 characters at least.")
    .max(
      4000,
      "That message is over 4,000 characters. Trim it or email directly.",
    ),
  /** Honeypot. Real people leave it empty. */
  company: z.string().max(0).optional().or(z.literal("")),
});

export type ContactInput = z.infer<typeof contactSchema>;
