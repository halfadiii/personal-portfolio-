import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel } from "@/components/site/SectionHeading";
import { NetflixDashboardPanel } from "@/components/viz/NetflixDashboardPanel";
import { formatHalf, formatWeek, netflix } from "@/lib/netflix-data";

export const metadata: Metadata = {
  title: "Streaming engagement dashboard",
  description:
    "Netflix's own engagement data, three half-years of hours for every title and five years of weekly Top 10 charts in 94 countries, as a dashboard: what drives hours, which content earns them, and how long a hit holds a market.",
};

/**
 * The live half of the streaming engagement project.
 *
 * Every figure here comes from `scripts/build-netflix-dashboard.py`, which
 * reproduces the repository's SQL KPI layer over its committed star schema.
 */
export default function NetflixEngagementPage() {
  const { source, periods } = netflix;
  const first = periods[0];
  const last = periods[periods.length - 1];
  const rows = source.halfRows + source.weeklyRows;

  return (
    <div className="shell section-gap">
      <header className="flex flex-col gap-6">
        <SectionLabel
          index="—"
          label="live dashboard"
          meta={`${rows.toLocaleString()} rows / ${source.countries} markets`}
        />
        <h1 className="font-display text-hero leading-[0.88]">
          More titles, fewer hours each.
        </h1>
        <p className="measure text-lead text-steel">
          Netflix&rsquo;s viewing keeps growing: {first.hoursB.toFixed(2)} billion
          hours in {formatHalf(first.label)}, {last.hoursB.toFixed(2)} billion in{" "}
          {formatHalf(last.label)}. But the catalogue is growing faster, so the
          average title earns less than it did. This is the dashboard the project
          was built for, over the same model, answering the questions a streaming
          engagement team would actually ask: what drives the hours, which kind of
          content earns them, and how long a hit holds a market.
        </p>
        <p className="label-mono">
          Netflix What We Watched reports + weekly Top 10 · Python · SQL · SQLite
        </p>
      </header>

      <div className="mt-14">
        <NetflixDashboardPanel />
      </div>

      <section aria-labelledby="data-title" className="section-gap">
        <p className="label-mono">
          <span className="text-signal">02</span> / where the numbers come from
        </p>
        <h2 id="data-title" className="font-display text-section mt-5">
          Two public sources that don&rsquo;t share a grain.
        </h2>
        <div className="measure mt-5 flex flex-col gap-5">
          <p className="text-lead text-steel">
            Netflix&rsquo;s half-yearly <em>What We Watched</em> report lists every
            title with the hours it earned, about 99% of all viewing on the
            platform, twice a year and with no geography. Its weekly Top 10 has the
            weeks and the countries, back to {formatWeek(source.firstWeek)}, but
            only ten titles per category and, for countries, only a rank.
          </p>
          <p className="text-body text-steel">
            So the project models them as two fact tables at their own grains,{" "}
            {source.halfRows.toLocaleString()} title-by-half rows and{" "}
            {source.weeklyRows.toLocaleString()} title-by-week-by-market rows,
            sharing date, title and region dimensions. The half-yearly totals
            reproduce the figures Netflix published for the same reports before
            anything was analysed. This page is built from that model by a script
            that reruns the project&rsquo;s SQL, so a new data drop changes the
            numbers here rather than leaving a stale sentence behind.
          </p>
        </div>
      </section>

      <section aria-labelledby="limits-title" className="section-gap">
        <p className="label-mono">
          <span className="text-signal">03</span> / what it can&rsquo;t tell you
        </p>
        <h2 id="limits-title" className="font-display text-section mt-5">
          Where the data runs out.
        </h2>
        <ul className="measure mt-8 flex list-none flex-col gap-5 p-0">
          <Limit title="There are no hours by country.">
            Netflix publishes rank by country and nothing else, so every regional
            panel here is a stated proxy: how long titles stay in a chart, and how
            often a market&rsquo;s number one is the world&rsquo;s. Neither is an
            hour, and neither is presented as one.
          </Limit>
          <Limit title="Weekly hours only exist for hits.">
            The weekly lines are the global Top 10&rsquo;s hours. They show the
            shape of what charted, not of everything people watched that week.
          </Limit>
          <Limit title="Netflix's rollups are not titles.">
            From the second half of 2025 the report folds its long tail into
            &ldquo;Other Shows&rdquo; and &ldquo;Other Movies&rdquo;. In{" "}
            {formatHalf(last.label)} &ldquo;Other Shows&rdquo; is the second-largest
            row in the file. They count towards the totals, which is how Netflix
            reports them, and are left out of every per-title view.
          </Limit>
          <Limit title="Trailer views run to today, and prove nothing on their own.">
            YouTube only reports a trailer&rsquo;s total so far, not what it had
            at release, and a show that becomes a hit sends people back to its
            trailer. Twenty titles is enough to see whether the two move
            together, not to measure how much. The counts are fetched live and
            never stored, because YouTube&rsquo;s terms cap keeping them at 30
            days.
          </Limit>
          <Limit title="There are no genres.">
            Content type means series or film, English or not. Netflix
            doesn&rsquo;t publish genre, so answering which genres over-index means
            matching titles against a second source.
          </Limit>
        </ul>
      </section>

      <p className="label-mono mt-10 flex flex-wrap gap-x-8 gap-y-3">
        <Link href="/work/streaming-engagement-analytics" className="tap text-signal inline-flex">
          ← Read the case study
        </Link>
        <a href={source.repo} rel="noreferrer" className="tap text-steel hover:text-signal inline-flex">
          Read the code on GitHub →
        </a>
      </p>
    </div>
  );
}

function Limit({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="rule-top pt-5">
      <p className="text-body text-signal">{title}</p>
      <p className="text-body text-steel mt-2">{children}</p>
    </li>
  );
}
