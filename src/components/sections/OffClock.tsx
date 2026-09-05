import Image from "next/image";
import { profile } from "@/content";
import { SectionHeading } from "@/components/site/SectionHeading";
import { offClock } from "@/content/offclock";
import { cn } from "@/lib/utils";
import { CardDeck } from "./CardDeck";
import { SkyBody } from "./SkyBody";
import { LiveClockCard } from "./LiveClockCard";
import { OnRepeatCard } from "./OnRepeatCard";

/**
 * Where each card sits, and what shape it is when it gets there.
 *
 * Twelve columns and three rows at `lg`, filled so the whole thing is one
 * rectangle with nothing hanging off an edge:
 *
 *     ┌──────────┬───────────────┬────────────┐
 *     │          │           clock            │
 *     │  Naruto  ├───────────────┬────────────┤
 *     │          │    Coffee     │  Valorant  │
 *     ├──────────┴──────┬────────┴────────────┤
 *     │  Rocket League  │    Am I Dreaming    │
 *     └─────────────────┴─────────────────────┘
 *
 * The sizes differ and each one is the shape of what is in it. The poster
 * stands up down the left; the two square-ish cards hold the game art and the
 * pot; and the pair along the foot are strips, because a car on a pitch and a
 * record are both wider than they are tall and neither needs the height.
 *
 * The ratios are declared; the row heights are not. The bottom row is however
 * tall a 2.35:1 strip makes it, the middle row however tall its two 6:5 cards
 * make it, and the top row is whatever the clock's own type comes to. The
 * left-hand poster then stretches across the first two.
 *
 * Those ratios are padding spacers rather than `aspect-*`, because a pinned
 * ratio refuses to stretch: a card would hold its shape while the row grew
 * around it and the edges would go ragged. A spacer sets the same minimum and
 * still gives way.
 */
const PLACE: Record<string, { area: string; sizes: string }> = {
  watching: {
    // `order-first` only below `lg`, where the single column takes its order
    // from the source. It has to lead the deck because it is the tallest card
    // in it — see CardDeck for why the front one being tallest is what keeps
    // the pile square. Every card is placed explicitly from `sm` up, so this
    // changes nothing about either grid.
    area: "aspect-[4/5] max-lg:order-first sm:col-span-2 sm:row-start-2 lg:col-span-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:aspect-auto",
    sizes: "(min-width: 1024px) 25vw, 100vw",
  },
  playing: {
    area: "aspect-[7/3] sm:col-span-2 sm:row-start-4 lg:col-span-6 lg:col-start-1 lg:row-start-3 lg:aspect-auto lg:before:block lg:before:pt-[42.55%]",
    sizes: "(min-width: 1024px) 38vw, 100vw",
  },
  valorant: {
    area: "aspect-[6/5] sm:col-start-2 sm:row-start-3 lg:col-span-4 lg:col-start-9 lg:row-start-2 lg:aspect-auto lg:before:block lg:before:pt-[83.33%]",
    sizes: "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw",
  },
  coffee: {
    area: "aspect-[6/5] sm:col-start-1 sm:row-start-3 lg:col-span-4 lg:col-start-5 lg:row-start-2 lg:aspect-auto lg:before:block lg:before:pt-[83.33%]",
    sizes: "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw",
  },
};

/**
 * §6 — off the clock.
 *
 * A grid of what is on at the moment, which is the one place on the site that
 * is about the person rather than the work. Two of the five cards are live: the
 * clock is the real time where he is, and the record actually plays. The rest
 * are a mono label and a name, and are honest at that length.
 *
 * Drawn in this site's language rather than as the rounded, tinted cards the
 * idea usually comes in. A card UI from somewhere else would be the only thing
 * on the page with a corner radius, sitting two sections below an orbit.
 *
 * The section is `overflow-x-clip` rather than `hidden`: the body hanging off
 * the right edge has to be cut by the page instead of pushing it sideways, and
 * `clip` does that without turning the section into a scroll container.
 */
