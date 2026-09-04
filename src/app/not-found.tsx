import Link from "next/link";
import { featuredProject } from "@/content";

/** §6 — an empty state that offers a route, not a joke. */
export default function NotFound() {
  return (
    <main id="main" className="shell section-gap flex-1">
      <p className="label-mono">
        <span className="text-signal" data-numeric>
          404
        </span>{" "}
        / no page at this address
      </p>

      <h1 className="font-display text-hero mt-6 leading-[0.88]">
        That page isn&rsquo;t here.
      </h1>

      <p className="measure text-lead text-steel mt-6">
        The link is either out of date or was never a page. These three go
        somewhere.
      </p>

      <ul className="mt-10 flex list-none flex-col p-0">
        {[
          {
            href: `/work/${featuredProject.slug}`,
            label: featuredProject.title,
            meta: featuredProject.hook,
          },
          {
            href: "/#work",
            label: "Selected work",
            meta: "Six projects, with the numbers each one earned.",
          },
          {
            href: "/resume",
            label: "Résumé",
            meta: "One page, printable, downloadable.",
          },
        ].map((item) => (
          <li key={item.href} className="rule-top last:rule-bottom">
            <Link
              href={item.href}
              className="group flex flex-col gap-1 py-5 sm:flex-row sm:items-baseline sm:gap-8"
            >
              <span className="font-display text-title ease-brief group-hover:text-steel leading-none transition-colors duration-[var(--dur-ui)]">
                {item.label}
              </span>
              <span className="label-mono">{item.meta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
