import Link from "next/link";
import { projectMetrics, projects } from "@/content";
import { SectionHeading } from "@/components/site/SectionHeading";
import { MetricMark } from "@/components/viz/MetricMark";
import { cn } from "@/lib/utils";

/**
 * §6.4 — the work rail.
 *
 * Rendered here as flow layout at every breakpoint: a vertical stack on mobile,
 * two-up in the mid range, and a horizontally scrollable row at lg. The GSAP
 * pinning in the motion layer takes over the same `[data-work-rail]` element;
 * with JS off or reduced motion on, the native scroll below is the fallback.
 *
 * The `[data-work-pin]` wrapper exists for one reason, and it is not layout.
 * ScrollTrigger pins an element by wrapping it in a spacer div — it moves the
 * node — and the section is a direct child of `<main>`, which is exactly the
 * kind of node React removes by hand on a client-side navigation. Move it and
 * that removal throws, taking the whole commit with it. React only ever
 * removes the outermost nodes of a subtree it is deleting, so anything one
 * level in is safe for GSAP to reparent.
 */
const COUNT_WORDS: Record<number, string> = {
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
};

export function SelectedWork({ caseStudies }: { caseStudies: string[] }) {
  return (
    <section
      id="work"
      aria-labelledby="work-title"
      className="section-gap overflow-clip"
    >
      {/* At lg this is a full viewport tall so the pinned rail sits in the
          middle of the screen rather than at the top of a tall void. */}
      <div
        data-work-pin
        className="lg:flex lg:min-h-screen lg:flex-col lg:justify-center"
      >
        <div className="shell">
          <SectionHeading
            id="work"
            index="02"
            label="selected work"
            meta="2022–2026"
            /* Counted, not typed: the heading said six while the orbit
             counted seven, and only one of them was reading the data. */
            title={`${COUNT_WORDS[projects.length] ?? projects.length} things I built.`}
          />
        </div>

        <ol
          data-work-rail
          className={cn(
            "shell mt-10 grid list-none grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2",
            "lg:flex lg:snap-x lg:snap-mandatory lg:items-start lg:gap-8 lg:overflow-x-auto lg:pb-6",
          )}
        >
          {projects.map((project, i) => {
            const metric = projectMetrics[project.slug];
            // The case study is the fuller artifact where one exists; a project
            // with only a live page links straight to it.
            const hasStudy = caseStudies.includes(project.slug);
            const href = hasStudy
              ? `/work/${project.slug}`
              : project.live?.href;
            const cta = hasStudy
              ? "Open case study"
              : (project.live?.label ?? "Open case study");

            return (
              <li
                key={project.slug}
                data-work-card
                className={cn(
                  "lg:w-[clamp(20rem,30vw,28rem)] lg:shrink-0 lg:snap-start",
                  // Alternating vertical offset — the rail is not a tidy row.
                  i % 2 === 1 && "sm:mt-16 lg:mt-24",
                )}
              >
                <WorkCard
                  index={String(i + 1).padStart(2, "0")}
                  title={project.title}
                  hook={project.hook}
                  period={project.period}
                  stack={project.stack}
                  metric={metric}
                  href={href}
                  cta={cta}
                />
              </li>
            );
          })}
        </ol>

        <p className="shell label-mono mt-6 hidden lg:block">
          Keep scrolling — the rail moves sideways. Tab through the cards to
          reach them all.
        </p>
      </div>
    </section>
  );
}

function WorkCard({
  index,
  title,
  hook,
  period,
  stack,
  metric,
  href,
  cta,
}: {
  index: string;
  title: string;
  hook: string;
  period: string;
  stack: string[];
  metric?: (typeof projectMetrics)[string];
  href?: string;
  cta: string;
}) {
  const body = (
    <article className="border-hairline bg-panel ease-brief group-hover/link:border-steel relative flex h-full flex-col gap-4 border p-5 transition-colors duration-[var(--dur-ui)] sm:p-6">
      <p className="label-mono flex items-baseline justify-between gap-4">
        <span className="text-signal">{index}</span>
        <span>{period}</span>
      </p>

      <h3 className="font-display text-title leading-[0.95]">{title}</h3>

      <p className="text-body text-steel">{hook}</p>

      <p className="label-mono mt-auto">{stack.join(" · ")}</p>

      {metric ? (
        /* The mark sits with the caption that reads it out, not behind the
           title: a filled bar under white type erases the headline, and a
           number worth drawing is worth leaving on screen. Its height is
           reserved by the SVG's own aspect ratio, so nothing shifts. */
        <div className="flex flex-col gap-1.5">
          <MetricMark
            metric={metric}
            labelled={false}
            className="max-w-[13rem]"
          />
          <p className="label-mono text-steel">
            <span className="sr-only">Key measure: </span>
            {describeShort(metric)}
          </p>
        </div>
      ) : null}

      {href ? (
        <p className="label-mono text-signal flex items-center gap-2">
          {cta}
          {/* §4.2 — a separate arrow element, animated on hover, never welded to
              the link text. Drawn rather than set, because none of the three
              faces carries an arrow glyph. */}
          <svg
            aria-hidden
            viewBox="0 0 16 10"
            width="16"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            className="ease-brief inline-block shrink-0 transition-transform duration-[var(--dur-ui)] group-hover/link:translate-x-1"
          >
            <path d="M0 5h14M10 1l4 4-4 4" />
          </svg>
        </p>
      ) : null}
    </article>
  );

  if (!href) return <div className="group/link h-full">{body}</div>;

  return (
    <Link href={href} className="group/link block h-full">
      {body}
    </Link>
  );
}

function describeShort(metric: (typeof projectMetrics)[string]): string {
  switch (metric.kind) {
    case "delta":
      return `${metric.from} → ${metric.to} ${metric.unit}`;
    case "level":
      return `${metric.value}${metric.unit} ${metric.label.toLowerCase()}`;
    case "shortfall":
      return `${metric.value}${metric.unit} below target ROI`;
    case "count":
      return `${metric.value} ${metric.unit}, ${metric.note}`;
  }
}
