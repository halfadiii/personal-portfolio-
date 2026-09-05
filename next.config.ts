import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    // Import only the icons and primitives actually referenced (§8 budget).
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "@radix-ui/react-dialog",
      "@radix-ui/react-accordion",
      "@radix-ui/react-slider",
    ],
  },
  async headers() {
    return [
      {
        source: "/sound/:path*",
        headers: [
          {
            key: "cache-control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        /*
         * The maps under /media are the heaviest thing the site serves — the
         * four Earth textures alone are most of two megabytes — and by default
         * they came back as `max-age=0`. That does not mean a repeat visitor
         * downloads them again; the ETag still turns the second visit into a
         * 304 with no body. It means four conditional round trips before the
         * globe can draw, which on a phone is the part you feel.
         *
         * A month rather than a year, and no `immutable`. These filenames are
         * not content-addressed the way Next's own chunks are, so regenerating
         * a map keeps its name — and `immutable` would tell a browser it need
         * never look again. A month of instant repeat loads, then one cheap
         * revalidation, is the trade that cannot go wrong.
         */
        source: "/media/:path*",
        headers: [
          {
            key: "cache-control",
            value: "public, max-age=2592000, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default bundleAnalyzer({ enabled: process.env.ANALYZE === "true" })(
  nextConfig,
);
