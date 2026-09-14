/**
 * bge-small-en-v1.5, forward pass, in plain TypeScript.
 *
 * The Python project embeds questions with sentence-transformers on PyTorch,
 * which does not fit in a serverless function, and the ONNX runtime that would
 * replace it ships as a ~300 MB native package whose Linux binary cannot even
 * be exercised on the machine this was built on. A BERT encoder is small
 * enough to write out instead: twelve identical layers of attention and a
 * feed-forward block. Nothing native, so what runs in the test here is exactly
 * what runs on Vercel.
 *
 * It only needs to embed the question. The corpus vectors were produced by the
 * Python project and are read as stored, so a disagreement could only ever
 * come from this file — which is why parity.test.ts compares its output against
 * sentence-transformers' own vectors, not against itself.
 *
 * Activations are float64. The model was trained in float32, and the extra
 * precision changes nothing measurable; it is simply what JavaScript numbers are.
 */

export type TensorEntry = {
  file: number;
  offset: number;
  dtype: "f16" | "f32";
  shape: number[];
};

export type ModelManifest = {
  model: string;
  files: string[];
  tensors: Record<string, TensorEntry>;
};

const HIDDEN = 384;
const HEADS = 12;
const HEAD_DIM = HIDDEN / HEADS;
const INTERMEDIATE = 1536;
const LAYERS = 12;
const LAYER_NORM_EPS = 1e-12;

/** Every possible half-precision bit pattern, decoded once. */
let halfTable: Float32Array | null = null;
function halfToFloat(): Float32Array {
  if (halfTable) return halfTable;
  const table = new Float32Array(65536);
  for (let h = 0; h < 65536; h++) {
    const sign = h & 0x8000 ? -1 : 1;
    const exponent = (h >> 10) & 0x1f;
    const mantissa = h & 0x3ff;
    table[h] =
      exponent === 0
        ? sign * 2 ** -14 * (mantissa / 1024)
        : exponent === 31
          ? mantissa
            ? NaN
            : sign * Infinity
          : sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
  }
  halfTable = table;
  return table;
}

export function decodeWeights(
  manifest: ModelManifest,
  files: Uint8Array[],
): Map<string, Float32Array> {
  const table = halfToFloat();
  const out = new Map<string, Float32Array>();
  for (const [name, entry] of Object.entries(manifest.tensors)) {
    const size = entry.shape.reduce((a, b) => a * b, 1);
    const file = files[entry.file];
    const start = file.byteOffset + entry.offset;
    if (entry.dtype === "f32") {
      // slice() copies into a fresh, aligned buffer; the file is not.
      out.set(name, new Float32Array(file.buffer.slice(start, start + size * 4)));
    } else {
      const half = new Uint16Array(file.buffer.slice(start, start + size * 2));
      const full = new Float32Array(size);
      for (let i = 0; i < size; i++) full[i] = table[half[i]];
      out.set(name, full);
    }
  }
  return out;
}

/**
 * erf, via the complementary error function's Chebyshev fit (Numerical
 * Recipes, fractional error below 1.2e-7). JavaScript has no Math.erf, and the
 * cheaper tanh approximation of GELU is a different function from the one
 * this model was trained with.
 */
function erf(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? 1 - r : r - 1;
}

function linear(
  x: Float64Array,
  rows: number,
  inDim: number,
  weight: Float32Array,
  bias: Float32Array,
  outDim: number,
): Float64Array {
  const y = new Float64Array(rows * outDim);
  for (let p = 0; p < rows; p++) {
    const xo = p * inDim;
    const yo = p * outDim;
    for (let i = 0; i < outDim; i++) {
      const wo = i * inDim;
      let sum = bias[i];
      for (let j = 0; j < inDim; j++) sum += weight[wo + j] * x[xo + j];
      y[yo + i] = sum;
    }
  }
  return y;
}

function layerNorm(
  x: Float64Array,
  rows: number,
  gamma: Float32Array,
  beta: Float32Array,
): void {
  for (let p = 0; p < rows; p++) {
    const o = p * HIDDEN;
    let mean = 0;
    for (let d = 0; d < HIDDEN; d++) mean += x[o + d];
    mean /= HIDDEN;
    let variance = 0;
    for (let d = 0; d < HIDDEN; d++) {
      const c = x[o + d] - mean;
      variance += c * c;
    }
    variance /= HIDDEN;
    const inv = 1 / Math.sqrt(variance + LAYER_NORM_EPS);
    for (let d = 0; d < HIDDEN; d++) {
      x[o + d] = (x[o + d] - mean) * inv * gamma[d] + beta[d];
    }
  }
}

