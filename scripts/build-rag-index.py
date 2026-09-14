"""
Build the server-side index behind /demo/rag from the Agentic RAG project.

The project retrieves with two things a Vercel function cannot run as they
are: a Qdrant database opened in embedded mode, and a PyTorch embedding model.
So the demo runs a TypeScript port of the query path, and this script hands it
everything that path reads -- taken out of the project's own built artifacts
rather than rebuilt, so the port searches exactly the index the Python does.

    data/rag/chunks.json    every chunk, in the keyword index's own order
    data/rag/vectors.bin    the stored vectors, float32, same order
    data/rag/bm25.json      the keyword index's internals: idf, postings, lengths
    data/rag/sources.json   where each document can be read at the FDA
    data/rag/vocab.txt      the tokenizer's vocabulary
    data/rag/model.bin      the embedding model's weights, quantised (see below)

And one file that is not served, only tested against:

    data/rag/parity/python-reference.json
        A fixed set of questions, run through the project's real Retriever in
        all three modes, with the query vectors sentence-transformers produced
        and the token ids the reference tokenizer produced. The port is not
        trusted until it reproduces these.

Run from the portfolio root:   python scripts/build-rag-index.py
Source defaults to ../../Agentic RAG; pass --source to point elsewhere.
"""

from __future__ import annotations

import argparse
import json
import os
import pickle
import re
import shutil
import sys
from pathlib import Path

os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")

import numpy as np

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "rag"
MODEL_NAME = "BAAI/bge-small-en-v1.5"
COLLECTION = "fda_wound_dressings"

# Shared with tests/rag-parity: identifiers, synonyms, a refusal, and one
# question built to break a tokenizer (accents, a CFR citation, odd spacing).
QUESTIONS = [
    "How are silver dressings sterilized?",
    "What biocompatibility testing does FDA expect for a dressing that contacts an open wound?",
    "What is a predicate device?",
    "How is the Algidex Ag dressing sterilized?",
    "Is wool a good wound dressing material?",
    "What does ISO 10993-1 require?",
    "K212521",
    "What is a Special 510(k)?",
    "When should a manufacturer submit a new 510(k) for a software change?",
    "What shelf life testing is expected for a medical device?",
    "What is the refuse to accept policy?",
    "How does FDA evaluate substantial equivalence?",
    "What are the labeling requirements under 21 CFR 801?",
    "Which dressings contain manuka honey?",
    "What is a Q-Submission and when should I request one?",
    "Can reusable devices be reprocessed in a hospital?",
    "What materials derived from animal sources need extra information?",
    "What sterility assurance level is required for devices labeled sterile?",
    "What is the intended use of a hydrocolloid dressing?",
    "Does the collagen dressing contain bovine material?",
    "What performance testing was done for the antimicrobial dressing?",
    "What is the difference between a traditional and an abbreviated 510(k)?",
    "How long does FDA take to review a 510(k)?",
    "Résumé   café naïve — 807.92(a)?\tsterile/non-sterile   PHMB",
]


def pdf_url_for(k_number: str) -> str:
    """The project's own rule (download_corpus.py), repeated so links match it."""
    yy = k_number[1:3]
    folder = "pdf" if "76" <= yy <= "99" else f"pdf{yy}"
    return f"https://www.accessdata.fda.gov/cdrh_docs/{folder}/{k_number}.pdf"


