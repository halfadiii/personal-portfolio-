# Aditya Aryan — portfolio

Built to the brief in `../portfolio-master-prompt.md`. Section references below
(§4.1, §6.5, and so on) point at that document.

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # runs the content check first, next-sitemap after
npm test             # Playwright: axe on every route + the §12 checklist
```

---

## What the client still owes

The first three block the §12 acceptance checklist. `npm run check:content`
prints them; `npm run check:content:strict` (and CI, via `STRICT_CONTENT=1`)
fails the build while any remain.

| Item                                 | Where it goes                                         | What happens meanwhile                                                                             |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Exact LinkedIn and GitHub URLs       | `src/content/profile.ts` → `links`                    | Those links are omitted from the header, footer, résumé, and JSON-LD rather than pointing nowhere. |
| Dates the bank marketing project ran | `src/content/projects.ts` → `bank-marketing-strategy` | Shows `TODO — confirm dates` in the work rail and the orbit.                                       |
| Résumé PDF                           | `public/aditya-aryan-resume.pdf`                      | The Download button on `/resume` and in the palette 404s until it exists.                          |
| Certification verification URLs      | `src/content/certifications.ts` → `url`               | Each row renders as plain text; adding a `url` turns it into a link.                               |
| Deployment origin                    | `NEXT_PUBLIC_SITE_URL`                                | Metadata, OG tags, and the sitemap fall back to `http://localhost:3000`.                           |
| Resend key and from-address          | `RESEND_API_KEY`, `CONTACT_FROM`                      | The contact route returns 503 with "email directly" rather than failing silently.                  |

Copy `.env.example` to `.env.local` for the environment variables.

---

## Routes

| Route                       | What it is                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                         | Hero orbit → metric strip → work rail → **scroll trail** → pipeline diagram → regression → experience → capabilities → contact                        |
| `/dashboard/bank-marketing` | A live dashboard over 43,193 telemarketing contacts, filtered in the browser                                                                          |
| `/demo/subway`              | The whole NYC network in 3D from the MTA's GTFS feed, then one arrival being inferred on the L                                                        |
| `/demo/print-inspection`    | The EagleEyes ticket press running: tickets seven across and three deep, replaying 2,315 real camera-frame verdicts from the production vision engine |
| `/work/[slug]`              | MDX case studies with a sticky table of contents and reading progress                                                                                 |
| `/about`, `/resume`         | Bio and the inverted printable résumé                                                                                                                 |
| `/api/contact`              | Zod-validated, rate-limited, Resend                                                                                                                   |

---

## The three set pieces

### The hero orbit

A star at the centre, the projects orbiting it as lit planets, a procedural
galaxy behind. Drag anywhere to turn the ring like a wheel; it carries momentum
and settles. Clicking a planet brings it to the front; the panel underneath
names whichever project is there. Arrow buttons and dots give the same control
from the keyboard, and the canvas itself is `aria-hidden` because those controls
already carry the content.

Below 900px, under reduced motion, or on a machine with fewer than four cores,
none of it mounts and the hero falls back to the server-rendered constellation
field. `three` is behind `next/dynamic` _and_ behind that gate, so those
visitors never download it.

### The scroll trail

`ScrollTrail` is a section `chapters × 100vh` tall with a `position: sticky`
viewport inside it — no ScrollTrigger, because the browser pins natively and
sticky survives with JavaScript off. Scroll progress is a plain number derived
from the section's own bounding box, kept in a ref and read once per frame; a
scroll handler that set React state would re-render the tree on every tick.

Two visuals cross over in the middle: eight filaments braiding into one strand
(one per MTA feed) dissolving as a node graph resolves, which is what the copy
is describing at that point. Both are `THREE.Points` with additive blending and
a soft falloff in the fragment shader — that is where the glow comes from, with
no bloom pass, which is the difference between running on a laptop and not.

Without the scene the same six chapters are simply stacked down the page.

### The bank marketing dashboard

Rebuilt from part-6 of `project/bank_marketing_strategy-main`, running in the
browser instead of in Dash. `scripts/build-bank-dashboard.py` replays the
notebooks' own cleaning, 3NF normalisation, and three classifiers against
`bank-full.csv`, then writes:

- `public/data/bank-marketing.bin` — 43,193 rows, columnar, 844 KB
- `src/content/data/bank-marketing.json` — schema, categories, model metrics

The browser reads each column as a typed array, so every filter re-aggregates
all 43,193 rows in about a millisecond: no server, no pre-baked combinations.

Every figure on that page came out of that script. Nothing was typed in by hand.

| Model               | Accuracy | F1     | ROC AUC |
| ------------------- | -------- | ------ | ------- |
| Logistic regression | 0.9029   | 0.4632 | 0.9095  |
| Decision tree       | 0.8679   | 0.4501 | 0.6930  |
| Gradient boosting   | 0.9051   | 0.5024 | 0.9162  |

