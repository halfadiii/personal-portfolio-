import { experience } from "@/content";
import { formatRange } from "@/lib/utils";

/**
 * §6.7 — a timeline rail: mono dates left, role and bullets right, collapsed to
 * two bullets. Numbered markers appear here and only here, because this
 * genuinely is a sequence.
 *
 * The collapse is a native `<details>` rather than the Radix accordion §3 lists.
 * Two non-negotiables decided it: with JavaScript unavailable the extra bullets
 * still open (§2.5), and dropping the primitive kept the home page inside the
 * 180 KB budget (§8). Keyboard and screen-reader behaviour come free.
 */
export function Experience() {
  return (
    <section
      id="experience"
      aria-labelledby="experience-title"
      className="section-gap"
    >
      <div className="shell">
        <header className="flex flex-col gap-4">
          <p className="label-mono">
            <span className="text-signal">03</span> / experience /{" "}
            {formatRange(
              experience[experience.length - 1].start,
              experience[0].end,
            ).toLowerCase()}
          </p>
          <h2 id="experience-title" className="font-display text-section">
            Five roles, one throughline.
          </h2>
        </header>

        <ol className="mt-12 flex list-none flex-col p-0">
          {experience.map((role, i) => (
            <li
              key={`${role.org}-${role.title}`}
              className="rule-top last:rule-bottom py-8"
            >
              <div className="grid gap-x-8 gap-y-4 lg:grid-cols-[10rem_1fr]">
                <div className="flex items-baseline gap-3 lg:flex-col lg:gap-1">
                  <span className="label-mono text-signal" data-numeric>
                    {String(experience.length - i).padStart(2, "0")}
                  </span>
                  <span className="label-mono">
                    {formatRange(role.start, role.end)}
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-title leading-[0.95]">
                    {role.title}
                  </h3>
                  <p className="label-mono mt-2">
                    {role.org} · {role.location}
                  </p>

                  <ul className="mt-5 flex list-none flex-col gap-2.5 p-0">
                    {role.bullets.slice(0, 2).map((bullet) => (
                      <Bullet key={bullet}>{bullet}</Bullet>
                    ))}
                  </ul>

                  {role.bullets.length > 2 ? (
                    <details className="group mt-5">
                      <summary className="tap label-mono text-signal ease-brief hover:text-steel inline-flex w-fit cursor-pointer list-none transition-colors duration-[var(--dur-ui)] [&::-webkit-details-marker]:hidden">
                        <span className="group-open:hidden">
                          Show {role.bullets.length - 2} more
                        </span>
                        <span className="hidden group-open:inline">
                          Show less
                        </span>
                      </summary>
                      <ul className="mt-4 flex list-none flex-col gap-2.5 p-0">
                        {role.bullets.slice(2).map((bullet) => (
                          <Bullet key={bullet}>{bullet}</Bullet>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  <p className="label-mono mt-5">{role.stack.join(" · ")}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="measure text-body text-steel grid grid-cols-[1.25rem_1fr]">
      <span aria-hidden className="text-hairline">
        —
      </span>
      <span>{children}</span>
    </li>
  );
}