def export_corpus(source: Path) -> list[str]:
    chunks = json.loads((source / "data" / "chunks.json").read_text(encoding="utf-8"))
    by_id = {c["chunk_id"]: c for c in chunks}

    with (source / "data" / "bm25.pkl").open("rb") as f:
        saved = pickle.load(f)
    bm25 = saved["bm25"]
    order: list[str] = saved["chunk_ids"]
    assert len(order) == len(chunks) == len(bm25.doc_freqs), "index and chunks disagree"

    # One row per chunk, in the keyword index's order, so a BM25 document
    # index and a vector row and a chunk row are all the same number.
    rows = []
    for cid in order:
        c = by_id[cid]
        rows.append([
            c["chunk_id"], c["doc_id"], c["doc_type"], c["doc_title"],
            c["section"], c["page_start"], c["page_end"], c["text"],
        ])
    (OUT / "chunks.json").write_text(
        json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # BM25Okapi, laid open. get_scores() is a sum over query tokens of
    #   idf[q] * tf*(k1+1) / (tf + k1*(1 - b + b*len/avgdl))
    # and a document without the token contributes zero, so postings carry
    # the whole index. idf is exported rather than recomputed: rank_bm25
    # floors negative idf at epsilon * the mean idf, and copying the result is
    # the one way to be sure that floor matches.
    postings: dict[str, list[int]] = {}
    for doc, freqs in enumerate(bm25.doc_freqs):
        for term, tf in freqs.items():
            postings.setdefault(term, []).extend((doc, tf))
    keyword = {
        "k1": bm25.k1,
        "b": bm25.b,
        "avgdl": bm25.avgdl,
        "docLen": [int(n) for n in bm25.doc_len],
        "idf": {t: float(v) for t, v in bm25.idf.items()},
        "postings": postings,
    }
    (OUT / "bm25.json").write_text(
        json.dumps(keyword, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # Sources. A 510(k) summary lives at a URL derived from its K-number. A
    # guidance document only has one if the downloader recorded it; the four
    # added by hand did not, and a guessed link is worse than none.
    guidance = json.loads(
        (source / "data" / "guidance_manifest.json").read_text(encoding="utf-8"))
    guidance_urls = {
        Path(g["path"].replace("\\", "/")).stem: g.get("pdf_url") or g.get("landing_url")
        for g in guidance
    }
    sources: dict[str, str | None] = {}
    for c in chunks:
        d = c["doc_id"]
        if d in sources:
            continue
        if c["doc_type"] == "510k" and re.fullmatch(r"K\d{6}", d):
            sources[d] = pdf_url_for(d)
        else:
            sources[d] = guidance_urls.get(d)
    (OUT / "sources.json").write_text(json.dumps(sources, indent=1), encoding="utf-8")

    print(f"  chunks   {len(rows)}")
    print(f"  bm25     {len(postings)} terms, avgdl {bm25.avgdl:.1f}")
    print(f"  sources  {sum(1 for v in sources.values() if v)} of {len(sources)} with a link")
    return order


def export_vectors(source: Path, order: list[str]) -> None:
    from qdrant_client import QdrantClient

    client = QdrantClient(path=str(source / "data" / "qdrant"))
    try:
        stored: dict[str, list[float]] = {}
        offset = None
        while True:
            points, offset = client.scroll(
                COLLECTION, limit=512, offset=offset,
                with_vectors=True, with_payload=["chunk_id"])
            for p in points:
                stored[p.payload["chunk_id"]] = p.vector
            if offset is None:
                break
    finally:
        client.close()

    assert len(stored) == len(order), f"{len(stored)} vectors for {len(order)} chunks"
    matrix = np.asarray([stored[cid] for cid in order], dtype="<f4")
    norms = np.linalg.norm(matrix, axis=1)
    matrix.tofile(OUT / "vectors.bin")
    print(f"  vectors  {matrix.shape}, norms {norms.min():.6f}..{norms.max():.6f}")


def export_reference(source: Path) -> None:
    """Run the project's real Retriever and keep what it said."""
    sys.path.insert(0, str(source))
    cwd = os.getcwd()
    os.chdir(source)  # search.py opens data/... relative to the project
    try:
        from search import Retriever, QUERY_PREFIX  # type: ignore
        from tokenizers import Tokenizer

        retriever = Retriever()
        tokenizer = Tokenizer.from_pretrained(MODEL_NAME)
        tokenizer.no_truncation()
        tokenizer.no_padding()

        cases = []
        for q in QUESTIONS:
            vec = retriever.model.encode(QUERY_PREFIX + q, normalize_embeddings=True)
            case = {
                "question": q,
                "tokenIds": tokenizer.encode(QUERY_PREFIX + q).ids,
                "vector": [float(x) for x in vec],
                "dense": retriever._dense(q, 30),
                "bm25": retriever._bm25(q, 30),
            }
            for mode in ("dense", "bm25", "hybrid"):
                case[mode + "Top5"] = [r.chunk_id for r in retriever.search(q, k=5, mode=mode)]
            cases.append(case)
        retriever.close()

        # The tokenizer, again, over real corpus text: punctuation, section
        # numbers and CFR citations are where a WordPiece port goes wrong.
        chunks = json.loads(Path("data/chunks.json").read_text(encoding="utf-8"))
        rng = np.random.default_rng(7)
        sample = [chunks[i]["text"] for i in rng.choice(len(chunks), 300, replace=False)]
        text_cases = [{"text": t, "ids": tokenizer.encode(t).ids} for t in sample]
    finally:
        os.chdir(cwd)

    (OUT / "parity").mkdir(parents=True, exist_ok=True)
    (OUT / "parity" / "python-reference.json").write_text(
        json.dumps({"model": MODEL_NAME, "prefix": QUERY_PREFIX,
                    "cases": cases, "tokenizer": text_cases},
                   ensure_ascii=False), encoding="utf-8")
    print(f"  parity   {len(cases)} questions, {len(text_cases)} tokenizer texts")


def export_model() -> None:
    """
    The embedding model, as the port reads it.

    Measured before choosing, on the 24 reference questions, comparing each
    variant's top 30 dense results against the real Python retriever:

        float32   133 MB   identical rankings 24/24
        float16    67 MB   identical rankings 24/24, cosine 1.000000
        int8       34 MB   identical rankings  1/24, a top five changed

    So float16: half the size, nothing measurable lost. Only the large matrices
    are halved -- LayerNorm, biases and the position table stay float32, which
    is exactly how the float16 row was measured. Written as two files below
    GitHub's 50 MB warning rather than one 67 MB blob.
    """
    from huggingface_hub import hf_hub_download
    from safetensors.numpy import load_file

    weights = load_file(hf_hub_download(MODEL_NAME, "model.safetensors"))
    shutil.copyfile(hf_hub_download(MODEL_NAME, "vocab.txt"), OUT / "vocab.txt")

    limit = 45_000_000
    blobs: list[bytearray] = [bytearray()]
    tensors: dict[str, dict] = {}
    for raw_name in sorted(weights):
        name = raw_name.removeprefix("bert.")
        # CLS pooling reads the last hidden state; the pooler head is unused.
        if name.startswith("pooler."):
            continue
        t = weights[raw_name]
        half = t.ndim == 2 and t.size > 100_000 and "position" not in name
        data = t.astype("<f2" if half else "<f4").tobytes()
        if blobs[-1] and len(blobs[-1]) + len(data) > limit:
            blobs.append(bytearray())
        tensors[name] = {
            "file": len(blobs) - 1,
            "offset": len(blobs[-1]),
            "dtype": "f16" if half else "f32",
            "shape": list(t.shape),
        }
        blobs[-1].extend(data)

    files = []
    for i, blob in enumerate(blobs):
        (OUT / f"model.{i}.bin").write_bytes(blob)
        files.append(f"model.{i}.bin")
    (OUT / "model.json").write_text(
        json.dumps({"model": MODEL_NAME, "files": files, "tensors": tensors}, indent=1),
        encoding="utf-8")
    print(f"  model    {len(tensors)} tensors in {[f'{len(b)/1e6:.1f} MB' for b in blobs]}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path,
                        default=ROOT.parent.parent / "Agentic RAG")
    parser.add_argument("--skip-reference", action="store_true")
    args = parser.parse_args()
    source = args.source.resolve()

    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Source: {source}")
    order = export_corpus(source)
    export_vectors(source, order)
    export_model()
    if not args.skip_reference:
        export_reference(source)
    print(f"Written to {OUT}")


if __name__ == "__main__":
    main()
