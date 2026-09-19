import { netflix, type TrailerViews } from "@/lib/netflix-data";

export const runtime = "nodejs";
/*
 * Evaluated per request, with the YouTube call itself cached for a day.
 *
 * The first version used `revalidate = 3600`, which let Next prerender the
 * route at build time -- and a build without the key baked "not configured"
 * into the cache, so the panel stayed dark for an hour after the key existed,
 * and every build depended on YouTube answering. Measured locally, not
 * guessed: the server had the key and the route still said it did not.
 * Dynamic evaluation reads the key at request time; the `next.revalidate` on
 * the fetch below keeps YouTube to one call a day regardless of traffic.
 */
export const dynamic = "force-dynamic";

/**
 * Current YouTube view counts for the dashboard's 20 trailers.
 *
 * ## Why this is fetched and not stored
 *
 * YouTube's API policies let an app keep statistics for videos it doesn't own
 * for at most 30 days (Developer Policies III.E.4.d), and require showing the
 * most recent data available (III.E.4.f). A number baked into the page at build
 * time would break both within a month. So the page ships only which trailer
 * belongs to which title, and asks YouTube for the counts here: one
 * `videos.list` call covering all 20, which costs one unit of the key's
 * 10,000-unit daily quota, made at most once a day.
 *
 * ## Without a key
 *
 * YOUTUBE_API_KEY lives in the hosting environment, never in the repo. Without
 * it the panel says so and the rest of the dashboard is unaffected.
 */
export async function GET() {
  const key = process.env.YOUTUBE_API_KEY;
  const ids = netflix.trailers.map((t) => t.videoId);

  if (!key) {
    return Response.json({ available: false, reason: "not configured" } satisfies TrailerViews);
  }

  try {
    const url =
      "https://www.googleapis.com/youtube/v3/videos?" +
      new URLSearchParams({ part: "statistics", id: ids.join(","), key });
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) {
      return Response.json({ available: false, reason: `YouTube answered ${response.status}` } satisfies TrailerViews);
    }
    const data = (await response.json()) as {
      items?: { id: string; statistics?: { viewCount?: string } }[];
    };
    const views: Record<string, number> = {};
    for (const item of data.items ?? []) {
      const count = Number(item.statistics?.viewCount);
      if (Number.isFinite(count)) views[item.id] = count;
    }
    return Response.json({
      available: true,
      fetchedAt: new Date().toISOString(),
      views,
    } satisfies TrailerViews);
  } catch {
    return Response.json({ available: false, reason: "YouTube could not be reached" } satisfies TrailerViews);
  }
}
