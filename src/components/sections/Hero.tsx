import { profile, projects } from "@/content";
import { Clock } from "@/components/site/Clock";
import { SceneMount } from "@/components/three/SceneMount";
import { Constellation, HeroIndex } from "./Constellation";
import { NameGlow } from "./NameGlow";

/**
 * §6.2, rebuilt as the orbit.
 *
 * On a capable desktop the hero is a WebGL scene: a star at the centre, the
 * projects on a ring around it, a procedural galaxy behind. Everywhere else
 * — phones, reduced motion, machines with fewer than four cores — it falls back
 * to the drifting constellation field, which is server-rendered and therefore
 * always in the HTML.
 *
 * The name sits at the top and the orbit owns the middle, so the positioning
 * paragraph moved down to the metric strip rather than fighting the ring for
 * the same band of screen.
 *
 * On a phone none of that applies: there is no ring, so the section stops
 * reserving a screen's height for one. It is a title block with the three
 * fragments under it, sized to what it holds — which also leaves the top of
 * the metric strip showing, and a section edge at the bottom of the screen is
 * a better invitation to scroll than half a screen of empty black was.
 */
export function Hero({ caseStudies }: { caseStudies: string[] }) {
  const lastSpace = profile.name.lastIndexOf(" ");
  const given = lastSpace > 0 ? profile.name.slice(0, lastSpace) : profile.name;
  const family = lastSpace > 0 ? profile.name.slice(lastSpace + 1) : "";

  return (
    <section
      id="hero"
      aria-labelledby="hero-name"
      className="relative isolate flex flex-col overflow-clip pt-[6vh] pb-14 sm:min-h-[92vh] sm:pb-8"
    >
      <SceneMount
        projects={projects}
        caseStudies={caseStudies}
        fallback={<Constellation />}
      />

      {/*
        Neither the name nor its layout box is interactive, and together they
        cover a wide band, so both let the pointer through — otherwise the orbit
        beneath them could not be dragged.
      */}
      {/* Builds the light that follows the pointer across the name. */}
      <NameGlow />

      <div className="shell-bleed pointer-events-none relative z-10">
        <h1
          id="hero-name"
          data-hero-name
          /* Lit by the star below it: `Sunlight` writes the direction, the
             stylesheet turns it into a warm edge and a cast shadow. */
          data-sunlit="1"
          /* §4.2 — the width axis is the resting state as well as the load
             animation: expanded, so the name bleeds toward both margins. */
          className="font-display text-name leading-[0.82] tracking-[-0.03em] sm:whitespace-nowrap sm:[font-stretch:125%]"
        >
          {/*
            Below 640px the name is too wide for one line, and where it breaks
            depends on the font — which means the fallback and the real face can
            disagree and shift the page when the swap lands. Breaking it
            explicitly makes the box the same height either way (§2.4).
          */}
          <span className="block sm:inline">{given}</span>{" "}
          <span className="block sm:inline">{family}</span>
        </h1>

        {/*
          Stacked below 640px rather than wrapped. Three items whose widths
          depend on font metrics will re-wrap the moment the real face lands,
          and that reflow was the page's largest layout shift (§2.4).
        */}
        <dl
          data-sunlit="0.45"
          className="mt-5 flex flex-col gap-y-1.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-8 sm:gap-y-2"
        >
          <div className="flex items-baseline gap-2">
            <dt className="sr-only">Role</dt>
            <dd className="label-mono text-signal">{profile.role}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="sr-only">Location</dt>
            <dd className="label-mono text-signal">{profile.location}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="sr-only">Local time</dt>
            <dd>
              <Clock className="label-mono text-signal" />
            </dd>
          </div>
        </dl>

        {/* Phones only: the field cannot be drawn at this width, so its three
            fragments are listed instead. */}
        <HeroIndex />
      </div>
    </section>
  );
}