export class BgeEncoder {
  constructor(private readonly weights: Map<string, Float32Array>) {}

  private t(name: string): Float32Array {
    const tensor = this.weights.get(name);
    if (!tensor) throw new Error(`missing tensor ${name}`);
    return tensor;
  }

  /** A unit-length sentence embedding: the [CLS] state after the last layer. */
  embed(ids: number[]): Float64Array {
    const n = ids.length;
    const word = this.t("embeddings.word_embeddings.weight");
    const position = this.t("embeddings.position_embeddings.weight");
    const type = this.t("embeddings.token_type_embeddings.weight");

    let x: Float64Array = new Float64Array(n * HIDDEN);
    for (let p = 0; p < n; p++) {
      const wo = ids[p] * HIDDEN;
      const po = p * HIDDEN;
      for (let d = 0; d < HIDDEN; d++) {
        x[po + d] = word[wo + d] + position[po + d] + type[d];
      }
    }
    layerNorm(
      x,
      n,
      this.t("embeddings.LayerNorm.weight"),
      this.t("embeddings.LayerNorm.bias"),
    );

    const scale = 1 / Math.sqrt(HEAD_DIM);
    const scores = new Float64Array(n);

    for (let layer = 0; layer < LAYERS; layer++) {
      const p = `encoder.layer.${layer}.`;
      const q = linear(x, n, HIDDEN, this.t(p + "attention.self.query.weight"), this.t(p + "attention.self.query.bias"), HIDDEN);
      const k = linear(x, n, HIDDEN, this.t(p + "attention.self.key.weight"), this.t(p + "attention.self.key.bias"), HIDDEN);
      const v = linear(x, n, HIDDEN, this.t(p + "attention.self.value.weight"), this.t(p + "attention.self.value.bias"), HIDDEN);

      // One sequence and no padding, so there is no mask to apply.
      const context = new Float64Array(n * HIDDEN);
      for (let h = 0; h < HEADS; h++) {
        const ho = h * HEAD_DIM;
        for (let a = 0; a < n; a++) {
          const qa = a * HIDDEN + ho;
          let max = -Infinity;
          for (let b = 0; b < n; b++) {
            const kb = b * HIDDEN + ho;
            let dot = 0;
            for (let d = 0; d < HEAD_DIM; d++) dot += q[qa + d] * k[kb + d];
            scores[b] = dot * scale;
            if (scores[b] > max) max = scores[b];
          }
          let total = 0;
          for (let b = 0; b < n; b++) {
            scores[b] = Math.exp(scores[b] - max);
            total += scores[b];
          }
          const ca = a * HIDDEN + ho;
          for (let b = 0; b < n; b++) {
            const weight = scores[b] / total;
            const vb = b * HIDDEN + ho;
            for (let d = 0; d < HEAD_DIM; d++) context[ca + d] += weight * v[vb + d];
          }
        }
      }

      const attended = linear(context, n, HIDDEN, this.t(p + "attention.output.dense.weight"), this.t(p + "attention.output.dense.bias"), HIDDEN);
      for (let i = 0; i < attended.length; i++) attended[i] += x[i];
      layerNorm(attended, n, this.t(p + "attention.output.LayerNorm.weight"), this.t(p + "attention.output.LayerNorm.bias"));
      x = attended;

      const hidden = linear(x, n, HIDDEN, this.t(p + "intermediate.dense.weight"), this.t(p + "intermediate.dense.bias"), INTERMEDIATE);
      for (let i = 0; i < hidden.length; i++) {
        const value = hidden[i];
        hidden[i] = 0.5 * value * (1 + erf(value / Math.SQRT2));
      }
      const output = linear(hidden, n, INTERMEDIATE, this.t(p + "output.dense.weight"), this.t(p + "output.dense.bias"), HIDDEN);
      for (let i = 0; i < output.length; i++) output[i] += x[i];
      layerNorm(output, n, this.t(p + "output.LayerNorm.weight"), this.t(p + "output.LayerNorm.bias"));
      x = output;
    }

    const cls = x.slice(0, HIDDEN);
    let norm = 0;
    for (let d = 0; d < HIDDEN; d++) norm += cls[d] * cls[d];
    norm = Math.sqrt(norm);
    for (let d = 0; d < HIDDEN; d++) cls[d] /= norm;
    return cls;
  }
}
