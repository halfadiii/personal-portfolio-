import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mdx } from "@/components/site/Mdx";
import { Pipeline } from "@/components/sections/Pipeline";
import { Regression } from "@/components/sections/Regression";
import { ReadingProgress } from "@/components/site/ReadingProgress";
import { SectionLabel } from "@/components/site/SectionHeading";
import { projectBySlug } from "@/content";
import {
  getAllCaseStudies,
  getCaseStudy,
  listCaseStudySlugs,
} from "@/lib/work";

export const dynamicParams = false;

export async function generateStaticParams() {
  const slugs = await listCaseStudySlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const study = await getCaseStudy(slug);
  if (!study) return {};
  return {
    title: study.meta.title,
    description: study.meta.summary,
    openGraph: {
      title: study.meta.title,
      description: study.meta.summary,
      type: "article",
    },
  };
}

export default async function CaseStudyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const study = await getCaseStudy(slug);
  if (!study) notFound();

  const live = projectBySlug(slug)?.live;
  const all = await getAllCaseStudies();
  const position = all.findIndex((item) => item.meta.slug === slug);
  const previous = position > 0 ? all[position - 1] : null;
  const next = position < all.length - 1 ? all[position + 1] : null;

  return (
    <>
      <ReadingProgress />

      {/* `shell` sits on the blocks rather than the article, so a section that
          brings its own can be dropped in at full width without ending up
          inside two of them and paying the padding twice. */}
      <article className="section-gap">
        <header className="shell flex flex-col gap-6">
          <SectionLabel
            index={String(position + 1).padStart(2, "0")}
            label="case study"
            meta={study.meta.period}
          />
          <h1 className="font-display text-hero leading-[0.88]">
            {study.meta.title}
          </h1>
          <p className="measure text-lead text-steel">{study.meta.hook}</p>
          <p className="label-mono">{study.meta.stack.join(" · ")}</p>

          {live ? (
            <p>
              <Link
                href={live.href}
                className="label-mono border-signal text-signal ease-brief hover:bg-signal hover:text-void inline-flex items-center gap-3 border px-4 py-3 transition-colors duration-[var(--dur-ui)]"
              >
                {live.label}
                <svg
                  aria-hidden
                  viewBox="0 0 16 10"
                  width="16"
                  height="10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                >
                  <path d="M0 5h14M10 1l4 4-4 4" />
                </svg>
              </Link>
            </p>
          ) : null}
        </header>

        <div className="shell grid-12 mt-16 gap-y-12">
          {study.headings.length ? (
            <nav
              aria-label="On this page"
              className="col-span-12 lg:sticky lg:top-24 lg:col-span-3 lg:self-start"
            >
              <p className="label-mono rule-bottom text-signal pb-2">
                On this page
              </p>
              <ol className="mt-3 flex list-none flex-col gap-2 p-0">
                {study.headings.map((heading, i) => (
                  <li key={heading.id}>
                    <a
                      href={`#${heading.id}`}
                      className="tap label-mono ease-brief hover:text-signal flex gap-3 transition-colors duration-[var(--dur-ui)]"
                    >
                      <span data-numeric>{String(i + 1).padStart(2, "0")}</span>
                      <span>{heading.text}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

          <div className="col-span-12 lg:col-span-8 lg:col-start-5">
            <Mdx source={study.body} />
          </div>
        </div>

        {/* The pipeline and the regression belong to this project, so they
            live here rather than on the home page, where they were two of
            eight sections all arguing about the same one. */}
        {slug === "nyc-subway-reliability" ? (
          <>
            <Pipeline />
            <Regression />
          </>
        ) : null}

        <nav
          aria-label="Other case studies"
          className="shell rule-top mt-20 grid gap-6 pt-8 sm:grid-cols-2"
        >
          {previous ? (
            <Link
              href={`/work/${previous.meta.slug}`}
              className="group flex flex-col gap-2"
            >
              <span className="label-mono">Previous</span>
              <span className="font-display text-sub ease-brief group-hover:text-steel transition-colors duration-[var(--dur-ui)]">
                {previous.meta.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/work/${next.meta.slug}`}
              className="group flex flex-col gap-2 sm:items-end sm:text-right"
            >
              <span className="label-mono">Next</span>
              <span className="font-display text-sub ease-brief group-hover:text-steel transition-colors duration-[var(--dur-ui)]">
                {next.meta.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
        </nav>

        <p className="shell mt-10">
          <Link href="/#work" className="tap label-mono hover:text-signal inline-flex">
            Back to selected work
          </Link>
        </p>
      </article>
    </>
  );
}
