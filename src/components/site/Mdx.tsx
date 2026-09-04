import { MDXRemote } from "next-mdx-remote/rsc";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import type { MDXComponents } from "mdx/types";

/**
 * MDX rendered on the server. Shiki runs through rehype-pretty-code at render
 * time, so no highlighter reaches the client bundle (§2.7).
 */
const components: MDXComponents = {
  h2: (props) => (
    <h2
      {...props}
      // rehype-autolink wraps the heading text in an anchor; it is a deep link,
      // not prose, so it must not inherit the underline prose links carry.
      className="font-display text-title mt-16 scroll-mt-24 first:mt-0 [&_a]:no-underline"
    />
  ),
  h3: (props) => (
    <h3
      {...props}
      className="font-display text-sub mt-10 scroll-mt-24 [&_a]:no-underline"
    />
  ),
  p: (props) => <p {...props} className="measure text-body text-steel mt-5" />,
  ul: (props) => (
    <ul
      {...props}
      className="measure mt-5 flex list-none flex-col gap-2.5 p-0"
    />
  ),
  li: (props) => (
    // Normal flow, not a grid: a grid item per child splits inline <strong>
    // and its following text into separate cells.
    <li
      {...props}
      className="text-body text-steel before:text-hairline relative pl-5 before:absolute before:left-0 before:content-['—']"
    />
  ),
  strong: (props) => <strong {...props} className="text-signal font-medium" />,
  a: (props) => (
    <a
      {...props}
      className="text-signal decoration-hairline ease-brief hover:decoration-signal underline underline-offset-4 transition-colors duration-[var(--dur-ui)]"
    />
  ),
  em: (props) => <em {...props} className="text-signal not-italic" />,
  code: (props) => <code {...props} className="text-signal" />,
  pre: (props) => (
    <pre
      {...props}
      className="border-hairline text-small mt-6 overflow-x-auto border p-4"
    />
  ),
  hr: () => <hr className="border-hairline mt-12 border-0 border-t" />,
};

export function Mdx({ source }: { source: string }) {
  return (
    <MDXRemote
      source={source}
      components={components}
      options={{
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [
            rehypeSlug,
            [
              rehypeAutolinkHeadings,
              { behavior: "wrap", properties: { className: "no-underline" } },
            ],
            [
              rehypePrettyCode,
              {
                theme: "vitesse-black",
                keepBackground: false,
                defaultLang: "text",
              },
            ],
          ],
        },
      }}
    />
  );
}
