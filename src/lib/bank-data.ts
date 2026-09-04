import meta from "@/content/data/bank-marketing.json";

/**
 * Client-side access to the bank marketing rows.
 *
 * `scripts/build-bank-dashboard.py` writes every kept row into one columnar
 * binary. The browser fetches it once and reads each column as a typed array,
 * which is what makes the filters genuinely live: 43,193 rows re-aggregate in
 * about a millisecond, so there is no server round trip and no pre-baked
 * combinations. As JSON the same rows would be several megabytes and slow to
 * walk; as a buffer it is under a megabyte.
 */
export type BankMeta = typeof meta;

export const bankMeta = meta;

export type BankColumns = {
  age: Uint8Array;
  job: Uint8Array;
  marital: Uint8Array;
  education: Uint8Array;
  default: Uint8Array;
  housing: Uint8Array;
  loan: Uint8Array;
  contact: Uint8Array;
  month: Uint8Array;
  poutcome: Uint8Array;
  previous: Uint8Array;
  y: Uint8Array;
  duration: Uint16Array;
  pdays: Int16Array;
  balance: Int32Array;
};

export type BankFilters = {
  job: number[];
  marital: number[];
  education: number[];
  month: number[];
  balance: [number, number];
};

let cache: Promise<BankColumns> | null = null;

export function loadBankColumns(): Promise<BankColumns> {
  cache ??= fetch(meta.binary.path)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`dataset returned ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then((buffer) => sliceColumns(buffer));
  return cache;
}

function sliceColumns(buffer: ArrayBuffer): BankColumns {
  const rows = meta.binary.rows;
  const columns: Record<string, ArrayBufferView> = {};

  for (const entry of meta.binary.layout) {
    switch (entry.type) {
      case "u1":
        columns[entry.name] = new Uint8Array(buffer, entry.offset, rows);
        break;
      case "u2":
        columns[entry.name] = new Uint16Array(buffer, entry.offset, rows);
        break;
      case "i2":
        columns[entry.name] = new Int16Array(buffer, entry.offset, rows);
        break;
      case "i4":
        columns[entry.name] = new Int32Array(buffer, entry.offset, rows);
        break;
      default:
        throw new Error(`unknown column type ${entry.type}`);
    }
  }

  return columns as unknown as BankColumns;
}

/** Row indices matching the filters. An empty selection means "all of them". */
export function selectRows(
  columns: BankColumns,
  filters: BankFilters,
): Uint32Array {
  const rows = meta.binary.rows;
  const out = new Uint32Array(rows);
  // A thumb parked at either end of the slider means "no bound that way",
  // rather than silently dropping the rows beyond the slider's domain.
  const minBalance =
    filters.balance[0] <= BALANCE_RANGE[0] ? -Infinity : filters.balance[0];
  const maxBalance =
    filters.balance[1] >= BALANCE_RANGE[1] ? Infinity : filters.balance[1];

  const jobs = maskOf(filters.job);
  const maritals = maskOf(filters.marital);
  const educations = maskOf(filters.education);
  const months = maskOf(filters.month);

  let count = 0;
  for (let i = 0; i < rows; i++) {
    if (jobs && !jobs.has(columns.job[i])) continue;
    if (maritals && !maritals.has(columns.marital[i])) continue;
    if (educations && !educations.has(columns.education[i])) continue;
    if (months && !months.has(columns.month[i])) continue;
    const balance = columns.balance[i];
    if (balance < minBalance || balance > maxBalance) continue;
    out[count++] = i;
  }

  return out.subarray(0, count);
}

function maskOf(values: number[]): Set<number> | null {
  return values.length === 0 ? null : new Set(values);
}

export type Summary = {
  rows: number;
  subscribed: number;
  rate: number;
  meanBalance: number;
  medianBalance: number;
  meanDuration: number;
  meanAge: number;
};

export function summarise(
  columns: BankColumns,
  selection: Uint32Array,
): Summary {
  const n = selection.length;
  if (n === 0) {
    return {
      rows: 0,
      subscribed: 0,
      rate: 0,
      meanBalance: 0,
      medianBalance: 0,
      meanDuration: 0,
      meanAge: 0,
    };
  }

  let subscribed = 0;
  let balance = 0;
  let duration = 0;
  let age = 0;
  const balances = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    const row = selection[i];
    subscribed += columns.y[row];
    balance += columns.balance[row];
    duration += columns.duration[row];
    age += columns.age[row];
    balances[i] = columns.balance[row];
  }

  balances.sort();
  const mid = n >> 1;
  const median =
    n % 2 === 1 ? balances[mid] : (balances[mid - 1] + balances[mid]) / 2;

  return {
    rows: n,
    subscribed,
    rate: subscribed / n,
    meanBalance: balance / n,
    medianBalance: median,
    meanDuration: duration / n,
    meanAge: age / n,
  };
}

export type RateBucket = {
  label: string;
  total: number;
  subscribed: number;
  rate: number;
};

/** Subscription rate within each level of a categorical column. */
export function rateByCategory(
  columns: BankColumns,
  selection: Uint32Array,
  column: keyof BankColumns,
  labels: readonly string[],
  { sort = true }: { sort?: boolean } = {},
): RateBucket[] {
  const totals = new Uint32Array(labels.length);
  const hits = new Uint32Array(labels.length);
  const values = columns[column] as unknown as Uint8Array;

  for (let i = 0; i < selection.length; i++) {
    const row = selection[i];
    const code = values[row];
    if (code >= labels.length) continue;
    totals[code]++;
    hits[code] += columns.y[row];
  }

  const buckets = labels.map((label, index) => ({
    label,
    total: totals[index],
    subscribed: hits[index],
    rate: totals[index] ? hits[index] / totals[index] : 0,
  }));

  return sort ? buckets.sort((a, b) => b.rate - a.rate) : buckets;
}

export type AgeBin = {
  label: string;
  from: number;
  to: number;
  subscribed: number;
  declined: number;
};

/** Age histogram, split by outcome so both populations are visible at once. */
export function ageHistogram(
  columns: BankColumns,
  selection: Uint32Array,
  width = 5,
): AgeBin[] {
  const from = 15;
  const to = 95;
  const count = Math.ceil((to - from) / width);
  const yes = new Uint32Array(count);
  const no = new Uint32Array(count);

  for (let i = 0; i < selection.length; i++) {
    const row = selection[i];
    const bin = Math.floor((columns.age[row] - from) / width);
    if (bin < 0 || bin >= count) continue;
    if (columns.y[row]) yes[bin]++;
    else no[bin]++;
  }

  return Array.from({ length: count }, (_, i) => ({
    label: `${from + i * width}`,
    from: from + i * width,
    to: from + (i + 1) * width - 1,
    subscribed: yes[i],
    declined: no[i],
  }));
}

export type ScatterPoint = {
  balance: number;
  duration: number;
  outcome: 0 | 1;
};

/**
 * A sample of the selection for the scatter. Every row would be 43k marks over
 * each other — the shape is identical and the frame rate is not.
 */
export function scatterSample(
  columns: BankColumns,
  selection: Uint32Array,
  limit = 2600,
): ScatterPoint[] {
  const stride = Math.max(1, Math.ceil(selection.length / limit));
  const points: ScatterPoint[] = [];
  for (let i = 0; i < selection.length; i += stride) {
    const row = selection[i];
    points.push({
      balance: columns.balance[row],
      duration: columns.duration[row],
      outcome: columns.y[row] as 0 | 1,
    });
  }
  return points;
}

export const BALANCE_RANGE: [number, number] = [-2000, 20000];
