import type { ThemeRegistration } from "shiki";
import vitesseBlack from "shiki/themes/vitesse-black.mjs";

/**
 * `vitesse-black`, with its comments made legible.
 *
 * `vitesse-black` is the one bundled theme with a true black ground, which is
 * what §4.1 asks for — anything tinted reads as a different surface. But it
 * draws comments in #758575 at 87% opacity, and on black that is 4.21:1, under
 * the 4.5:1 text of this size needs (§13).
 *
 * Nothing noticed for a month, because no comment sat in a code block that is
 * on screen when the page is audited: the ones in the stage panels are behind
 * a dialog. The first comment in a case study's own code block failed axe's
 * `color-contrast` at once. The same hue, opaque and a step lighter, is
 * 7.07:1. Both highlighters (the MDX one and `highlight.ts`) take the theme
 * from here so they cannot drift apart.
 */
const COMMENT = "#758575dd";
const LEGIBLE_COMMENT = "#8a9a8a";

export const codeTheme: ThemeRegistration = {
  ...vitesseBlack,
  tokenColors: vitesseBlack.tokenColors?.map((rule) =>
    rule.settings.foreground?.toLowerCase() === COMMENT
      ? { ...rule, settings: { ...rule.settings, foreground: LEGIBLE_COMMENT } }
      : rule,
  ),
};
