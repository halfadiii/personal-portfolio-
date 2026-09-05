import { HomeMotion } from "@/components/motion/HomeMotion";
import {
  PreloaderOverlay,
  PreloaderRunner,
} from "@/components/motion/Preloader";
import { Capabilities } from "@/components/sections/Capabilities";
import { Contact } from "@/components/sections/Contact";
import { Experience } from "@/components/sections/Experience";
import { Hero } from "@/components/sections/Hero";
import { OffClock } from "@/components/sections/OffClock";
import { ScrollTrail } from "@/components/sections/ScrollTrail";
import { SelectedWork } from "@/components/sections/SelectedWork";
import { trailChapters } from "@/content/trail";
import { listCaseStudySlugs } from "@/lib/work";

export default async function HomePage() {
  const caseStudies = await listCaseStudySlugs();

  return (
    <>
      <PreloaderOverlay loading="fonts · constellation · 8 feeds" />
      <PreloaderRunner />
      <HomeMotion />

      {/*
        The star's light, carried past the section that holds it.

        The orbit's canvas is `inset-0` of the hero and the hero clips, so the
        scene's own glow has to stop at that edge and the page below it starts in
        the dark. This wash is anchored on the same star — `Sunlight` writes the
        position — and reaches a long way further down, so what ends at the
        boundary is the picture, not the light.
      */}
      <div className="relative">
        <div
          aria-hidden
          data-sun-glow
          className="pointer-events-none absolute inset-x-0 top-0 -z-[5] h-[calc(100%+62vh)]"
        />
        <Hero caseStudies={caseStudies} />
      </div>
      <SelectedWork caseStudies={caseStudies} />
      <ScrollTrail
        chapters={trailChapters}
        label="How I approach a problem"
        /* The globe does not simply end. A moon comes out from behind it during
           experience and travels to the one §6 draws, which is this. */
        handoff="[data-sky-moon]"
      />
      <Experience />
      <Capabilities />
      <OffClock />
      <Contact />
    </>
  );
}
