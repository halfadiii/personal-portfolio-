import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel } from "@/components/site/SectionHeading";
import { NetflixDashboardPanel } from "@/components/viz/NetflixDashboardPanel";
import { formatHalf, formatWeek, netflix } from "@/lib/netflix-data";

export const metadata: Metadata = {
  title: "Streaming engagement dashboard",
  description:
    "Netflix's own viewing numbers as a dashboard: what is driving the hours, what kind of title earns them, and how long a hit lasts in each country.",
};

/**
 * The live half of the streaming engagement project.
 *
 * Every figure here comes from `scripts/build-netflix-dashboard.py`, which
 * reproduces the repository's SQL KPI layer over its committed star schema.
 *
 * The words were rewritten on 2026-10-04, at his request, for somebody who
 * does not work with data: where the numbers come from in four sentences, and
 * the limits cut to the four a visitor would actually trip over.
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
          People watch more Netflix every half-year:{" "}
          {first.hoursB.toFixed(2)} billion hours in {formatHalf(first.label)},{" "}
          {last.hoursB.toFixed(2)} billion in {formatHalf(last.label)}. But
          Netflix adds titles even faster, so the average title gets watched
          less than it used to. These charts use Netflix&rsquo;s own published
          numbers to show what&rsquo;s behind that.
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
          Two reports from Netflix, put together.
        </h2>
        <div className="measure mt-5 flex flex-col gap-5">
          <p className="text-lead text-steel">
            Twice a year, Netflix lists every title and the hours it was
            watched. Every week since {formatWeek(source.firstWeek)}, it also
            publishes a Top 10 for the world and for {source.countries}{" "}
            countries. The first has the hours but no countries. The second
            has the countries but, for those, only a ranking.
          </p>
          <p className="text-body text-steel">
            I put the two together, and before trusting anything else I
            checked that my totals matched the ones Netflix published. When
            Netflix releases new numbers, a script rebuilds this page from
            them.
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
            Netflix only publishes rankings for each country. So the country
            charts use stand-ins: how long a title stays in a country&rsquo;s
            Top 10, and how often a country&rsquo;s number one matches the
            world&rsquo;s. Neither is hours, and neither is shown as hours.
          </Limit>
          <Limit title="Weekly hours only exist for hits.">
            The weekly lines cover the global Top 10, not everything people
            watched that week.
          </Limit>
          <Limit title="Trailer views are as of today.">
            YouTube shows a trailer&rsquo;s total so far, and a show that
            becomes a hit sends people back to its trailer. So that chart can
            show whether the two tend to move together, and nothing more.
          </Limit>
          <Limit title="There are no genres.">
            Netflix doesn&rsquo;t publish them. This can tell a series from a
            film, and English from non-English, but not a comedy from a drama.
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
