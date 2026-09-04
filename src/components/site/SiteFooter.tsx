import { profile } from "@/content";
import { Clock } from "./Clock";
import { FooterControls } from "./FooterControls";

const hasLink = (url: string) => url.startsWith("http");

export function SiteFooter() {
  return (
    <footer className="rule-top mt-[var(--rhythm)]">
      <div className="shell flex flex-col gap-6 py-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {/* One of the two centred moments on the site (§4.3). */}
          <Clock className="label-mono text-signal text-center" />
          <FooterControls />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {hasLink(profile.links.github) ? (
            <a
              className="tap label-mono hover:text-signal inline-flex"
              href={profile.links.github}
              rel="me noreferrer"
              target="_blank"
            >
              GitHub
            </a>
          ) : null}
          {hasLink(profile.links.linkedin) ? (
            <a
              className="tap label-mono hover:text-signal inline-flex"
              href={profile.links.linkedin}
              rel="me noreferrer"
              target="_blank"
            >
              LinkedIn
            </a>
          ) : null}
          <a
            className="tap label-mono hover:text-signal inline-flex"
            href={`mailto:${profile.email}`}
          >
            {profile.email}
          </a>
          <span className="label-mono" data-numeric>
            © 24 · 26
          </span>
        </div>
      </div>
    </footer>
  );
}
