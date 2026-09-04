import type { Metadata, Viewport } from "next";
import { profile } from "@/content";
import { fontVariables } from "@/lib/fonts";
import { JsonLd, personSchema, websiteSchema } from "@/lib/seo";
import { site } from "@/lib/site";
import { SkipLink } from "@/components/site/SkipLink";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.name,
    template: `%s — ${profile.name}`,
  },
  description: site.description,
  applicationName: profile.name,
  authors: [{ name: profile.name }],
  creator: profile.name,
  openGraph: {
    type: "website",
    locale: site.locale,
    url: site.url,
    siteName: site.name,
    title: site.name,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description: site.description,
  },
  robots: { index: true, follow: true },
};

const PRELOADER_GATE = `(function(){var r=document.documentElement;if(location.pathname!=="/"){r.dataset.preloader="off";return}try{if(sessionStorage.getItem("preloader-seen")==="1"){r.dataset.preloader="off";return}}catch(e){}if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){r.dataset.preloader="off";return}r.dataset.preloader="on"})()`;

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Decides before first paint whether the preloader runs at all, so it
            never flashes for a returning visitor or under reduced motion. With
            JavaScript off the attribute is never set and the overlay stays
            hidden by default (§2.5). */}
        <script dangerouslySetInnerHTML={{ __html: PRELOADER_GATE }} />
      </head>
      <body className="bg-void text-signal flex min-h-dvh flex-col">
        <SkipLink />
        {children}
        <JsonLd data={personSchema()} />
        <JsonLd data={websiteSchema()} />
      </body>
    </html>
  );
}
