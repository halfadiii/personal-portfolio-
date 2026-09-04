import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const WORK_DIR = path.join(process.cwd(), "src", "content", "work");

export type CaseStudyMeta = {
  slug: string;
  title: string;
  hook: string;
  period: string;
  stack: string[];
  summary: string;
};

export type Heading = { id: string; text: string };

export type CaseStudy = {
  meta: CaseStudyMeta;
  body: string;
  headings: Heading[];
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Slugs of every MDX case study, in the order the files are named. */
export async function listCaseStudySlugs(): Promise<string[]> {
  const entries = await readdir(WORK_DIR).catch(() => [] as string[]);
  return entries
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx$/, ""))
    .sort();
}

export async function getCaseStudy(slug: string): Promise<CaseStudy | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;

  const file = path.join(WORK_DIR, `${slug}.mdx`);
  const raw = await readFile(file, "utf8").catch(() => null);
  if (raw === null) return null;

  const { content, data } = matter(raw);

  // Section headings for the sticky table of contents, taken from the source so
  // the list and the rendered anchors cannot drift apart.
  const headings: Heading[] = [];
  let inFence = false;
  for (const line of content.split("\n")) {
    if (line.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) headings.push({ id: slugify(match[1]), text: match[1] });
  }

  return {
    meta: {
      slug,
      title: String(data.title ?? slug),
      hook: String(data.hook ?? ""),
      period: String(data.period ?? ""),
      stack: Array.isArray(data.stack) ? data.stack.map(String) : [],
      summary: String(data.summary ?? data.hook ?? ""),
    },
    body: content,
    headings,
  };
}

export async function getAllCaseStudies(): Promise<CaseStudy[]> {
  const slugs = await listCaseStudySlugs();
  const studies = await Promise.all(slugs.map(getCaseStudy));
  return studies.filter((study): study is CaseStudy => study !== null);
}
