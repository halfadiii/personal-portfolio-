import { readFile } from "node:fs/promises";
import path from "node:path";
import { BgeEncoder, decodeWeights, type ModelManifest } from "./encoder";
import { DIM, type Chunk, type Corpus, type KeywordIndex } from "./retrieve";
import { WordPieceTokenizer } from "./tokenizer";

/**
 * The index behind /demo/rag, read once per server instance.
 *
 * Built by scripts/build-rag-index.py out of the Agentic RAG project's own
 * artifacts. About 75 MB on disk, most of it the model; decoding takes a
 * moment on a cold start and nothing after, so it is held in a module-level
 * promise and every request after the first reuses it.
 */

type ChunkRow = [string, string, "510k" | "guidance", string, string, number, number, string];

let loading: Promise<Corpus> | null = null;

export function corpusRoot(): string {
  return path.join(process.cwd(), "data", "rag");
}

async function load(root: string): Promise<Corpus> {
  const read = (name: string) => readFile(path.join(root, name));

  const [rowsText, vectorBytes, keywordText, sourcesText, vocab, manifestText] =
    await Promise.all([
      read("chunks.json"),
      read("vectors.bin"),
      read("bm25.json"),
      read("sources.json"),
      read("vocab.txt"),
      read("model.json"),
    ]);

  const manifest = JSON.parse(manifestText.toString("utf8")) as ModelManifest;
  const files = await Promise.all(manifest.files.map((name) => read(name)));

  const rows = JSON.parse(rowsText.toString("utf8")) as ChunkRow[];
  const chunks: Chunk[] = rows.map(
    ([id, docId, docType, docTitle, section, pageStart, pageEnd, text]) => ({
      id,
      docId,
      docType,
      docTitle,
      section,
      pageStart,
      pageEnd,
      text,
    }),
  );

  const vectors = new Float32Array(
    vectorBytes.buffer.slice(
      vectorBytes.byteOffset,
      vectorBytes.byteOffset + vectorBytes.byteLength,
    ),
  );
  if (vectors.length !== chunks.length * DIM) {
    throw new Error(
      `index is inconsistent: ${vectors.length / DIM} vectors for ${chunks.length} chunks`,
    );
  }

  return {
    chunks,
    vectors,
    keyword: JSON.parse(keywordText.toString("utf8")) as KeywordIndex,
    sources: JSON.parse(sourcesText.toString("utf8")) as Record<string, string | null>,
    tokenizer: new WordPieceTokenizer(vocab.toString("utf8")),
    encoder: new BgeEncoder(decodeWeights(manifest, files)),
  };
}

export function loadCorpus(root = corpusRoot()): Promise<Corpus> {
  if (!loading) {
    loading = load(root).catch((error) => {
      // A failed load must not be cached, or one bad cold start poisons the
      // instance for its whole life.
      loading = null;
      throw error;
    });
  }
  return loading;
}
