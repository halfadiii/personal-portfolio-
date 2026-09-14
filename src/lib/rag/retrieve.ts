/**
 * Hybrid retrieval, ported from the project's search.py line for line.
 *
 *   dense   the question's embedding against every stored chunk vector.
 *           1,752 unit vectors is small enough that exact search is a single
 *           pass, so there is no approximate index to disagree with Qdrant's.
 *   bm25    rank_bm25's Okapi scoring over the exported postings, with the
 *           operations in the same order, so the scores are the same floats.
 *   hybrid  Reciprocal Rank Fusion: 1 / (60 + rank), summed over both lists.
 *
 * Two details decide ties, and ties are common in RRF — a chunk that is third
 * in one list and absent from the other scores exactly what its mirror image
 * does. Python breaks them by dict insertion order (every dense result first,
 * then new keyword results) and a stable sort. A Map and Array.sort in V8 do
 * the same, which is the only reason the top five come out identical rather
 * than merely similar.
 */

import type { BgeEncoder } from "./encoder";
import type { WordPieceTokenizer } from "./tokenizer";

export const QUERY_PREFIX =
  "Represent this sentence for searching relevant passages: ";
export const RRF_K = 60;
export const DIM = 384;

export type Chunk = {
  id: string;
  docId: string;
  docType: "510k" | "guidance";
  docTitle: string;
  section: string;
  pageStart: number;
  pageEnd: number;
  text: string;
};

export type KeywordIndex = {
  k1: number;
  b: number;
  avgdl: number;
  docLen: number[];
  idf: Record<string, number>;
  /** Flattened [doc, tf, doc, tf, ...] per term. */
  postings: Record<string, number[]>;
};

export type Corpus = {
  chunks: Chunk[];
  vectors: Float32Array;
  keyword: KeywordIndex;
  sources: Record<string, string | null>;
  tokenizer: WordPieceTokenizer;
  encoder: BgeEncoder;
};

export type Mode = "dense" | "bm25" | "hybrid";

export type Hit = {
  index: number;
  score: number;
  rankDense: number | null;
  rankBm25: number | null;
};

export type Retrieval = {
  hits: Hit[];
  /** Chunk indices, best first, as each method ranked them before fusion. */
  dense: number[];
  bm25: number[];
  embedMs: number;
  searchMs: number;
};

/** Must match search.py's tokenize(): the keyword index was built with it. */
export function keywordTokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9][a-z0-9.\-()]*/g) ?? [];
}

export function bm25Ranking(
  index: KeywordIndex,
  query: string,
  limit: number,
): number[] {
  const n = index.docLen.length;
  const scores = new Float64Array(n);
  const { k1, b, avgdl, docLen } = index;

  for (const term of keywordTokens(query)) {
    const idf = index.idf[term];
    const postings = index.postings[term];
    if (!idf || !postings) continue;
    for (let i = 0; i < postings.length; i += 2) {
      const doc = postings[i];
      const tf = postings[i + 1];
      scores[doc] +=
        idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * docLen[doc]) / avgdl)));
    }
  }

  const ranked = Array.from({ length: n }, (_, i) => i)
    .sort((x, y) => scores[y] - scores[x])
    .slice(0, limit);
  return ranked.filter((i) => scores[i] > 0);
}

export function denseRanking(
  vectors: Float32Array,
  query: Float64Array,
  limit: number,
): number[] {
  const n = vectors.length / DIM;
  const scores = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * DIM;
    let dot = 0;
    for (let d = 0; d < DIM; d++) dot += vectors[o + d] * query[d];
    scores[i] = dot;
  }
  return Array.from({ length: n }, (_, i) => i)
    .sort((x, y) => scores[y] - scores[x])
    .slice(0, limit);
}

export function fuse(dense: number[], bm25: number[], k: number): Hit[] {
  const scores = new Map<number, number>();
  const rankDense = new Map<number, number>();
  const rankBm25 = new Map<number, number>();

  dense.forEach((index, i) => {
    scores.set(index, (scores.get(index) ?? 0) + 1 / (RRF_K + i + 1));
    rankDense.set(index, i + 1);
  });
  bm25.forEach((index, i) => {
    scores.set(index, (scores.get(index) ?? 0) + 1 / (RRF_K + i + 1));
    rankBm25.set(index, i + 1);
  });

  return [...scores.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, k)
    .map(([index, score]) => ({
      index,
      score,
      rankDense: rankDense.get(index) ?? null,
      rankBm25: rankBm25.get(index) ?? null,
    }));
}

export function embedQuestion(corpus: Corpus, question: string): Float64Array {
  return corpus.encoder.embed(corpus.tokenizer.encode(QUERY_PREFIX + question));
}

export function search(
  corpus: Corpus,
  question: string,
  { k = 5, mode = "hybrid", pool = 30 }: { k?: number; mode?: Mode; pool?: number } = {},
): Retrieval {
  const started = performance.now();
  let dense: number[] = [];
  let embedMs = 0;
  if (mode !== "bm25") {
    const vector = embedQuestion(corpus, question);
    embedMs = performance.now() - started;
    dense = denseRanking(corpus.vectors, vector, pool);
  }
  const bm25 = mode !== "dense" ? bm25Ranking(corpus.keyword, question, pool) : [];
  const hits = fuse(dense, bm25, k);
  return {
    hits,
    dense,
    bm25,
    embedMs,
    searchMs: performance.now() - started - embedMs,
  };
}
