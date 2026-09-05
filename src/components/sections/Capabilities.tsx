import { skills } from "@/content";
import { SectionHeading } from "@/components/site/SectionHeading";

/**
 * §6.8 — a four-column index. Hairline rules, mono, tight leading.
 * No pills, no badges, no proficiency bars.
 */
export function Capabilities() {
  return (
    <section
      id="capabilities"
      aria-labelledby="capabilities-title"
      className="section-gap"
    >
      <div className="shell">
        <SectionHeading
          id="capabilities"
          index="04"
          label="capabilities"
          meta={`${skills.reduce((n, group) => n + group.items.length, 0)} entries`}
          title="What the work is built with."
        />

        {/* Five columns from lg, one per group, so the row stays whole. At
            four it wrapped the fifth group onto a row of its own. */}
        <dl className="mt-12 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-5">
          {skills.map((group) => (
            <div key={group.label} className="rule-top py-5 lg:py-0 lg:pr-6">
              <dt className="label-mono text-signal">{group.label}</dt>
              <dd className="mt-4 ml-0">
                <ul className="flex list-none flex-col p-0">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="rule-bottom text-small text-steel py-2 leading-tight last:border-b-0"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
