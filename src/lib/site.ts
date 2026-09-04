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
  { id: "metrics", index: "02", label: "measured outcomes" },
  { id: "work", index: "03", label: "selected work" },
  { id: "experience", index: "04", label: "experience" },
  { id: "capabilities", index: "05", label: "capabilities" },
  { id: "off-clock", index: "06", label: "off the clock" },
  { id: "contact", index: "07", label: "contact" },
] as const;