export function OffClock() {
  return (
    <section
      id="off-clock"
      aria-labelledby="off-clock-title"
      className="section-gap relative overflow-x-clip"
    >
      <div className="shell">
        <SectionHeading
          id="off-clock"
          index="05"
          label="off the clock"
          meta={profile.location.toLowerCase()}
          title="A little more about me."
        >
          <p className="measure text-lead text-steel">
            The parts a résumé leaves out.
          </p>
        </SectionHeading>

        {/* Two columns between `sm` and `lg` — clock across the top, the two
            posters side by side under it, then the wide three stacked. One
            column below that, in the order they are written.

            Beside it, whatever is actually over New York: the sun while the
            sun is up and the moon once it is down, at the phase it is at. It
            hangs on the right edge of the window with half of it over the
            side, which is why the grid is padded away from that edge rather
            than sharing a row with it. */}
        <div className="relative mt-10 lg:pr-[19rem] xl:pr-[24rem]">
          {/* On a phone the moon is the background rather than a neighbour:
              the whole disc, behind the cards, held in the middle of the
              screen while the section goes past. Sticky rather than centred in
              the section, because the section is two and a half screens tall
              and a moon centred in it would be off the top for most of them.

              Bright, because nothing reads over it. The two cards without a
              picture in them were left see-through at first so the disc would
              show through the time — which measured at 4.49:1 for the steel
              type on it, a fail, and one nobody would have caught by eye.
              Scrimming them until it passed left the moon barely visible
              through them anyway, so they are simply opaque now and the moon
              is turned up instead. It is seen where it can actually be seen:
              around the pile as the section arrives, which is the moment this
              was built for, and between the cards after. */}
          <div className="pointer-events-none absolute inset-0 z-0 lg:hidden">
            <div className="sticky top-0 flex h-[100svh] items-center justify-center">
              <SkyBody full className="w-[min(96vw,24rem)] opacity-70" />
            </div>
          </div>

          <CardDeck
            className="relative z-10"
            /* Wider gaps below `lg`: the gaps are where the moon shows once the
               cards have come apart, so they are doing a job there that they
               are not doing on a desktop grid. */
            gridClassName="grid grid-cols-1 gap-3 max-lg:gap-5 sm:grid-cols-2 lg:grid-cols-12"
          >
            {/* The two cards without a picture in them are transparent, which was
                fine over a black section and is not over a moon. A scrim below
                `lg` keeps their type legible and still lets the disc read
                through — which is the whole point of it being back there. */}
            <LiveClockCard className="max-lg:bg-void sm:col-span-2 sm:row-start-1 lg:col-span-8 lg:col-start-5 lg:row-start-1" />

            {offClock.map((card) => (
              <article
                key={card.id}
                className={cn(
                  "border-hairline ease-brief hover:border-steel group relative isolate overflow-hidden border transition-colors duration-[var(--dur-ui)]",
                  PLACE[card.id].area,
                )}
              >
                <Image
                  src={card.art.src}
                  alt={card.art.alt}
                  fill
                  sizes={PLACE[card.id].sizes}
                  style={{ objectPosition: card.art.position }}
                  className="ease-brief object-cover transition-transform duration-[var(--dur-panel)] group-hover:scale-[1.02]"
                />

                {/* The caption carries its own scrim, so the dark is the shape
                    of the words rather than a fixed band the words can wander
                    out of when a title wraps. Two of these posters are light and
                    the type has to hold over them at any crop. */}
                <div className="absolute inset-0 flex flex-col justify-end">
                  <div
                    data-card-scrim
                    className="flex flex-col gap-2 px-5 pt-12 pb-5"
                  >
                    <p className="label-mono">{card.label}</p>
                    <p className="font-display text-sub text-signal leading-none">
                      {card.name}
                    </p>
                    {card.credit ? (
                      <p className="label-mono mt-1">
                        Photograph {card.credit}
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}

            <OnRepeatCard className="max-lg:bg-void sm:col-span-2 sm:row-start-5 lg:col-span-6 lg:col-start-7 lg:row-start-3" />
          </CardDeck>
        </div>
      </div>

      {/* From `lg` up it leaves the shell entirely and hangs on the right edge
          of the window. Positioned against the section rather than the grid,
          because the grid stops at the shell and this is meant to break out of
          it — and the grid keeps clear of it with padding instead of a column,
          so the cards get their width back. */}
      <SkyBody className="pointer-events-none absolute top-1/2 right-0 hidden w-[19rem] -translate-y-1/2 lg:block xl:w-[24rem]" />
    </section>
  );
}
