import excerptData from "./data/pipeline-excerpts.json";

/**
 * The NYC subway reliability pipeline, §6.5.
 *
 * Feed names are the MTA's own GTFS-realtime endpoint groupings, which is why
 * there are eight of them.
 *
 * ## The code blocks are not written here
 *
 * They are excerpts from the public repository
 * (github.com/halfadiii/nyc-subway-reliability), cut out of the files named
 * beside them by `scripts/build-pipeline-excerpts.py` and committed as
 * `data/pipeline-excerpts.json`. For the section's first month they were typed
 * here instead, in BigQuery's dialect, to match a description of the project
 * from before its repository existed. A page that says "the code that runs it"
 * has to show the code that runs it, so: change the repository, run
 * `npm run gen:pipeline`, and never edit a block by hand.
 *
 * ## What the stages claim
 *
 * They follow the repository's own README, which is careful about three
 * things and so this is too. It runs on DuckDB. The BigQuery path is written
 * and has not been run against a live project. And the rain regression
 * declines to answer on the data collected so far.
 *
 * ## Who the words are for
 *
 * Somebody who has never heard of dbt. Since 2026-10-04 the titles, kickers
 * and paragraphs are in plain language at his request ("Find the arrivals",
 * not "Arrival inference"); the code under each one is where the technical
 * reader goes. Keep the two apart: no tool names in the prose unless they are
 * explained in the same breath.
 */

export type FeedNode = {
  id: string;
  /** MTA endpoint grouping. */
  label: string;
  /** Lines carried by that feed. */
  lines: string[];
};

export type StageNode = {
  id: string;
  index: string;
  title: string;
  kicker: string;
  body: string[];
  code?: { lang: string; filename: string; source: string };
};

export const feeds: FeedNode[] = [
  { id: "irt", label: "gtfs", lines: ["1", "2", "3", "4", "5", "6", "7", "S"] },
  { id: "ace", label: "gtfs-ace", lines: ["A", "C", "E"] },
  { id: "bdfm", label: "gtfs-bdfm", lines: ["B", "D", "F", "M"] },
  { id: "g", label: "gtfs-g", lines: ["G"] },
  { id: "jz", label: "gtfs-jz", lines: ["J", "Z"] },
  { id: "nqrw", label: "gtfs-nqrw", lines: ["N", "Q", "R", "W"] },
  { id: "l", label: "gtfs-l", lines: ["L"] },
  { id: "si", label: "gtfs-si", lines: ["SIR"] },
];

const excerpts: Record<
  string,
  { lang: string; filename: string; source: string } | undefined
> = excerptData.excerpts;

/** The repository's own code for a stage, if an excerpt was cut for it. */
function codeFor(id: string): StageNode["code"] {
  const excerpt = excerpts[id];
  return excerpt
    ? { lang: excerpt.lang, filename: excerpt.filename, source: excerpt.source }
    : undefined;
}

export const stages: StageNode[] = [
  {
    id: "ingest",
    index: "01",
    title: "Collect",
    kicker: "Eight feeds, every 30 seconds",
    body: [
      "A small program asks all eight of the MTA's live feeds for the current picture, every 30 seconds. If one feed fails, the other seven still get saved.",
      "Every answer is stamped with the time the MTA made it. Comparing one picture with the next is how an arrival gets found later.",
    ],
    code: codeFor("ingest"),
  },
  {
    id: "landing",
    index: "02",
    title: "Store",
    kicker: "Every copy kept, nothing changed",
    body: [
      "Each picture is saved as a small file, filed by date and hour, and never edited. If I get the logic wrong later, I can redo it. If I threw data away here, it would be gone.",
      "Everything else is built from these files, in a database that runs on a laptop with no account. A cloud version, on BigQuery, is written and hasn't been run yet.",
    ],
    code: codeFor("landing"),
  },
  {
    id: "arrival",
    index: "03",
    title: "Find the arrivals",
    kicker: "A train that vanished from the list",
    body: [
      "The MTA says when a train is expected, never when it arrived. A train that arrives just stops being listed for that stop.",
      "So: take the last time each train was listed for a stop, make sure it really did disappear afterwards, and ignore it if it vanished while still more than two minutes away. That last case is a cancellation.",
      "Each run only goes back over the trains whose answer could have changed, and a test checks the result matches redoing it all from scratch.",
    ],
    code: codeFor("arrival"),
  },
  {
    id: "models",
    index: "04",
    title: "Measure the wait",
    kicker: "Gaps between trains become waiting time",
    body: [
      "Arrivals give the gaps between trains. Gaps give the wait: the extra minutes a rider spends on the platform because trains came bunched and not evenly spaced.",
      "59 automatic checks run on every build, including one that the extra wait can never come out negative.",
    ],
    code: codeFor("models"),
  },
  {
    id: "weather",
    index: "05",
    title: "Ask about rain",
    kicker: "Only answers when it has enough data",
    body: [
      "Hourly rainfall in Central Park is lined up against the wait, line by line, to see whether rain makes it worse.",
      "It refuses to give an answer when there isn't enough data to back one, and on the 150 minutes collected so far, it refuses. The chart below asks the same question of eleven years of the MTA's own figures.",
    ],
    code: codeFor("weather"),
  },
  {
    id: "serving",
    index: "06",
    title: "Use it",
    kicker: "One file, every column explained",
    body: [
      "The result is a single database file that one command rebuilds from the saved copies. Every table and column in it is described on a page that's generated automatically, so the description can't fall behind.",
      "This site doesn't read from it. The live demo runs the same rules in your browser on the MTA's live feed, and the rain chart below uses the MTA's published figures.",
    ],
  },
];

export function stageById(id: string): StageNode | undefined {
  return stages.find((stage) => stage.id === id);
}
