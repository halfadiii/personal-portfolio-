import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadCorpus } from "./load";
import {
  QUERY_PREFIX,
  bm25Ranking,
  denseRanking,
  embedQuestion,
  search,
  type Corpus,
} from "./retrieve";

/**
 * The port is only worth running if it is the project, not an impression of
 * it. data/rag/parity/python-reference.json was written by running the real
 * Python Retriever; every assertion here is against that, never against this
 * code's own earlier output.
 *
 *   npx vitest run src/lib/rag/parity.test.ts
 */

type Case = {
  question: string;
  tokenIds: number[];
  vector: number[];
  dense: string[];
  bm25: string[];
  denseTop5: string[];
  bm25Top5: string[];
  hybridTop5: string[];
};

const reference = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data", "rag", "parity", "python-reference.json"),
    "utf8",
  ),
) as {
  prefix: string;
  cases: Case[];
  tokenizer: { text: string; ids: number[] }[];
};

let corpus: Corpus;
const ids = (indices: number[]) => indices.map((i) => corpus.chunks[i].id);

beforeAll(async () => {
  corpus = await loadCorpus();
}, 120_000);

describe("parity with the Python project", () => {
  it("uses the same query prefix", () => {
    expect(QUERY_PREFIX).toBe(reference.prefix);
  });

  it("tokenises the questions identically", () => {
    for (const c of reference.cases) {
      expect(corpus.tokenizer.encode(QUERY_PREFIX + c.question), c.question).toEqual(
        c.tokenIds,
      );
    }
  });

  it("tokenises 300 chunks of the corpus identically", () => {
    let mismatched = 0;
    for (const t of reference.tokenizer) {
      const ours = corpus.tokenizer.encode(t.text, Infinity);
      if (JSON.stringify(ours) !== JSON.stringify(t.ids)) mismatched += 1;
    }
    expect(mismatched).toBe(0);
  });

  it("embeds questions to sentence-transformers' own vectors", () => {
    let worst = 1;
    for (const c of reference.cases) {
      const v = embedQuestion(corpus, c.question);
      let dot = 0;
      for (let d = 0; d < v.length; d++) dot += v[d] * c.vector[d];
      worst = Math.min(worst, dot);
    }
    console.log(`  lowest cosine to the Python vectors: ${worst.toFixed(8)}`);
    expect(worst).toBeGreaterThan(0.99999);
  }, 120_000);

  it("ranks the same top 30 by meaning and by keyword", () => {
    for (const c of reference.cases) {
      const v = embedQuestion(corpus, c.question);
      expect(ids(denseRanking(corpus.vectors, v, 30)), `dense: ${c.question}`).toEqual(c.dense);
      expect(ids(bm25Ranking(corpus.keyword, c.question, 30)), `bm25: ${c.question}`).toEqual(c.bm25);
    }
  }, 120_000);

  it("returns the same five chunks in every mode", () => {
    for (const c of reference.cases) {
      for (const mode of ["dense", "bm25", "hybrid"] as const) {
        const got = ids(search(corpus, c.question, { k: 5, mode }).hits.map((h) => h.index));
        expect(got, `${mode}: ${c.question}`).toEqual(c[`${mode}Top5`]);
      }
    }
  }, 180_000);

  it("embeds a question fast enough to serve", () => {
    const times: number[] = [];
    for (const c of reference.cases) {
      const started = performance.now();
      embedQuestion(corpus, c.question);
      times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    console.log(
      `  embed ms: median ${times[times.length >> 1].toFixed(0)}, max ${times[times.length - 1].toFixed(0)}`,
    );
    expect(times[times.length >> 1]).toBeLessThan(2000);
  }, 120_000);
});
