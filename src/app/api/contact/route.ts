import { NextResponse } from "next/server";
import { Resend } from "resend";
import { profile } from "@/content";
import { contactSchema } from "@/lib/contact-schema";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Contact POST. Zod runs here as well as on the client (§9), the honeypot is
 * checked before anything else, and the route is rate limited per address.
 *
 * RESEND_API_KEY and CONTACT_FROM are read at request time, not at module load,
 * so a build without them still succeeds — the route just reports that mail is
 * not configured instead of crashing the deployment.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`contact:${clientKey(request)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many messages from this address. Try again in an hour." },
      {
        status: 429,
        headers: {
          "retry-after": String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "The message body was not valid JSON." },
      { status: 400 },
    );
  }

  const parsed = contactSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Some fields did not validate.",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  // Honeypot filled: accept silently so the sender learns nothing.
  if (parsed.data.company) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM;
  if (!apiKey || !from) {
    console.warn(
      "[contact] RESEND_API_KEY or CONTACT_FROM is unset; message was not sent.",
    );
    return NextResponse.json(
      {
        error: `Mail is not configured on this deployment. Email ${profile.email} directly.`,
      },
      { status: 503 },
    );
  }

  const { name, email, message } = parsed.data;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: profile.email,
      replyTo: email,
      subject: `Portfolio — ${name}`,
      text: [
        `From: ${name} <${email}>`,
        `Received: ${new Date().toISOString()}`,
        "",
        message,
      ].join("\n"),
    });

    if (error) {
      console.error("[contact] resend rejected the message", error);
      return NextResponse.json(
        {
          error: `The mail provider rejected it. Email ${profile.email} directly.`,
        },
        { status: 502 },
      );
    }
  } catch (cause) {
    console.error("[contact] send failed", cause);
    return NextResponse.json(
      { error: `The message did not send. Email ${profile.email} directly.` },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