Re-run it with `python scripts/build-bank-dashboard.py` (needs pandas,
scikit-learn, scipy).

---

## The star at the centre of the orbit

There is not a single `three.js` light in the hero. The star is a corona and
nothing else — an exponential core and three drifting ray frequencies, every
term dying to zero before it reaches the edge of the quad it is drawn on, which
is what stops a circle from appearing. What it exports is not light but a
position: `Sun` writes its world coordinates into a ref every frame, and every
surface in the scene works out for itself how much of that star it can see.

That one number is the source of all of this:

- **Terminators.** Each planet shades itself from the real direction to the
  star, with a soft edge because at forty pixels across a hard one reads as a
  cut.
- **Ring shadows, both ways.** A ringed planet walks the ray from each patch of
  ground toward the star, finds where it crosses the ring plane, and asks how
  much ring is at that radius — so the shadow carries the ring's own divisions
  as bright lanes. The ring does the reverse against the planet's sphere, with
  a softened penumbra.
- **The name.** `Aditya Aryan` is real text — it has to be, for selection,
  search, print, and the font's width axis — so it cannot be lit by a renderer.
  `Sunlight` instead projects the star into the canvas's coordinates and writes
  the direction and distance to each `[data-sunlit]` element as custom
  properties; the stylesheet turns those into a warm edge on the side facing the
  star and a cast shadow on the side away from it.

Moving the pointer leans the **star**, not the system. Moving everything
together would change no angle and therefore no shadow; leaning the star turns
every terminator by a few degrees, swings the ring shadows across their planets,
and rolls the lighting on the name — one cause, and you can see it in three
places at once. The sway is deliberately small: half a world unit against an
orbit radius of 3.45.

**What is not drawn:** planets do not shadow one another. Seven bodies equally
spaced on a circle are never two-to-a-side of the star, so no such shadow could
fall. That is the physics, not an omission.

---

## Where the build departs from the brief, and why

Each of these is a case where two parts of the brief pulled against each other.

**Work rail marks are SVG, not Recharts sparklines.** §6.4 asks for a sparkline
of each project's key metric, but §2.6 forbids invented numbers, and §5 gives
point values and one genuine before/after — no time series. `MetricMark` picks a
form the source actually supports: a two-point delta for 69 → 95 mAP, a level
bar for 87% accuracy, a shortfall below baseline, eight units for eight feeds.
Recharts is still the chart library, on the regression and the dashboard.

**Experience uses `<details>`, not the Radix accordion.** §2.5 wants the page
usable with JavaScript failed, and Radix keeps collapsed content inert without
hydration. Dropping the primitive also helped hold §8's 180 KB budget.

**A lightened blue for marks on black.** §4.1 fixes `--line-blue` at `#0039A6`,
which is 1.7:1 against the canvas — a line nobody can follow, and below the 3:1
WCAG asks of meaningful graphics. `tokens.css` adds `--line-blue-on-void:
#2F5FBF`, the same hue at 3.5:1, used only for strokes on `--void`.

**Errors are not red.** §4.1 says colour appears only where it encodes data, so
an invalid field is marked by an `error —` mono prefix, never by turning red.

**Next 15, not 16.** `create-next-app@latest` now scaffolds Next 16; §3
specifies 15, so the scaffold was pinned back.

**A procedural galaxy, not a video.** A clip good enough for a full-screen hero
is several megabytes, cannot react to the drag, and would undo §8 on its own.
Noise on the GPU costs a few kilobytes and renders at any resolution.

---

## Motion

One orchestrated moment on load, then motion only in response to action (§4.4).

The preloader is deliberately plain `requestAnimationFrame` and CSS transitions
rather than GSAP: it runs inside the load window, and pulling in a 50 KB
animation library to move four properties showed up directly as blocking time.
GSAP owns the scroll-linked work — the constellation drift, the cursor lean, the
pinned work rail — and all of it starts on `requestIdleCallback` after the
preloader hands over.

An inline script in `layout.tsx` decides before first paint whether the
preloader runs at all: not off the home page, not for a visitor who has already
seen it this session, not under reduced motion. With JavaScript off the
attribute is never set and CSS keeps the overlay hidden, so it can never trap
anyone behind a curtain it cannot lift.

Smooth scrolling and the constellation drift are gated to fine pointers and to
≥640px respectively — touch platforms already have better momentum scrolling
than a library can synthesise, and the drift was animating nodes that are not
rendered at that width.

---

## Fonts

Downloaded once into `src/fonts/source/` and subset to the site's charset by
`npm run gen:fonts` (needs Python with `fonttools` and `brotli`). That cuts the
three faces from 168 KB to 94 KB, most of the mobile critical path. Both
variable axes survive — the hero animates Archivo's width axis, so `fvar` and
`gvar` must not be dropped.

