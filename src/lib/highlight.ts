import "server-only";
import { createHighlighter, type Highlighter } from "shiki";

/**
 * Server-only Shiki. Snippets are highlighted at render time on the server and
 * shipped as HTML, so no highlighter reaches the client bundle (§2.7).
 *
 * `vitesse-black` is the one bundled theme with a true black ground, which is
 * what §4.1 asks for — anything tinted reads as a different surface.
 */
const LANGS = ["python", "sql", "typescript", "bash", "yaml", "json"] as const;

let highlighterPromise: Promise<Highlighter> | undefined;

function getHighlighter() {
  highlighterPromise ??= createHighlighter({
    themes: ["vitesse-black"],
    langs: [...LANGS],
  });
  return highlighterPromise;
}

export async function highlight(source: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter();
  const resolved = (LANGS as readonly string[]).includes(lang) ? lang : "text";
  return highlighter.codeToHtml(source, {
    lang: resolved,
    theme: "vitesse-black",
  });
}
