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
    title: "Ingest",
    kicker: "Eight feeds, every 30 seconds",
    body: [
      "A poller pulls all eight GTFS-realtime endpoints at once, every 30 seconds, and decodes the protobuf into flat rows. A feed that fails costs that feed its round, not the round.",
      "Every row carries two clocks: the feed's own timestamp, and ours. The first is the whole trick. The feed says what the MTA believed at that instant, and the difference between consecutive beliefs is where an arrival hides.",
    ],
    code: codeFor("ingest"),
  },
  {
    id: "landing",
    index: "02",
    title: "Landing",
    kicker: "Append-only files, filed by observation day",
    body: [
      "Every snapshot is written untouched as a compressed file, filed by date and hour. Nothing is updated in place, so a bad transformation is never a lost observation.",
      "The warehouse is built from those files with dbt on DuckDB, which is why the whole pipeline runs from a clone with no cloud account. A BigQuery landing table, partitioned by day and clustered by route and stop, is written in the repository and has not been run against a live project yet.",
    ],
    code: codeFor("landing"),
  },
  {
    id: "arrival",
    index: "03",
    title: "Arrival inference",
    kicker: "The source never writes an arrival event",
    body: [
      "The MTA publishes predictions, not arrivals. A train that has arrived simply stops appearing in the feed for that stop.",
      "So the arrival is derived: take the last sighting of each (trip, stop) pair, require that it was genuinely absent from a later snapshot of its own feed, and drop anything that vanished while still more than two minutes from being due. That one is a cancellation, not an arrival.",
      "The last sightings are kept in a table, and each run goes back over only the pairs whose answer could have changed, including the trains that were in the newest snapshot last time. A test builds the same data in several sittings and in one pass, and the two warehouses have to match row for row.",
    ],
    code: codeFor("arrival"),
  },
  {
    id: "models",
    index: "04",
    title: "dbt models",
    kicker: "Star schema, tested on every run",
    body: [
      "Inferred arrivals become headways, headways become excess wait time — the minutes a rider waits beyond what an evenly spread service of the same frequency would ask, which is the number that actually describes a bad commute.",
      "Facts and dimensions are separated so excess wait can be sliced by line, station, and hour without rewriting the aggregation. 59 dbt tests run on every build: uniqueness on the real grain, nullity, referential integrity, and one asserting that excess wait can never be negative.",
    ],
    code: codeFor("models"),
  },
  {
    id: "weather",
    index: "05",
    title: "Weather regression",
    kicker: "Fitted only when the data can answer",
    body: [
      "Hourly Central Park rainfall is joined to excess wait by route and hour, and a regression is fitted per route, controlling for hour of day.",
      "It reports a coefficient only when the data can support one, and says which test it failed when it cannot: too few route-hours, too few wet hours, or no variation in rainfall. On the 150 minutes collected so far, it declines. The chart below asks the same question of eleven years of the MTA's published figures instead.",
    ],
    code: codeFor("weather"),
  },
  {
    id: "serving",
    index: "06",
    title: "Serving",
    kicker: "One warehouse file, every column described",
    body: [
      "The warehouse is a single DuckDB file, rebuilt from the raw files by one command and read by the analysis scripts. A catalog generated from the project describes all eight tables and 116 columns, and the build fails if a column is left without a description.",
      "This site does not query it. The live demo runs the same three rules in the browser on the MTA's live feed, and the rain chart below comes from a snapshot committed to the site's repository and dated on the chart. A portfolio page should not depend on a warehouse being awake.",
    ],
  },
];

export function stageById(id: string): StageNode | undefined {
  return stages.find((stage) => stage.id === id);
}