Re-run after adding copy that uses a character outside `CHARSET`; the script
prints anything it had to drop. It already reports that none of the three faces
carries an arrow or `⌘` glyph, which is why the work-rail arrow is drawn as SVG
and the palette shortcut is spelled `Ctrl K` / `Cmd K`.

---

## The data behind the pages

Three scripts fetch published sources and commit the result, so no page ever
depends on a live warehouse or an API being awake.

| Script                         | Source                                                                           | Output                                                  |
| ------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `npm run gen:dashboard`        | The client's own notebooks, replayed against `bank-full.csv`                     | `public/data/bank-marketing.bin` + summary JSON         |
| `npm run gen:subway-map`       | MTA static GTFS feed                                                             | `public/data/subway-map.json` — 29 routes, 496 stations |
| `npm run gen:wait-snapshot`    | MTA Customer Journey-Focused Metrics + Central Park hourly rainfall (Open-Meteo) | `src/content/data/subway-wait-snapshot.json`            |
| `npm run gen:print-inspection` | The EagleEyes production run: `visualizer_results.csv` + `rules.json`            | `src/content/data/print-inspection.json`                |

The last one is worth reading the header of. It regresses the MTA's own
`additional_platform_time` on the share of each month that was wet, per line,
controlling for month-of-year and for the 2020–21 collapse — and over eleven
years and five lines, **all five confidence intervals contain zero**. §6.6
reports that rather than hunting for a specification that crosses a threshold,
which is the failure the rest of the page is arguing against. It is also the
argument for the pipeline: a monthly average over every trip is the wrong
instrument for a question about the twenty minutes it was raining.

---

## Verification

Measured on this build, `npm run build && npx next start`:

| §8 budget                          | Result                                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lighthouse ≥ 95, mobile emulation  | **92–96** performance across runs / 100 a11y / 100 best practices / 100 SEO. Its LCP is _simulated_ rather than measured and swings 2.3–3.1s between identical runs on this page; the other three categories are stable at 100. |
| Lighthouse, desktop                | **100 / 100 / 100 / 100**                                                                                                                                                                                                       |
| CLS < 0.02                         | **0.0004** measured, **0** as Lighthouse scores it                                                                                                                                                                              |
| LCP < 2.0s                         | **0.70s** under 1.6 Mbps / 150ms RTT / 4× CPU (`npm run measure:vitals`)                                                                                                                                                        |
| Initial JS ≤ 180 KB gzipped        | **169 KB** on `/`                                                                                                                                                                                                               |
| Zero axe violations on every route | 36 Playwright tests pass, desktop and mobile                                                                                                                                                                                    |

Both LCP figures are reported rather than picking the flattering one.

`npm test` also covers the mechanical half of §12: no horizontal overflow at
320px on any route, visible and untrapped focus across 60 tab stops, the skip
link landing on `#main`, nothing animating under reduced motion, all text
present with JavaScript disabled, the palette opening on the keyboard, a
pipeline stage opening its panel, and the contact form saying what broke.

`npm run shots -- --widths=320,390,768,1440` writes full-page screenshots and
reports any route that scrolls horizontally.

**One known console notice**, on desktop only: `THREE.Clock: This module has
been deprecated`. It comes from inside `@react-three/fiber`, which calls a
`three` API that `three` has since deprecated. Both packages are on their latest
versions (fiber 9.7.0, three 0.185.1); it clears when fiber updates, and there
is nothing to change in this repository.

---

## Layout

```
src/
  app/
    (site)/            # routes wearing the site chrome
      dashboard/       # the live bank marketing dashboard
    resume/            # own chrome: inverted surface, no nav in print
    api/contact/       # Resend, zod-validated, rate limited
  components/
    motion/            # capability gate, Lenis provider, preloader, home motion
    sections/          # Hero, MetricStrip, SelectedWork, ScrollTrail, ...
    site/              # header, footer, palette, cursor, MDX, providers
    three/             # orbit scene, star and its light, galaxy, subway map, trail
    viz/               # MetricMark, PipelineDiagram, RegressionPlot, dashboard
  content/             # typed data (§5) + MDX case studies + datasets
  lib/                 # fonts, seo, snapshot, bank-data, highlight, work
  stores/              # zustand: sound, palette, cursor label
  styles/tokens.css    # §4 design tokens
scripts/               # content check, screenshots, vitals, fonts, sounds, data
```

Library ownership follows §3's table: GSAP for scroll timelines and pinning,
Lenis for smooth scroll driving ScrollTrigger, Recharts for charts with axes,
hand-written SVG and GLSL for the bespoke visuals, Zustand for UI state. Server
components by default; `'use client'` only where interactivity demands it.
