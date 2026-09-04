import localFont from "next/font/local";

/**
 * Display — Archivo Variable (weight + width axes). The width axis is the one
 * bold move on the site: it animates on load and on hover, never opacity.
 */
export const archivo = localFont({
  src: [
    {
      path: "../fonts/Archivo-Variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-archivo",
  display: "swap",
  preload: true,
  // Next generates a metric-matched Arial fallback, so the swap does not
  // reflow the 14vw name (§2.4).
  adjustFontFallback: "Arial",
});

/** Body — Switzer. 16px base, 1.6 line-height, 68ch measure. */
export const switzer = localFont({
  src: [
    {
      path: "../fonts/Switzer-Variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-switzer",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
});

/** Data — JetBrains Mono. Numbers, table cells, chart labels, file paths. */
export const jetbrainsMono = localFont({
  src: [
    {
      path: "../fonts/JetBrainsMono-Variable.woff2",
      weight: "100 800",
      style: "normal",
    },
  ],
  variable: "--font-jetbrains",
  display: "swap",
  // Preloaded after all. Mono sets the role, location, and clock line directly
  // under the name, and letting that swap late moved the block enough to show
  // up as layout shift. At 30 KB subset it is worth the critical bytes.
  preload: true,
  adjustFontFallback: false,
  fallback: [
    "ui-monospace",
    "SFMono-Regular",
    "Menlo",
    "Consolas",
    "monospace",
  ],
});

export const fontVariables = [
  archivo.variable,
  switzer.variable,
  jetbrainsMono.variable,
].join(" ");
