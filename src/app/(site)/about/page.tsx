import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { about } from "@/content/about";
import { certifications, education, profile } from "@/content";
import { SectionLabel } from "@/components/site/SectionHeading";
import { formatRange } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About",
  description: `${profile.name} — ${profile.role} in ${profile.location}. Education, certifications, and what the work is actually like.`,
};

export default function AboutPage() {
  const { portrait } = about;

  return (
    <div className="shell section-gap">
      <header className="flex flex-col gap-6">
        <SectionLabel
          index="—"
          label="about"
          meta={profile.location.toLowerCase()}
        />
        <h1 className="font-display text-hero leading-[0.88]">
          The unglamorous half.
        </h1>
      </header>

      <div className="grid-12 mt-16 gap-y-12">
        <figure className="col-span-12 m-0 sm:col-span-6 lg:col-span-4">
          {portrait.available ? (
            <Image
              src={portrait.src}
              alt={portrait.alt}
              width={portrait.width}
              height={portrait.height}
              className="border-hairline w-full border"
              sizes="(min-width: 1024px) 32vw, (min-width: 640px) 48vw, 92vw"
              priority
            />
          ) : (
            <div
              className="border-hairline bg-panel flex w-full items-end border p-4"
              style={{ aspectRatio: `${portrait.width} / ${portrait.height}` }}
            >
              <p className="label-mono">
                Portrait pending — 2000px, neutral background (Appendix A).
              </p>
            </div>
          )}
        </figure>

        <div className="col-span-12 flex flex-col gap-6 lg:col-span-7 lg:col-start-6">
          {about.paragraphs.map((paragraph) => (
            <p key={paragraph} className="measure text-lead text-steel">
              {paragraph}
            </p>
          ))}

          <p className="measure text-lead text-signal">
            Beyond the résumé: {about.beyond.join(" · ")}.
          </p>
        </div>
      </div>

      <section
        aria-labelledby="education-title"
        className="rule-top mt-20 pt-10"
      >
        <h2 id="education-title" className="label-mono text-signal">
          Education
        </h2>
        <div className="mt-6 grid gap-x-8 gap-y-2 lg:grid-cols-[10rem_1fr]">
          <p className="label-mono">
            {formatRange(education.start, education.end)}
          </p>
          <div>
            <h3 className="font-display text-title leading-[0.95]">
              {education.degree}
            </h3>
            <p className="label-mono mt-2">
              {education.school} · {education.location} · GPA {education.gpa}
            </p>
            {education.coursework ? (
              <p className="measure text-small text-steel mt-3">
                <span className="text-signal">Relevant coursework: </span>
                {education.coursework.join(", ")}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="certifications-title"
        className="rule-top mt-16 pt-10"
      >
        <h2 id="certifications-title" className="label-mono text-signal">
          Certifications
        </h2>
        <ul className="mt-6 flex list-none flex-col p-0">
          {certifications.map((cert) => (
            <li
              key={`${cert.issuer}-${cert.name}`}
              className="rule-bottom grid gap-x-6 py-3 last:border-b-0 sm:grid-cols-[12rem_1fr]"
            >
              <span className="label-mono text-signal">{cert.issuer}</span>
              <span className="label-mono">
                {cert.url ? (
                  <a
                    href={cert.url}
                    rel="noreferrer"
                    target="_blank"
                    className="decoration-hairline hover:decoration-signal underline underline-offset-4"
                  >
                    {cert.name}
                  </a>
                ) : (
                  cert.name
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="label-mono mt-4">
          Verification links are added as the client supplies them.
        </p>
      </section>

      <p className="mt-16">
        <Link
          href="/#contact"
          className="label-mono text-signal hover:text-steel"
        >
          Get in touch
        </Link>
      </p>
    </div>
  );
}
