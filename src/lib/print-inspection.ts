import data from "@/content/data/print-inspection.json";

/**
 * The EagleEyes print inspection demo (§6, /demo/print-inspection).
 *
 * `scripts/build-print-inspection.py` builds the file this reads from the
 * production engine's own output: one row per *frame* from a run of the
 * folder-watcher over 2,315 EXT705 frames, scored against the label the
 * camera wrote into each filename.
 *
 * A frame is not a ticket. Tickets come off this press in a bunch — seven
 * across the width of the web and three deep — so one camera image holds
 * twenty-one of them, each carrying a single printed Q-block. That is why the
 * count gate looks for exactly 21 (or 14, on the short two-row layout) and not
 * for one.
 *
 * Nothing here is generated. The press runs the recorded verdicts back, so
 * every lamp, every rejected frame, and every failed gate on the page is one
 * the real system produced.
 */

export type Gate = {
  id: "count" | "visibility" | "density" | "position";
  label: string;
  question: string;
  passed: number;
  total: number;
};

/** One camera image: the bunch of tickets photographed together, and its verdict. */
export type Frame = {
  serial: string;
  /** What the frame actually was, from the filename the camera wrote. */
  truth: "OK" | "NG";
  /** What the engine decided. */
  status: "OK" | "NG";
  /** De-duplicated big Q-block count — the number the count gate reads. */
  big: number;
  /** Count, visibility, density, position: 1 pass, 0 fail. */
  checks: number[];
};

export type PrintInspection = {
  source: {
    system: string;
    client: string;
    line: string;
    note: string;
    model: string;
    generatedAt: string;
  };
  measured: {
    frames: number;
    good: number;
    defective: number;
    passed: number;
    caught: number;
    falseRejects: number;
    missed: number;
    gates: Gate[];
    failures: { reason: string; count: number }[];
    bigCounts: { blocks: number; frames: number }[];
    lineRate: number;
    detectMs: number;
    rulesMs: number;
  };
  rules: {
    allowedBigCounts: number[];
    imgsz: number;
    primaryConf: number;
    recoveryConf: number;
    conf: { min: number; max: number };
    areaFrac: { min: number; max: number };
    meanGray: { min: number; max: number };
    darkRatio: { min: number; max: number };
    zThreshold: number;
    thresholdsFrom: string;
  };
  replay: Frame[];
};

export const printInspection = data as PrintInspection;

/** What each failed check is actually called in `qblock_engine.py`. */
export const FAILURE_LABELS: Record<string, string> = {
  count_mismatch: "Wrong number of blocks",
  vis_big_ok: "Block too faint to trust",
  dens_big_ok: "Not enough ink in the block",
  relpos_ok: "Block out of position",
  no_detections: "Nothing found on the ticket",
};

/**
 * How the tickets sit on the web, and the single source of truth for it.
 *
 * Seven tickets across the width, three rows to a camera frame. These numbers
 * are not decoration: 7 x 3 = 21 is exactly `count_rules.big_expected`, and
 * 7 x 2 = 14 is the short layout the same rule allows. The scene lays the web
 * out from them, so what you count on screen is what the gate counts.
 */
export const WEB = {
  columns: 7,
  rowsFull: 3,
  rowsShort: 2,
} as const;

/** Which layout a recorded frame was printed on, from the count it reported. */
export function rowsFor(big: number): number {
  return big <= WEB.columns * WEB.rowsShort ? WEB.rowsShort : WEB.rowsFull;
}

/**
 * The stations along the press, in the order the web meets them, drawn from
 * the line diagram: paper roll, printer, overhead camera, the workstation the
 * engine runs on, and the printed web coming off the end.
 *
 * `x` is in world units and is the single source of truth for both the 3D
 * layout and the order of the callouts, so the two can never drift apart.
 */
export type Station = {
  id: string;
  x: number;
  title: string;
  role: string;
  detail: string;
};

export const STATIONS: Station[] = [
  {
    id: "unwind",
    x: -9.2,
    title: "Paper roll",
    role: "Where the web comes off the reel",
    detail:
      "Blank stock pays off the reel, round two idlers, and onto the deck. The web is seven tickets wide, and everything downstream is timed off this: about three camera frames leave here every second, which is the budget every stage after it has to fit inside.",
  },
  {
    id: "press",
    x: -4.6,
    title: "Printer",
    role: "Lays down the tickets, and the Q-blocks",
    detail:
      "Tickets are printed across the web rather than one at a time — seven abreast, rotated a quarter turn, rolling off continuously. Each one carries a single small registration mark, a Q-block. They are not decoration: they are the thing the inspection reads.",
  },
  {
    id: "camera",
    x: -0.4,
    title: "Overhead camera",
    role: "One frame, twenty-one tickets",
    detail:
      "A strobe on the gantry freezes the web and the camera takes in a whole bunch at once: seven across by three down, twenty-one tickets and twenty-one Q-blocks in a single bitmap. It writes that into a watched folder named with the timestamp, the serial and the camera, and `runner_folder_watcher.py` polls the folder twice a second and hands anything new to the engine.",
  },
  {
    id: "engine",
    x: 4.2,
    title: "The workstation",
    role: "Detector, then four gates, then the screen",
    detail:
      "A YOLO model exported to ONNX finds the blocks at 1280px, then near-identical overlapping boxes are merged so the count is stable. Four gates follow — count, visibility, density, position — and the frame is only OK if every one of them passes. Detection is the expensive half at 79 ms; the gates cost 4 ms. `fx_router.py` puts the answer on the operator screen as GOOD or NO GOOD, writes a row to the results CSV, and maps it to a green/red lamp — the seam where a PLC signal would attach.",
  },
  {
    id: "web",
    x: 8.4,
    title: "Printed ticket web",
    role: "What the camera was looking at",
    detail:
      "The finished web lifts over the turn rollers and away. This is where the failure modes are visible to a person: a frame the gates turned down is one where a block came out too faint to be sure of, too thin on ink, out of position relative to its neighbours — or simply is not there, and the count comes back at 20 instead of 21.",
  },
];

/**
 * A gate's index in `Frame.checks`, and the name `qblock_engine.py` records
 * when it fails — so the live breakdown and the measured table on the page are
 * counting the same thing under the same name.
 */
export const GATE_ORDER = [
  { id: "count", failure: "count_mismatch" },
  { id: "visibility", failure: "vis_big_ok" },
  { id: "density", failure: "dens_big_ok" },
  { id: "position", failure: "relpos_ok" },
] as const;
