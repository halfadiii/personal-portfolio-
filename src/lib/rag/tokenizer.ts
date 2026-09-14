/**
 * BERT's WordPiece tokenizer, as Hugging Face `tokenizers` runs it for
 * bge-small-en-v1.5.
 *
 * Three stages, each copied from the Rust implementation rather than from a
 * description of it, because a tokenizer that is nearly right produces a
 * vector that is nearly right and a ranking that is quietly different:
 *
 *   normalise  drop control characters, map whitespace to a space, pad CJK
 *              ideographs, strip accents (NFD, then drop combining marks),
 *              lowercase — in that order
 *   split      on whitespace, and around every punctuation character
 *   WordPiece  greedy longest match from the vocabulary, `##` on every piece
 *              after the first, and the whole word as [UNK] if any piece
 *              is missing
 *
 * Checked against the reference tokenizer on the 24 parity questions and on
 * 300 chunks of the corpus itself (src/lib/rag/parity.test.ts).
 */

const CLS = "[CLS]";
const SEP = "[SEP]";
const UNK = "[UNK]";
const MAX_CHARS_PER_WORD = 100;

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const UNICODE_PUNCTUATION = /\p{P}/u;
const OTHER = /\p{C}/u;
const WHITESPACE = /\s/u;
const COMBINING_MARK = /\p{Mn}/gu;

function isChinese(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x20000 && cp <= 0x2a6df) ||
    (cp >= 0x2a700 && cp <= 0x2b73f) ||
    (cp >= 0x2b740 && cp <= 0x2b81f) ||
    (cp >= 0x2b920 && cp <= 0x2ceaf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x2f800 && cp <= 0x2fa1f)
  );
}

function normalise(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0 || cp === 0xfffd) continue;
    if (ch === "\t" || ch === "\n" || ch === "\r") {
      out += " ";
      continue;
    }
    if (OTHER.test(ch)) continue;
    if (WHITESPACE.test(ch)) {
      out += " ";
      continue;
    }
    out += isChinese(cp) ? ` ${ch} ` : ch;
  }
  return out.normalize("NFD").replace(COMBINING_MARK, "").toLowerCase();
}

function splitWords(text: string): string[] {
  const words: string[] = [];
  let current = "";
  for (const ch of text) {
    if (WHITESPACE.test(ch)) {
      if (current) words.push(current);
      current = "";
    } else if (ASCII_PUNCTUATION.test(ch) || UNICODE_PUNCTUATION.test(ch)) {
      if (current) words.push(current);
      current = "";
      words.push(ch);
    } else {
      current += ch;
    }
  }
  if (current) words.push(current);
  return words;
}

export class WordPieceTokenizer {
  private readonly vocab = new Map<string, number>();
  private readonly cls: number;
  private readonly sep: number;
  private readonly unk: number;

  constructor(vocabText: string) {
    vocabText.split("\n").forEach((line, id) => {
      const token = line.replace(/\r$/, "");
      if (token && !this.vocab.has(token)) this.vocab.set(token, id);
    });
    this.cls = this.id(CLS);
    this.sep = this.id(SEP);
    this.unk = this.id(UNK);
  }

  private id(token: string): number {
    const id = this.vocab.get(token);
    if (id === undefined) throw new Error(`vocabulary has no ${token}`);
    return id;
  }

  private wordPiece(word: string): number[] {
    const chars = Array.from(word);
    if (chars.length > MAX_CHARS_PER_WORD) return [this.unk];

    const pieces: number[] = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length;
      let found = -1;
      while (start < end) {
        const sub = (start > 0 ? "##" : "") + chars.slice(start, end).join("");
        const id = this.vocab.get(sub);
        if (id !== undefined) {
          found = id;
          break;
        }
        end -= 1;
      }
      if (found < 0) return [this.unk];
      pieces.push(found);
      start = end;
    }
    return pieces;
  }

  /** Token ids with [CLS] and [SEP], truncated to `maxLength` including both. */
  encode(text: string, maxLength = 512): number[] {
    const ids: number[] = [];
    for (const word of splitWords(normalise(text))) {
      ids.push(...this.wordPiece(word));
    }
    const room = Number.isFinite(maxLength) ? Math.max(0, maxLength - 2) : ids.length;
    return [this.cls, ...ids.slice(0, room), this.sep];
  }
}
