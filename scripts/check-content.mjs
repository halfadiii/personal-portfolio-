/**
 * §5.6 — surface a build-time warning if any TODO string ships to production.
 *
 * Runs as `prebuild`. Warns loudly by default so local builds still complete;
 * pass --strict (or set STRICT_CONTENT=1, which CI does) to make an unresolved
 * TODO a hard failure, which is the §12 acceptance gate.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = new URL("../src/content/", import.meta.url);
const strict =
  process.argv.includes("--strict") || process.env.STRICT_CONTENT === "1";

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(
      `${entry.name}${entry.isDirectory() ? "/" : ""}`,
      dir,
    );
    if (entry.isDirectory()) files.push(...(await walk(child)));
    else if (/\.(ts|tsx|mdx|json)$/.test(entry.name)) files.push(child);
  }
  return files;
}

const files = await walk(ROOT);
const findings = [];

for (const file of files) {
  const text = await readFile(file, "utf8");
  text.split("\n").forEach((line, i) => {
    if (!line.includes("TODO")) return;
    // The checker documents itself in comments; only flag shipped values.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    findings.push({
      file: path.relative(process.cwd(), file.pathname.replace(/^\//, "")),
      line: i + 1,
      text: line.trim(),
    });
  });
}

if (findings.length === 0) {
  console.log("check-content: no TODO strings in src/content.");
  process.exit(0);
}

const banner = "=".repeat(72);
console.log(`\n${banner}`);
console.log(
  `${strict ? "ERROR" : "WARNING"}: ${findings.length} unresolved TODO ${
    findings.length === 1 ? "string" : "strings"
  } in site content.`,
);
console.log("These render to visitors as written. See §5.6 of the brief.\n");
for (const finding of findings) {
  console.log(`  ${finding.file}:${finding.line}`);
  console.log(`    ${finding.text}`);
}
console.log(`\nOutstanding from the client (Appendix A):`);
console.log(`  - exact LinkedIn and GitHub URLs`);
console.log(`  - the dates the bank marketing project ran`);
console.log(`${banner}\n`);

process.exit(strict ? 1 : 0);
