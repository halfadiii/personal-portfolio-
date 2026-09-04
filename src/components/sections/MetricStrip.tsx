import { profile } from "@/content";
import { SectionLabel } from "@/components/site/SectionHeading";
import { cn } from "@/lib/utils";

/**
 * §6.3 — the four headline metrics as a full-width mono row separated by
 * hairlines. Static by design: no counters that tick on scroll into view.
 */
export function MetricStrip() {
  return (
    <section
      id="metrics"
      aria-labelledby="metrics-label"
      className="rule-top rule-bottom"
    >
      <div className="shell py-8">
        <SectionLabel
          index="02"
          label="measured outcomes"
          meta="from the projects below"
        />

        {/* The positioning line lives here rather than in the hero: the orbit
            owns that band of screen now. */}
        <p className="measure text-lead text-steel mt-5 mb-9">
          {profile.positioning}
        </p>
        <dl className="grid grid-cols-2 lg:grid-cols-4">
          {profile.headlineMetrics.map((metric, i) => (
            <div
              key={metric.label}
              className={cn(
                "flex flex-col gap-2 py-5 pr-5 lg:py-2",
                // Hairlines between cells only, never around the strip.
                i % 2 === 1 && "border-hairline border-l pl-5",
                "lg:border-hairline lg:border-l lg:pl-5",
                i === 0 && "lg:border-l-0 lg:pl-0",
              )}
            >
              <dt className="label-mono order-2 max-w-[22ch] leading-snug">
                {metric.label}
              </dt>
              <dd
                className="text-title text-signal order-1 font-mono leading-none"
                data-numeric
              >
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
