import type { Metadata } from "next";
import Link from "next/link";
import {
  certifications,
  education,
  experience,
  profile,
  projects,
  skills,
} from "@/content";
import { formatRange } from "@/lib/utils";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = {
  title: "Résumé",
  description: `One-page résumé for ${profile.name}, ${profile.role.toLowerCase()} in ${profile.location}.`,
};

const isLink = (url: string) => url.startsWith("http");

export default function ResumePage() {
  return (
    <div
      data-surface="print"
      className="bg-void text-signal flex min-h-dvh flex-col"
    >
      <div data-print="hide" className="rule-bottom bg-void">
        <div className="mx-auto flex w-full max-w-[210mm] items-center justify-between gap-4 px-6 py-3">
          <Link href="/" className="label-mono hover:text-signal">
            Back to the site
          </Link>
          <div className="flex items-center gap-3">
            <PrintButton />
            <a
              href="/aditya-aryan-resume.pdf"
              download
              className="label-mono border-hairline text-signal ease-brief hover:bg-signal hover:text-void border px-3 py-2 transition-colors duration-[var(--dur-ui)]"
            >
              Download PDF
            </a>
          </div>
        </div>
      </div>

      <main id="main" className="flex-1">
        <article className="mx-auto w-full max-w-[210mm] px-6 py-10 print:max-w-none print:px-0 print:py-0">
          <header className="rule-bottom pb-5">
            <h1 className="font-display text-[2.75rem] leading-[0.9] print:text-[24pt]">
              {profile.name}
            </h1>
            <p className="text-lead text-steel mt-2 print:text-[11pt]">
              {profile.role} · {profile.location}
            </p>
            <ul className="mt-3 flex list-none flex-wrap gap-x-5 gap-y-1 p-0">
              <li className="label-mono text-signal">
                <a href={`mailto:${profile.email}`}>{profile.email}</a>
              </li>
              <li className="label-mono text-signal" data-numeric>
                <a href={`tel:${profile.phone.replace(/[^+0-9]/g, "")}`}>
                  {profile.phone}
                </a>
              </li>
              {isLink(profile.links.linkedin) ? (
                <li className="label-mono text-signal">
                  <a href={profile.links.linkedin}>LinkedIn</a>
                </li>
              ) : null}
              {isLink(profile.links.github) ? (
                <li className="label-mono text-signal">
                  <a href={profile.links.github}>GitHub</a>
                </li>
              ) : null}
            </ul>
          </header>

          <ResumeSection index="01" title="Summary">
            <p className="measure text-body text-steel print:text-[10pt]">
              {profile.positioning}
            </p>
          </ResumeSection>

          <ResumeSection index="02" title="Experience">
            <ol className="flex list-none flex-col gap-7 p-0 print:gap-4">
              {experience.map((role) => (
                <li
                  key={`${role.org}-${role.title}`}
                  className="grid gap-x-6 gap-y-1 sm:grid-cols-[8.5rem_1fr]"
                >
                  <p className="label-mono text-signal pt-[0.3rem]">
                    {formatRange(role.start, role.end)}
                  </p>
                  <div>
                    <h3 className="font-display text-sub leading-tight print:text-[12.5pt]">
                      {role.title}
                    </h3>
                    <p className="label-mono mt-1">
                      {role.org} · {role.location}
                    </p>
                    <ul className="mt-2.5 flex list-none flex-col gap-1.5 p-0">
                      {role.bullets.map((bullet) => (
                        <li
                          key={bullet}
                          className="measure text-small text-steel grid grid-cols-[1.15rem_1fr] print:text-[9.5pt]"
                        >
                          <span aria-hidden className="text-hairline">
                            —
                          </span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="label-mono mt-2.5">
                      {role.stack.join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </ResumeSection>

          <ResumeSection index="03" title="Education">
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-[8.5rem_1fr]">
              <p className="label-mono text-signal pt-[0.3rem]">
                {formatRange(education.start, education.end)}
              </p>
              <div>
                <h3 className="font-display text-sub leading-tight print:text-[12.5pt]">
                  {education.degree}
                </h3>
                <p className="label-mono mt-1">
                  {education.school} · {education.location} · GPA{" "}
                  {education.gpa}
                </p>
                {education.coursework ? (
                  <p className="text-small text-steel mt-1 print:text-[9.5pt]">
                    <span className="text-signal">Relevant coursework: </span>
                    {education.coursework.join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
          </ResumeSection>

          <ResumeSection index="04" title="Selected projects">
            <ul className="flex list-none flex-col gap-4 p-0">
              {projects.map((project) => (
                <li
                  key={project.slug}
                  className="grid gap-x-6 gap-y-1 sm:grid-cols-[8.5rem_1fr]"
                >
                  <p className="label-mono text-signal pt-[0.15rem]">
                    {project.period}
                  </p>
                  <div>
                    <h3 className="text-body text-signal font-medium print:text-[10.5pt]">
                      {project.title}
                    </h3>
                    <p className="measure text-small text-steel print:text-[9.5pt]">
                      {project.hook}
                    </p>
                    <p className="label-mono mt-1">
                      {project.stack.join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </ResumeSection>

          <ResumeSection index="05" title="Capabilities">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {skills.map((group) => (
                <div key={group.label}>
                  <dt className="label-mono text-signal">{group.label}</dt>
                  <dd className="text-small text-steel mt-1 ml-0 print:text-[9.5pt]">
                    {group.items.join(" · ")}
                  </dd>
                </div>
              ))}
            </dl>
          </ResumeSection>

          <ResumeSection index="06" title="Certifications">
            <ul className="flex list-none flex-col gap-1 p-0">
              {certifications.map((cert) => (
                <li
                  key={`${cert.issuer}-${cert.name}`}
                  className="label-mono text-steel"
                >
                  <span className="text-signal">{cert.issuer}</span>
                  {" · "}
                  {cert.url ? <a href={cert.url}>{cert.name}</a> : cert.name}
                </li>
              ))}
            </ul>
          </ResumeSection>
        </article>
      </main>
    </div>
  );
}

function ResumeSection({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rule-bottom py-5 last:border-b-0 print:py-3">
      <h2 className="label-mono text-signal mb-3">
        {index} / {title.toLowerCase()}
      </h2>
      {children}
    </section>
  );
}
