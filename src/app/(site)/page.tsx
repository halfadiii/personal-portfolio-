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

      <Hero caseStudies={caseStudies} />
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
