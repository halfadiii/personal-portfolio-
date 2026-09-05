import { profile } from "@/content";

/**
 * Deployment origin. Set NEXT_PUBLIC_SITE_URL in the hosting environment; the
 * localhost fallback keeps sitemap/OG generation working in development.
 */
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

export const site = {
  url: siteUrl,
  name: `${profile.name} — ${profile.role}`,
  shortName: profile.name,
  description: profile.positioning,
  locale: "en_US",
} as const;

/** `compact` items stay visible below 640px, where the row has ~185px to spend. */
export const nav = [
  { href: "/#work", label: "Work", compact: true },
  { href: "/#experience", label: "Experience", compact: false },
  { href: "/about", label: "About", compact: false },
  { href: "/resume", label: "Résumé", compact: true },
] as const;

export const sections = [
  { id: "hero", index: "01", label: "index" },
  { id: "work", index: "02", label: "selected work" },
  { id: "experience", index: "03", label: "experience" },
  { id: "capabilities", index: "04", label: "capabilities" },
  { id: "off-clock", index: "05", label: "off the clock" },
  { id: "contact", index: "06", label: "contact" },
] as const;
