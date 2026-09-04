import { MetricMark } from "@/components/viz/MetricMark";
import {
  compactFragments,
  fragments,
  type Fragment,
} from "./constellation-data";

/**
 * Drifting field behind the hero name. Server-rendered with reserved boxes so
 * it costs no layout shift; the GSAP drift attaches to `[data-fragment]` and is
 * skipped entirely under reduced motion or on a low-capability device (§7).
 *
 * Below 640px there is no field and no drift — see `HeroIndex`, which is the
 * same three fragments laid out for a screen that cannot hold a field.
 */
export function Constellation() {
  return (
    <div
      aria-hidden
      data-constellation
      className="absolute inset-0 hidden overflow-clip sm:block"
    >
      {fragments.map((fragment) => (
        <div
          key={fragment.id}
          data-fragment
          data-rate={fragment.rate}
          /* §6.2 — hovering a fragment names it beside the cursor. The same
             information is in the work rail, so nothing is mouse-only. */
          data-cursor-label={fragment.title}
          /* z-[1] lifts a hovered fragment above its neighbours but stays
             under the name, which sits at z-10. */
          className="group absolute will-change-transform hover:z-[1]"
          style={{
            left: `${fragment.x}%`,
            top: `${fragment.y}%`,
            width: fragment.w,
            maxWidth: "34vw",
          }}
        >
          <FragmentCard fragment={fragment} />
        </div>
      ))}
    </div>
  );
}

/**
 * The same three fragments on a phone (§7), as rows rather than as cards.
 *
 * They were a three-column grid above the name, which at 390px gives each card
 * about ten characters a line: every title broke mid-phrase, the cards ended
 * at three different heights, and the subway project's mark — eight empty
 * squares, one per feed — read as missing glyphs at that size with nothing
 * next to it to say otherwise. Full-width rows fit the same titles on one line
 * and need no marks to carry them.
 *
 * They also sit *below* the name here rather than above it. The name is the
 * page's `h1` and on a phone there is no orbit competing for the middle of the
 * screen, so it takes the top; these fill what was otherwise half a screen of
 * empty black under the clock.
 */
export function HeroIndex() {
  return (
    <ul
      data-hero-index
      className="border-hairline mt-10 flex list-none flex-col border-t p-0 sm:hidden"
    >
      {compactFragments.map((fragment) => (
        <li
          key={fragment.id}
          className="border-hairline flex items-baseline gap-4 border-b py-3"
        >
          <span
            className={
              "label-mono shrink-0 " +
              (fragment.kind === "metric" ? "text-signal" : "")
            }
            data-numeric
          >
            {fragment.index}
          </span>
          <span className="text-small text-steel leading-snug">
            {fragment.title}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FragmentCard({ fragment }: { fragment: Fragment }) {
  return (
    <figure
      /* No opacity dimming: it dropped the caption to 1.7:1 against the panel.
         The fragments stay quiet through hairline borders and small type
         instead, and every string on them stays readable (§8). */
      className="border-hairline bg-panel ease-brief group-hover:border-signal group-hover:bg-void m-0 flex flex-col gap-2 border p-3 transition-colors duration-[var(--dur-ui)]"
    >
      <figcaption className="label-mono flex items-baseline justify-between gap-2">
        <span
          className={fragment.kind === "metric" ? "text-signal" : undefined}
        >
          {fragment.index}
        </span>
        <span className="truncate">{fragment.caption}</span>
      </figcaption>

      {fragment.metric ? (
        <MetricMark metric={fragment.metric} labelled={false} />
      ) : null}

      <p className="text-small text-steel ease-brief group-hover:text-signal leading-snug transition-colors duration-[var(--dur-ui)]">
        {fragment.title}
      </p>
    </figure>
  );
}
