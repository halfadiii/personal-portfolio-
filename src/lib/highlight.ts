import "server-only";
import { createHighlighter, type Highlighter } from "shiki";
import { codeTheme } from "./code-theme";

/**
 * Server-only Shiki. Snippets are highlighted at render time on the server and
 * shipped as HTML, so no highlighter reaches the client bundle (§2.7).
 *
 * The theme is `vitesse-black` with one colour changed; `code-theme.ts` has
 * which and why.
 */
const LANGS = ["python", "sql", "typescript", "bash", "yaml", "json"] as const;

let highlighterPromise: Promise<Highlighter> | undefined;

function getHighlighter() {
  highlighterPromise ??= createHighlighter({
    themes: [codeTheme],
    langs: [...LANGS],
  });
  return highlighterPromise;
}

export async function highlight(source: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter();
  const resolved = (LANGS as readonly string[]).includes(lang) ? lang : "text";
  return highlighter.codeToHtml(source, {
    lang: resolved,
    theme: codeTheme.name ?? "vitesse-black",
  });
}
