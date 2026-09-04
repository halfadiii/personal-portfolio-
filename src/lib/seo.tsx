import type { Person, WebSite, WithContext } from "schema-dts";
import { education, profile, skills } from "@/content";
import { site } from "./site";

const externalLinks = [profile.links.linkedin, profile.links.github].filter(
  (url) => url.startsWith("http"),
);

export function personSchema(): WithContext<Person> {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    jobTitle: profile.role,
    email: `mailto:${profile.email}`,
    telephone: profile.phone,
    url: site.url,
    description: profile.positioning,
    address: {
      "@type": "PostalAddress",
      addressLocality: "New York",
      addressRegion: "NY",
      addressCountry: "US",
    },
    alumniOf: {
      "@type": "CollegeOrUniversity",
      name: education.school,
    },
    knowsAbout: skills.flatMap((group) => group.items),
    ...(externalLinks.length ? { sameAs: externalLinks } : {}),
  };
}

export function websiteSchema(): WithContext<WebSite> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: site.url,
    inLanguage: "en-US",
    author: { "@type": "Person", name: profile.name },
  };
}

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // Schema objects are built from local content, never user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
