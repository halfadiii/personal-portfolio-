import dynamic from "next/dynamic";
import { profile } from "@/content";
import { SectionLabel } from "@/components/site/SectionHeading";
import { CopyEmail } from "./CopyEmail";

/**
 * react-hook-form, zod, and the resolver are a quarter of the page's
 * JavaScript for a form at the very bottom of it. Server rendering stays on, so
 * the fields are in the HTML and readable without JavaScript; only the client
 * chunk is deferred (§2.5, §8).
 */
const ContactForm = dynamic(() =>
  import("./ContactForm").then((mod) => mod.ContactForm),
);

export function Contact() {
  return (
    <section
      id="contact"
      aria-labelledby="contact-title"
      className="section-gap-loose"
    >
      <div className="shell">
        <SectionLabel
          index="06"
          label="contact"
          meta="new york city / eastern"
        />

        <h2
          id="contact-title"
          className="font-display text-hero mt-6 leading-[0.88]"
        >
          Let&rsquo;s talk.
        </h2>

        <div className="grid-12 mt-12 gap-y-10">
          <div className="col-span-12 flex flex-col gap-6 lg:col-span-5">
            <p className="measure text-lead text-steel">
              Analytics engineering and senior analyst roles, or anything where
              the reporting layer needs to be rebuilt rather than reskinned.
            </p>

            <CopyEmail email={profile.email} />

            <dl className="flex flex-col gap-3">
              <div className="flex items-baseline gap-3">
                <dt className="label-mono">Phone</dt>
                <dd className="label-mono text-signal" data-numeric>
                  <a
                    className="tap inline-flex"
                    href={`tel:${profile.phone.replace(/[^+0-9]/g, "")}`}
                  >
                    {profile.phone}
                  </a>
                </dd>
              </div>
              <div className="flex items-baseline gap-3">
                <dt className="label-mono">Based</dt>
                <dd className="label-mono text-signal">{profile.location}</dd>
              </div>
            </dl>
          </div>

          <div className="col-span-12 lg:col-span-6 lg:col-start-7">
            <ContactForm />
          </div>
        </div>
      </div>
    </section>
  );
}
