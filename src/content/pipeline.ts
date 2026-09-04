/**
 * The NYC subway reliability pipeline, §6.5.
 *
 * Feed names are the MTA's own GTFS-realtime endpoint groupings, which is why
 * there are eight of them. Stage descriptions restate §5.3; the code blocks are
 * representative of each stage, written to match the stack the project lists.
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

export const stages: StageNode[] = [
  {
    id: "ingest",
    index: "01",
    title: "Ingest",
    kicker: "Eight feeds, every 30 seconds",
    body: [
      "A scheduled job pulls all eight GTFS-realtime endpoints on a 30-second cadence and decodes the protobuf into flat rows.",
      "Each poll is stamped with its own fetch time. That timestamp is the whole trick: the feed says what the MTA believed at that instant, and the difference between consecutive beliefs is where an arrival hides.",
    ],
    code: {
      lang: "python",
      filename: "ingest/poll_feeds.py",
      source: `import time
from google.protobuf.json_format import MessageToDict
from google.transit import gtfs_realtime_pb2

URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/"

FEEDS = {
    "irt": "nyct%2Fgtfs",
    "ace": "nyct%2Fgtfs-ace",
    "bdfm": "nyct%2Fgtfs-bdfm",
    "g": "nyct%2Fgtfs-g",
    "jz": "nyct%2Fgtfs-jz",
    "nqrw": "nyct%2Fgtfs-nqrw",
    "l": "nyct%2Fgtfs-l",
    "si": "nyct%2Fgtfs-si",
}


def poll(session, feed_id: str) -> list[dict]:
    """One poll of one feed, stamped with the instant it was observed."""
    observed_at = time.time()
    message = gtfs_realtime_pb2.FeedMessage()
    message.ParseFromString(session.get(URL + FEEDS[feed_id]).content)

    rows = []
    for entity in message.entity:
        if not entity.HasField("trip_update"):
            continue
        trip = MessageToDict(entity.trip_update)
        for stop in trip.get("stopTimeUpdate", []):
            rows.append(
                {
                    "feed_id": feed_id,
                    "observed_at": observed_at,
                    "trip_id": trip["trip"]["tripId"],
                    "route_id": trip["trip"].get("routeId"),
                    "stop_id": stop["stopId"],
                    "predicted_arrival": stop.get("arrival", {}).get("time"),
                }
            )
    return rows`,
    },
  },
  {
    id: "landing",
    index: "02",
    title: "BigQuery landing",
    kicker: "Append-only, partitioned by observation day",
    body: [
      "Rows land untouched in a date-partitioned, clustered table. Nothing is updated in place, so a bad transformation is never a lost observation.",
      "Partition pruning is what keeps the arrival inference affordable: the query that reconstructs a day only ever reads that day.",
    ],
    code: {
      lang: "sql",
      filename: "warehouse/raw_stop_time_updates.sql",
      source: `CREATE TABLE IF NOT EXISTS raw.stop_time_updates (
  feed_id            STRING  NOT NULL,
  observed_at        TIMESTAMP NOT NULL,
  trip_id            STRING  NOT NULL,
  route_id           STRING,
  stop_id            STRING  NOT NULL,
  predicted_arrival  TIMESTAMP
)
PARTITION BY DATE(observed_at)
CLUSTER BY route_id, stop_id;`,
    },
  },
  {
    id: "arrival",
    index: "03",
    title: "Arrival inference",
    kicker: "The source never writes an arrival event",
    body: [
      "The MTA publishes predictions, not arrivals. A train that has arrived simply stops appearing in the feed for that stop.",
      "So the arrival is derived: take the last observation in which a (trip, stop) pair was still predicted, and read the arrival time it was carrying when it vanished. A pair that disappears without ever coming due is a cancellation, not an arrival, and is dropped.",
    ],
    code: {
      lang: "sql",
      filename: "models/intermediate/int_inferred_arrivals.sql",
      source: `with ranked as (

    select
        trip_id,
        stop_id,
        route_id,
        observed_at,
        predicted_arrival,
        row_number() over (
            partition by trip_id, stop_id
            order by observed_at desc
        ) as recency
    from {{ source('raw', 'stop_time_updates') }}
    where predicted_arrival is not null

)

select
    trip_id,
    stop_id,
    route_id,
    predicted_arrival as inferred_arrival,
    observed_at       as last_seen_at,
    timestamp_diff(predicted_arrival, observed_at, second) as lead_seconds
from ranked
where recency = 1
  -- Vanished before it was ever due: cancelled or re-routed, not an arrival.
  and predicted_arrival <= timestamp_add(observed_at, interval 120 second)`,
    },
  },
  {
    id: "models",
    index: "04",
    title: "dbt models",
    kicker: "Star schema, tested on every run",
    body: [
      "Inferred arrivals become headways, headways become excess wait time — the minutes a rider waits beyond the scheduled average, which is the number that actually describes a bad commute.",
      "Facts and dimensions are separated so excess wait can be sliced by line, station, and hour without rewriting the aggregation. Every model carries dbt tests for uniqueness, nullity, and referential integrity.",
    ],
    code: {
      lang: "sql",
      filename: "models/marts/fct_excess_wait.sql",
      source: `with headways as (

    select
        route_id,
        stop_id,
        inferred_arrival,
        timestamp_diff(
            inferred_arrival,
            lag(inferred_arrival) over (
                partition by route_id, stop_id
                order by inferred_arrival
            ),
            second
        ) / 60.0 as headway_minutes
    from {{ ref('int_inferred_arrivals') }}

)

select
    route_id,
    stop_id,
    datetime_trunc(datetime(inferred_arrival, 'America/New_York'), hour) as service_hour,
    count(*)                                   as arrivals,
    avg(headway_minutes)                       as mean_headway,
    -- Excess wait: the gap a rider feels, over the gap the timetable promises.
    sum(pow(headway_minutes, 2)) / (2 * sum(headway_minutes))
        - avg(headway_minutes) / 2            as excess_wait_minutes
from headways
where headway_minutes between 0.5 and 60
group by 1, 2, 3`,
    },
  },
  {
    id: "weather",
    index: "05",
    title: "Weather regression",
    kicker: "What rain measurably costs a rider",
    body: [
      "Hourly precipitation is joined to excess wait by line and hour, and a regression is fitted per line.",
      "The output is reported with confidence intervals, because a coefficient without one is a claim, not a measurement.",
    ],
    code: {
      lang: "python",
      filename: "analysis/rain_regression.py",
      source: `import statsmodels.formula.api as smf

def fit_line(frame):
    """Excess wait against rainfall, controlling for hour of day."""
    model = smf.ols(
        "excess_wait_minutes ~ precip_mm + C(hour_of_day)",
        data=frame,
    ).fit(cov_type="HC3")

    coefficient = model.params["precip_mm"]
    low, high = model.conf_int().loc["precip_mm"]
    return {
        "minutes_per_mm": coefficient,
        "ci_low": low,
        "ci_high": high,
        "n": int(model.nobs),
    }


results = {
    route: fit_line(group)
    for route, group in panel.groupby("route_id")
}`,
    },
  },
  {
    id: "serving",
    index: "06",
    title: "Serving",
    kicker: "One governed layer, several front doors",
    body: [
      "The marts feed the reporting layer and this site. Both read the same tested tables, so a number on the portfolio and a number in a dashboard cannot disagree.",
      "The figures rendered here come from a snapshot committed to the repository, dated on the chart, rather than a live query — a portfolio page should not depend on a warehouse being awake.",
    ],
  },
];

export function stageById(id: string): StageNode | undefined {
  return stages.find((stage) => stage.id === id);
}
