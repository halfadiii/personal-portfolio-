# MASTER FILE

**Everything about this portfolio, in one document.**

This file exists so that any person or AI handed this repository can understand
it completely without reading the whole codebase or the whole git history: what
it is, who it is for, how every part works, why each decision was made, what was
tried and abandoned, what is still unfinished, and what the rules are for
changing it.

It is written for someone with no prior context. Read section 1 and 2 to know
what you are looking at, section 5 to find your way around the files, and
sections 17 and 18 before you change anything, because most of the code that
looks strange in here is code that is the way it is for a measured reason.

Last updated: 2026-09-06, at commit `eb7396b`.

---

## Table of contents

1. [What the site is](#1-what-the-site-is)
2. [Who it is for, and the standing rules](#2-who-it-is-for-and-the-standing-rules)
3. [Quick start](#3-quick-start)
4. [Deployment: Vercel, the domain, and how updates reach the live site](#4-deployment)
5. [Repository layout](#5-repository-layout)
6. [Every route, section by section](#6-every-route-section-by-section)
7. [The content layer](#7-the-content-layer)
8. [The design system](#8-the-design-system)
9. [The WebGL layer: every scene explained](#9-the-webgl-layer)
10. [The Earth to Moon relay](#10-the-earth-to-moon-relay)
11. [Motion architecture](#11-motion-architecture)
12. [Performance architecture and budgets](#12-performance-architecture-and-budgets)
13. [Accessibility](#13-accessibility)
14. [The data pipeline scripts](#14-the-data-pipeline-scripts)
15. [Testing and measurement tooling](#15-testing-and-measurement-tooling)
16. [Deliberate departures from the original brief](#16-deliberate-departures-from-the-original-brief)
17. [Complete change history](#17-complete-change-history)
18. [Mistakes made, and what they taught](#18-mistakes-made-and-what-they-taught)
19. [Known limitations and open items](#19-known-limitations-and-open-items)
20. [House rules for whoever works on this next](#20-house-rules-for-whoever-works-on-this-next)

---

## 1. What the site is

A personal portfolio for **Aditya Aryan**, a data analyst and analytics engineer
based in New York City. It is a Next.js 15 application deployed on Vercel at
**https://adityaaryan.in**.

Its single job, stated in the original brief: *convince a hiring manager in
forty seconds that this person builds things, not just slides.*

The visual language is award-site territory: true-black canvas, oversized
grotesk type used structurally, monospace micro-labels, a horizontal work rail,
a sound toggle in the footer. What makes it different from an agency site is
that **the portfolio is instrumented**. The charts are real. The dashboard runs
on 43,193 real rows in the browser. The subway demo runs the same arrival
inference the real pipeline runs. Data is the decoration, and every number on
the site can be traced back to a script or a source document.

There is one more layer on top of that, and it is the thing people notice
first: the site is set in space. A procedural galaxy sits behind the entire
document. The hero is a star with the projects orbiting it as lit planets. A
scroll narrative sits over the Earth built from NASA imagery. During the
experience section the Moon comes out from behind that Earth, takes over the
frame, and travels down the page to become the moon beside the about section.
None of it is a video or a model file. All of it is generated or lit in real
time from one star position.

**Repository:** `github.com/halfadiii/personal-portfolio-`, branch `main`.
**Local path:** `C:\Adi\PROJECTS\Portfolio\portfolio` (the Next app is the root
of the git repo, so Vercel needs no root-directory setting).
**Original brief:** `../portfolio-master-prompt.md`, one directory up. Section
references throughout the codebase (§4.1, §6.5, and so on) point at that file.

---

## 2. Who it is for, and the standing rules

### The client

Aditya Aryan. Data Analyst / Analytics Engineer. MPS in Data Science and
Applications from SUNY Buffalo. **He is not a coder.** Every explanation given
to him has to be in plain language, and any question put to him has to be a
question about the site, not about the implementation.

### The voice

Site copy is written in his voice, taken from how he actually talks about his
work rather than invented. His one-liner: *"I'm the person who takes messy data
that's scattered across different systems and turns it into something a business
can actually use to make decisions."*

His arc, in his order: start with the goal not the data, make the raw data
correct, set up checks so it stays clean instead of fixing the same thing every
month, model it, then the "so what", then a dashboard built backwards from the
questions someone would actually ask.

Lines that are his and worth reusing: *"When the numbers are right, people make
better calls. When they're wrong, everyone's just guessing with confidence."* ·
*"what sells the most isn't always what makes the most money"* · *"is it
seasonal, is it a supply issue, is it just how this business breathes"* ·
leadership should *"open it and understand the health of the business in about
ten seconds, then dig deeper"*.

Register: first person, contractions, an aside or two, plain words over
technical ones where both work. Dry rather than jokey.

### The non-negotiables

These come from the brief and from him directly, and they have never been
relaxed:

1. **No lorem ipsum, no fake logos, no invented metrics.** Every figure on the
   site traces to a source. Where a number does not exist, the site says so
   rather than filling the space.
2. **Colour only where it encodes data.** The palette is black, off-white,
   steel grey, and a hairline. The four MTA line colours appear only in the
   subway work. Errors are not red; an invalid form field is marked with a mono
   `error —` prefix.
3. **Responsive to 320px.** Nothing scrolls horizontally that is not meant to.
4. **Keyboard complete.** Every interactive element reachable and visibly
   focused. Skip link. Command palette on Ctrl/Cmd K.
5. **`prefers-reduced-motion` respected everywhere.** Under reduced motion
   nothing animates, no scene mounts, no cursor effect, no autoplay.
6. **No layout shift.** Every image and canvas reserves its dimensions.
7. **Works with JavaScript partially failed.** Content is server-rendered HTML;
   all motion is enhancement.
8. **Initial JS at or under 180 KB gzipped** on the home page.
9. **Zero axe violations** on every route, desktop and mobile.
10. **No em dashes in the scroll trail copy.** His instruction. Colons, commas
    and full stops do the same work. (Other sections of the site still use
    them; this rule was scoped to the trail.)

### Two security constraints still in force

- His email address is used only to identify him (authorship, the contact
  route's recipient). It is never sent to an unrelated service.
- The Resend API key is never pasted into a chat, a commit, or a file that is
  not gitignored. It lives in `.env.local` and is typed directly into Vercel's
  environment-variable UI. If it is ever exposed, rotate it in the Resend
  dashboard.

---

## 3. Quick start

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # runs the content check first, next-sitemap after
npm test             # Playwright: axe on every route + the acceptance checklist
```

### All scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | Production build; `prebuild` runs the content check, `postbuild` runs next-sitemap |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` | Prettier, with the Tailwind class-sorting plugin |
| `npm run check:content` | Warn on any `TODO` string in `src/content` |
| `npm run check:content:strict` | Same, but fails the build. CI sets `STRICT_CONTENT=1` |
| `npm test` | Full Playwright suite (chromium + Pixel 5) |
| `npm run test:a11y` | axe only |
| `npm run shots` | Full-page screenshots at chosen widths; reports horizontal overflow |
| `npm run audit` | Sweeps every route at every breakpoint for overflow, clipped text, console errors, bad responses |
| `npm run measure:vitals` | Real Core Web Vitals under throttling, not Lighthouse's simulation |
| `npm run measure:frames` | Frame-time distributions per interaction. **Run headed.** |
| `npm run analyze` | Bundle analyzer |
| `npm run gen:sounds` | Synthesise the two UI ticks |
| `npm run gen:earth` | Fetch and prepare the four Earth maps from NASA masters |
| `npm run gen:fonts` | Subset the three variable faces (needs Python, fonttools, brotli) |
| `npm run gen:dashboard` | Rebuild the bank marketing data (needs pandas, scikit-learn, scipy) |
| `npm run gen:subway-map` | Rebuild the network from the MTA GTFS feed |
| `npm run gen:wait-snapshot` | Rebuild the rainfall regression snapshot |
| `npm run gen:print-inspection` | Rebuild the print inspection run from the production engine's CSV |

### Environment variables

Copy `.env.example` to `.env.local`. Three matter in production:

| Variable | Effect if missing |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Metadata, OG tags and the sitemap fall back to `http://localhost:3000`. Link previews on WhatsApp and LinkedIn break, because `og:image` needs an absolute URL. Set to `https://adityaaryan.in`. |
| `RESEND_API_KEY` | The contact route returns 503 with "email directly" rather than failing silently. |
| `CONTACT_FROM` | Same. Format: `Portfolio <hello@example.com>`. |
| `PORTFOLIO_SAMPLE_SNAPSHOT` | Development only. Set to `1` to load a **synthetic** regression fixture. Never set this in production. |

---

## 4. Deployment

### Where it lives

**Vercel**, connected to `github.com/halfadiii/personal-portfolio-` on branch
`main`. The Next app is the root of the git repo, so no root-directory setting
is needed in Vercel.

**Domain:** `adityaaryan.in`, bought on **Hostinger** on 2026-09-05. DNS is
pointed by taking the A record Vercel prints (`216.198.79.1` at the time it was
set up) and entering it in Hostinger under DNS / Nameservers → Edit, on the `@`
record. Vercel then reports "Valid Configuration". Note that Hostinger's TTL
field rejects some values; use the value its own error message asks for.

GitHub Pages was considered on 2026-09-04 and rejected once the constraint was
clear: Pages serves static files only, so `/api/contact` cannot run there and
the Resend contact form would have had to be replaced by a third-party form
service. Vercel keeps the form working with no other change.

### How an update reaches the live site

1. Make the change locally.
2. `git commit` and `git push origin main`.
3. Vercel sees the push, builds, and deploys. Usually under two minutes.

There is nothing to click. This is the whole workflow, and it is what was
explained to Aditya: he asks for a change, the change is made, it is pushed,
and it appears on the site.

### The environment variables in Vercel

Set in the Vercel project settings, not in the repo. `.env*` is gitignored. If
the live site ever shows a broken link preview or the form says "mail is not
configured", one of the three variables in section 3 is missing.

---

## 5. Repository layout

```
portfolio/
  MASTER_FILE.md            # this file
  README.md                 # shorter developer-facing summary
  next.config.ts            # cache headers, bundle analyzer, package-import optimisation
  next-sitemap.config.js    # sitemap + robots.txt, generated postbuild
  playwright.config.ts      # tests run against a production build on port 3100
  src/
    app/
      layout.tsx            # root: metadata, fonts, JSON-LD, preloader gate script
      globals.css           # 868 lines: Tailwind theme, utilities, print rules, scene CSS
      icon.svg
      not-found.tsx
      (site)/               # routes wearing the site chrome
        layout.tsx          # Providers, SmoothScroll, Sky, header, footer, palette, cursor
        page.tsx            # the home page
        about/page.tsx
        work/[slug]/page.tsx
        dashboard/bank-marketing/page.tsx
        demo/subway/page.tsx
        demo/print-inspection/page.tsx
      resume/               # own chrome: inverted surface, no nav in print
        page.tsx
        PrintButton.tsx
      api/contact/route.ts  # Resend, zod-validated, rate limited
    components/
      motion/               # capability gate, Lenis provider, preloader, handover, idle
      sections/             # Hero, SelectedWork, ScrollTrail, Experience, OffClock, Contact...
      site/                 # header, footer, palette, cursor, MDX, providers, sound
      three/                # every WebGL scene and its helpers
      viz/                  # MetricMark, PipelineDiagram, RegressionPlot, dashboards
    content/                # typed data, MDX case studies, committed datasets
    lib/                    # fonts, seo, site, sky, snapshot, bank-data, subway, highlight
    stores/ui.ts            # zustand: sound on/off, palette open, cursor label
    styles/tokens.css       # the design tokens
    fonts/                  # subset woff2 + the unsubset sources
  public/
    aditya-aryan-resume.pdf # his own document, not generated
    media/                  # card art + the four Earth maps
    data/                   # bank-marketing.bin (844 KB), subway-map.json
    sound/                  # two synthesised UI ticks + the 40s track
  scripts/                  # data builders, measurement harnesses, content check
  tests/                    # a11y.spec.ts, acceptance.spec.ts
```

### Library ownership

Assigned once and not mixed:

- **GSAP** owns scroll timelines and pinning (the constellation drift, the
  cursor lean, the pinned work rail). Imported lazily; never in the initial
  bundle.
- **Lenis** provides smooth scrolling and drives ScrollTrigger's update. One
  instance for the whole app, in `SmoothScroll`.
- **Recharts** owns charts that have axes: the regression plot and the bank
  dashboard. Nothing else.
- **Hand-written SVG and GLSL** own the bespoke visuals: `MetricMark`, the
  pipeline diagram, every three.js scene.
- **Zustand** owns UI state (sound, palette, cursor label).
- **Radix** owns the dialog primitives. Deliberately *not* the accordion; see
  section 16.
- Server components by default. `"use client"` only where interactivity demands
  it.

---

## 6. Every route, section by section

### `/` — Home

Order down the page:

| # | Section | What it is |
| --- | --- | --- |
| — | **Hero** | The orbit scene, or the constellation fallback. The name, his role, location, live NYC clock. |
| 02 | **Selected work** | Seven projects as a rail: vertical stack on mobile, two-up mid, horizontally scrollable at `lg`. Each card carries a `MetricMark` and a mono key-measure line. |
| — | **Scroll trail** | Six pinned chapters over the Earth. Heading is `sr-only` ("How I approach a problem"). |
| 03 | **Experience** | Three roles as a timeline rail. Native `<details>` collapse. |
| 04 | **Capabilities** | Five columns, one per skill group, hairline rules, no proficiency bars. |
| 05 | **Off the clock** | The bento: five cards plus a live clock and a track that plays. |
| 06 | **Contact** | Copy-email button plus the form. |

There is no `01` on the home page. It belonged to a "measured outcomes" metric
strip that was removed in commit `ece5e04`; the sections after it renumbered and
`01` was not reused.

Wrapping the hero is a `[data-sun-glow]` layer: a radial wash anchored on the
star's projected position, sitting on a negative z-index outside the hero so
the star's light continues into the section below rather than stopping at the
hero's clipping edge.

### `/work/[slug]` — Case study

MDX, statically generated (`dynamicParams = false`). Sticky table of contents,
reading progress as a 1px top rule. Two case studies exist:
`nyc-subway-reliability` and `print-inspection-cv`. The subway one carries the
pipeline diagram (section `01`) and the rainfall regression (section `02`).

### `/dashboard/bank-marketing`

A live dashboard over 43,193 telemarketing contacts, filtered entirely in the
browser. Every figure was produced by `scripts/build-bank-dashboard.py`; nothing
was typed in by hand.

| Model | Accuracy | F1 | ROC AUC |
| --- | --- | --- | --- |
| Logistic regression | 0.9029 | 0.4632 | 0.9095 |
| Decision tree | 0.8679 | 0.4501 | 0.6930 |
| Gradient boosting | 0.9051 | 0.5024 | 0.9162 |

### `/demo/subway`

The whole NYC network in 3D from the MTA's static GTFS feed (29 routes, 496
stations, 46 KB of JSON), then one arrival being inferred on the L line. Trains
are simulated; see section 19.

### `/demo/print-inspection`

The EagleEyes ticket press running: tickets seven across and three deep,
replaying 2,315 real camera-frame verdicts from the production vision engine.

### `/about`

Three paragraphs, education with coursework, certifications, and three lines
beyond the résumé (black belt in Okinawa Shorin Ryu karate, ACM Python mentor,
lead guitarist). The moon scene sits beside it. A portrait slot exists and is
switched off until an image is supplied.

### `/resume`

The inverted printable surface: black on white, toolbar hidden, external link
targets spelled out. A Download button serves `public/aditya-aryan-resume.pdf`,
which is **his own tailored one-page document**, not a rendering of the page.
A Print button prints the page itself.

### `/api/contact`

POST only. Order of operations: rate limit (5 per hour per address, fixed window
in process memory) → JSON parse → zod validation → honeypot check (a filled
`company` field returns 202 and tells the sender nothing) → Resend send. Keys
are read at request time, not module load, so a build without them still
succeeds.

---

## 7. The content layer

**Everything a visitor reads lives in `src/content/`.** No copy is hardcoded in
a component. This is the single most important fact for anyone editing the site:
to change what it says, edit a file in `src/content/`.

| File | Holds |
| --- | --- |
| `profile.ts` | Name, role, location, email, phone, LinkedIn, GitHub, the positioning paragraph, four headline metrics, and `education` including coursework |
| `experience.ts` | The three roles, with bullets and stacks |
| `projects.ts` | Seven projects: slug, title, hook, period, stack, detail bullets, `featured`, and a `live` link where a demo exists |
| `metrics.ts` | The one number each project defends, as a typed union: `delta`, `level`, `shortfall`, `count` |
| `skills.ts` | Five groups |
| `certifications.ts` | Nine entries; `url` is optional and turns a row into a link |
| `about.ts` | The about-page prose, the "beyond" list, the portrait slot |
| `offclock.ts` | The five cards, the track, and `hourReads()` |
| `trail.ts` | The six scroll chapters |
| `pipeline.ts` | The eight MTA feeds and six pipeline stages with their code blocks |
| `types.ts` | The shared types |
| `index.ts` | The barrel |
| `data/` | Committed datasets: bank marketing meta, print inspection, subway wait snapshot |
| `work/*.mdx` | The two long-form case studies |

### The current content, verbatim

**Profile.** Role: `Data Analyst / Analytics Engineer` (title case, deliberately,
because it is a label in four places: the browser tab, the link-preview card, the
line under his name, and `jobTitle` in the structured data). Location: New York
City, NY. Email `adityaaryan541@gmail.com`. Phone `+1 (716) 697-7737`. LinkedIn
`https://www.linkedin.com/in/halfadi/`. GitHub `https://github.com/halfadiii`.

Positioning (also the meta description and the schema.org description, which is
why it is third person):

> Analytics professional with a Master's in Data Science and 3+ years across BI
> and data engineering. Builds governed pipelines in dbt, BigQuery, and GCP, then
> turns them into Power BI and SQL reporting leadership acts on. Drove a 65% rise
> in dashboard adoption, cut reporting cycles 40%, and lifted source reliability
> to 95%.

**Education.** MPS, Data Science & Applications, SUNY Buffalo, GPA 3.5,
2024-08 to 2025-12, Buffalo NY. Coursework: Business Analytics, Data
Visualization, Predictive Analytics, Reporting Automation, Cloud Analytics,
BigQuery, Tableau, DAX, Microsoft Fabric.

**Experience: three roles.**

1. **Nissha Medical Technologies** — Data engineer, Buffalo NY, 2025-05 to
   2025-12. Python/pandas/NumPy/OpenCV/Git.
2. **Constituents AI & Technology** — Data analyst, business operations &
   reporting, Remote, 2024-03 to 2024-07. Power BI/DAX/Power Query/
   PostgreSQL/SQL.
3. **Google** — Data analytics & reporting analyst, Remote, 2022-06 to 2024-03.
   GCP/BigQuery/dbt/Airflow/Spark/Power BI/Excel/MySQL.

Two of those titles deliberately do not match the downloadable PDF: the PDF says
"Data Analytics & Computer Vision Capstone" for Nissha and "Specialist" for
Google. **This is not a bug.** It is Aditya's instruction as of 2026-09-05, and
the PDF is his to reissue. Do not quietly "fix" it back.

The Google entry was three separate Mumbai roles here until 2026-09-05. The
résumé states that span as one remote role, he confirmed the résumé, so it is
one role. Its `stack` is the union of what all three ran on rather than only
what the five bullets name, because merging the entries did not un-learn GCP,
Airflow or dbt, and he asked for them kept.

**Projects: seven.** NYC subway reliability pipeline (featured, has a live
demo), Bank marketing strategy (Jan 2025, dated from its own GitHub history:
six commits, 11 to 17 January 2025; has a live dashboard), AI print inspection
system (has a live demo), Customer churn prediction, Real-time fake news
detector, Marketing campaign segmentation, Mineral mapping and classification.

**Skills: five groups.** Languages · Analytics & reporting · Statistical
methods · Data operations · Platforms & databases. MLOps, prompt engineering and
Azure are the site's, not the résumé's: a one-page résumé cuts to fit, this
section has no such limit, and he asked for them back after the first pass
dropped them.

**The trail: six chapters.** Kickers exactly as he specified them: `The Goal`,
`What it records`, `Make it correct`, `The Model`, `The so what`,
`The Dashboard`. Method only, on his instruction, so no project is named
anywhere in it. The pulled-out figures that used to sit beside four of them are
gone: they made a section about how the work is done read like a slide about how
well it went.

**Off the clock: five cards.** Naruto (currently watching), Rocket League
(currently playing), Valorant (also playing), Coffee (runs on), and "Am I
Dreaming" by Metro Boomin, A$AP Rocky & Roisee from Across the Spider-Verse (on
repeat). Plus a live clock card whose caption is derived from the actual hour in
New York via `hourReads()`, so there is no editable string that can quietly
become untrue at four in the morning.

### The content check

`scripts/check-content.mjs` runs as `prebuild`. It walks `src/content/` and
warns on any `TODO` string. `--strict` (or `STRICT_CONTENT=1`, which CI sets)
turns that into a build failure. As of now there are **no TODOs left**.

---

## 8. The design system

Tokens live in `src/styles/tokens.css` on `:root`, and `globals.css` maps them
into Tailwind with `@theme inline`.

### Palette

```
--void:     #000000    true black, not a tinted near-black
--panel:    #0d0f10
--signal:   #fafaf7    type
--steel:    #7a8085    secondary type
--hairline: #1e2124    rules
--focus:    var(--signal)
```

Data colours, used **only** where they encode data (the four MTA lines):
`--line-red #ee352e`, `--line-blue #0039a6`, `--line-orange #ff6319`,
`--line-green #00933c`.

There is one addition to the brief's palette: `--line-blue-on-void: #2f5fbf`.
The MTA's signage blue is 1.7:1 against true black, which is a line nobody can
follow and below the 3:1 WCAG asks of meaningful graphics. This is the same hue
lifted to 3.5:1, used only for strokes on `--void`. The signage value stays
canonical.

### Type

Three self-hosted variable faces, subset to the site's charset:

- **Archivo Variable** (weight + width axes) for display. The width axis is the
  one bold move on the site: it animates on load and on hover, never opacity.
- **Switzer Variable** for body.
- **JetBrains Mono Variable** for the micro-labels.

Subsetting cuts the three faces from 168 KB to 94 KB, most of the mobile
critical path. Both variable axes survive, because the hero animates Archivo's
width axis, so `fvar` and `gvar` must not be dropped. Next generates a
metric-matched Arial fallback so the swap does not reflow the 14vw name.

None of the three faces carries an arrow glyph or `⌘`. That is why the work-rail
arrow is drawn as SVG and the palette shortcut is spelled `Ctrl K` / `Cmd K`,
resolved per platform after mount by `Shortcut.tsx`.

Fluid scale, 0.75rem to 14rem, all `clamp()`. `--text-name` is `13.6vw` and not
14, measured against the expanded width axis as the largest size at which the
name still fits one line inside its margins. Below 640px the name is set as two
single-word lines and scales at `21vw`.

### Layout

`--measure: 68ch`, `--shell-max: 1600px`, `--rhythm: 12vh`. `--header-h` is
`2.75rem` under a mouse and `3.75rem` under a coarse pointer, because a finger
needs a 44px target; `scroll-padding-top` reads it back so an anchor never drops
its heading behind the bar.

### Motion tokens

One easing curve for everything: `cubic-bezier(0.22, 1, 0.36, 1)`. Three
durations: `--dur-ui 180ms`, `--dur-panel 420ms`, `--dur-page 900ms`. Under
`prefers-reduced-motion` all three become `1ms` and a global rule flattens every
animation and transition on the page.

### The one permitted inversion

`[data-surface="print"]` / `[data-theme="print"]` swaps void and signal for the
résumé page. Applied as a data attribute on a wrapper, so it server-renders with
no theme flash. There is no system-preference branch anywhere: the site has one
intended appearance.

### Section labels

A section label is a mono string carrying real information
(`03 / selected work / 2022–2026`), never a tracked-out decorative eyebrow.
Numbered markers appear in the experience timeline and only there, because that
genuinely is a sequence.

---

## 9. The WebGL layer

Eight scenes. Every one is behind `next/dynamic` with `ssr: false`, and behind a
capability gate, so a visitor who cannot or does not want to run them never
downloads three.js at all.

### The shared machinery

**`Cadence.tsx`** — how often a canvas is allowed to draw. Every canvas runs
`frameloop="never"`, meaning React Three Fiber draws nothing on its own, and
Cadence is the only thing that advances it. Three gates in order of saving: a
hidden tab draws nothing, a canvas scrolled out of view draws nothing, and what
is left draws at a set fps rather than at the panel rate.

This exists because Aditya's laptop has a **180Hz panel**. Uncapped, the scenes
drew three times the work for a picture nobody can tell apart, and enough
sustained load to thermally throttle, which is what "it gets slow after a while"
actually was. **Do not raise or remove this cap without a reason.**

**`useOnScreen.ts`** — an IntersectionObserver with a 220px margin, used to stop
a canvas rendering once scrolled past. A WebGL scene keeps drawing at full cost
whether or not anyone can see it.

**`useRoom.ts`** — whether there is physically room for a scene:
`(min-width: 360px) and (min-height: 480px)`. **Both**, because it is room the
composition needs, not width. That is what rules out a phone on its side, which
has plenty of width and no height. The demos used to ask for 900px, which was a
guess about legibility that turned into a wall; it was measured and found wrong.

### `GalaxyBackdrop` + `Galaxy` + `ShootingStars` — the sky

One fixed canvas behind the whole document. It used to belong to the two scenes
that wanted it, which meant the rest of the site sat on flat black and the
galaxy stopped at a section boundary. Now the sky is continuous from hero to
footer and is drawn once rather than twice.

Fixed rather than scrolling on purpose: stars a page away are not going to pass
the window at the rate the type does.

A nebula shell and two shells of stars, procedural rather than a video. A galaxy
clip good enough for a full-screen hero is several megabytes, cannot react to
the drag, and would undo the JS budget on its own. The noise is evaluated once
into a cube map and never again. Kept cold and near-monochrome, because gradient
washes are on the anti-pattern list.

Shooting stars: a pool of seven streaks that spend most of their lives waiting,
coming out at roughly one every four seconds somewhere on the page. They travel
on an **arc**, not a line, because the camera sits inside the star shell looking
out, so a meteor runs over the inside of a sphere.

### `HeroScene` + `Sun` + `Sunlight` + `ProjectOrbit` + `Rocket` — the hero orbit

A star at the centre, the projects orbiting it as lit planets, the galaxy
behind. Drag anywhere to turn the ring like a wheel; it carries momentum and
settles. Clicking a planet flies the camera in and opens the full record. Arrow
buttons and dots give the same control from the keyboard, and the canvas is
`aria-hidden` because those controls already carry the content.

**There is not a single three.js light in this scene.** The star is a corona and
nothing else: an exponential core and three drifting ray frequencies, every term
dying to zero before it reaches the edge of the quad it is drawn on, which is
what stops a circle from appearing. What it exports is not light but a
*position*: `Sun` writes its world coordinates into a ref every frame, and every
surface works out for itself how much of that star it can see.

That one number is the source of all of this:

- **Terminators.** Each planet shades itself from the real direction to the
  star, with a soft edge, because at forty pixels across a hard one reads as a
  cut.
- **Ring shadows, both ways.** A ringed planet walks the ray from each patch of
  ground toward the star, finds where it crosses the ring plane, and asks how
  much ring is at that radius, so the shadow carries the ring's own divisions as
  bright lanes. The ring does the reverse against the planet's sphere, with a
  softened penumbra.
- **The name.** `Aditya Aryan` is real text (it has to be, for selection,
  search, print, and the font's width axis), so it cannot be lit by a renderer.
  `Sunlight` projects the star into the canvas's coordinates and writes the
  direction and distance to each `[data-sunlit]` element as custom properties;
  the stylesheet turns those into a warm edge on the side facing the star.
  `Sunlight` also publishes `--sun-x` / `--sun-y` onto `[data-sun-glow]`, which
  is how the wash outside the hero follows the star.

Moving the pointer leans **the star**, not the system. Moving everything
together would change no angle and therefore no shadow; leaning the star turns
every terminator, swings the ring shadows, and rolls the lighting on the name.
One cause, visible in three places at once. The sway is half a world unit
against an orbit radius of 3.45.

**What is deliberately not drawn:** planets do not shadow one another. Seven
bodies equally spaced on a circle are never two-to-a-side of the star, so no
such shadow could fall. That is the physics, not an omission.

**Portrait framing.** A ring 3.45 units wide seen through a portrait frame is
twice as wide as the window. `frameRing()` in `HeroScene.tsx` solves it: as the
window gets taller than wide, the lens opens (40° to 62°), the ring draws in
(3.45 to 2.35), the camera climbs, and the distance is then *solved* so the ring
fills a set fraction of the frame. At a laptop's proportions it returns 8.62
units, which is the 8.6 the shot was originally hand-set to, so the wide view is
provably unchanged.

**The rocket.** A small craft parked over whichever project is at the front, with
a transfer burn whenever that changes. It lives inside the rotating ring. The
transfer has four parts: vertical lift-off, pitch over into the crossing, back
upright over the destination, land on its tail. Every horizontal term finishes
before the descent begins, so the last stretch is a straight drop onto the pad
rather than a diagonal skid. Each axis flies a quintic arriving at zero velocity
and zero acceleration. It flips retrograde over the top of the arc, rate-limited
to 300 degrees a second, and touches down within a degree of vertical.

Park height comes from `standoff(size, pole)`, which is `size / pole +
TAIL_CLEAR`. `TAIL_CLEAR = 0.072` is measured to the **nozzle**, the lowest
thing on the craft. `pole` is how much of an offset along the planet's axis
survives the projection, written each frame from the camera: 1 with the camera
level with the orbit plane, 0.66 on a phone, where it climbs to frame the ring.

The division is the whole point. The craft stands on the pole, and a pole is
the one place on a sphere that a camera looking down at it cannot show you, so
the clearance has to be solved in the picture or the craft is drawn inside the
planet. It puts the foot on the *drawn* limb at any angle, and at `pole = 1` it
returns `size + TAIL_CLEAR` exactly, so the edge-on case is the plain
world-space landing.

The pad is also re-derived every frame while parked, rather than being solved
once per leg and held. See section 18 for both, and for what happens if you
forget the second one.

### `EarthScene` + `earth-frame.ts` — the Earth

Behind the scroll trail. **Unlike everything else on the site, the surface here
is not generated.** It is NASA's Blue Marble and Black Marble, public domain,
resized into four maps totalling half a megabyte, loaded only when the section
is close. Deliberate reversal: a generated moon is still a moon, but a generated
Earth is just a blue planet, and the whole point of this one is that you
recognise it.

What *is* generated is all of the light: per-channel extinction so the core
reddens through the dust, air mass across the whole disc rather than only at the
limb (which is why the oceans are blue and not black), cloud shadows that
lengthen as the sun drops, and cities coming up through dusk. The ground loads
first so a complete planet draws while the cloud layer is still arriving; the
three maps are handed to the material one per frame, because eight million
texels each reaching the GPU together is a stall.

`earth-frame.ts` exists as a **separate file for one reason**: `earthDisc` is
needed by the relay, and importing it from `EarthScene` meant importing
three.js, which put 250 KB into the home page's first load and quietly undid the
dynamic boundary. Arithmetic has no business dragging a renderer in with it.
That mistake took first load from 181 kB to 429 kB; splitting the file brought
it to 183 kB.

It holds `LENS = 32`, `RANGE = { far: 4.5, near: 0.75 }`,
`AIM = { wide: {x:0.71, y:0.5}, narrow: {x:0.5, y:0.22} }`, `WIDE_AT`,
`standoff()` and `earthDisc()`. `AIM.y` is a **true screen fraction**; it used
to be stored inverted and that cost nothing until something had to be placed
against it.

The Earth is a **fixed viewport layer at `-z-[5]`**, not a canvas in a sticky
box. Sticky stops where its section stops, so the bottom edge of the trail took
a straight horizontal razor through the planet on the way out. Now it dims
rather than being clipped, holding through the pinned chapters and fading across
the screen below, so the experience section is read against a whole planet.

### `MoonScene` — the Moon

Beside the about section, and the destination of the relay.

Nothing here is a photograph. The surface is generated: a crater field of seven
octaves, basins flooded and darkened into maria, and a grain over the top. A real
albedo map of the near side is a megabyte or two of JPEG for a disc drawn a
couple of hundred pixels across; a generated one costs nothing to send and can
be lit from any angle without a seam.

**This is a moon, not the Moon.** The maria are in plausible places, not their
places. What is real is the **phase**, the direction the light comes from, and
the way the light behaves once it gets there: the terminator is placed from the
same arithmetic an almanac uses, so a crescent outside is a crescent here and it
leans the same way. `src/lib/sky.ts` does that from a known new moon
(2000-01-06 18:14 UTC) and the synodic month.

It used to work out which body was above the horizon from the sun's real
altitude and draw whichever it was, which meant the **daytime half of all
visitors never saw the moon at all**. Only the moon was ever wanted, so the sun
scene, the solar position, and the branch are all gone. The clock now ticks
hourly rather than every five minutes, because the only thing left that depends
on it moves about a seventh of a per cent in that time.

The surface is baked once into a cube map and rotated after that, so a frame
costs one texture fetch.

### `SubwayMap` and `SubwayScene`

The whole network in 3D from real GTFS shapes, stops and agency colours.
Everything that repeats is instanced: 496 stations and a few hundred trains
would be hundreds of draw calls as separate meshes; as two `InstancedMesh`
objects they are two. Train positions are read from a ref every frame, so React
never re-renders while they move.

`SubwayScene` is the single-line version: the L, its stations, and the trains
running it. Train positions come from the simulation, never from the scene.

### `PrintLine`

The EXT705 press built from the line diagram: paper roll, printer, overhead
camera on its gantry, the operator's workstation, and the printed web lifting
over the turn rollers. Tickets come off this press **seven abreast and three
deep**, so one camera image holds twenty-one of them. That is why the count gate
looks for exactly 21 (or 14, on the short two-row layout) and not for one.

At 1,137 lines it is the largest single component in the repository.

---

## 10. The Earth to Moon relay

This has its own section because it is the most intricate thing on the site and
the thing most likely to break if someone changes a number without understanding
what it is for.

### What it does

The globe used to end at the bottom of the trail, and the about section's moon
began, unrelated, two sections later. They are one movement now:

1. The Moon comes out from behind the Earth on an arc.
2. It swings clear of the limb.
3. It passes in front.
4. The two trade places **by size, not by opacity**: the Moon grows into the
   frame while the planet draws back and shrinks behind it, until the Earth fits
   entirely inside the disc in front of it and is simply not visible any more.
5. The Moon travels to the exact disc the about section draws, and hands over.

Nothing fades out except at the very end. A planet that dissolves is a layer
being turned down; a planet that recedes until something in front of it covers
it is two bodies with a spatial relationship, which is what is being described.

### Where it lives

**`src/components/sections/sky-relay.ts`** is the whole sequence as one **pure
function**, `placeSky({view, past, earthDisc, target, rest, travel, travelled})`.
It is pure on purpose: a sequence that only exists across four screens of
scrolling is otherwise inspected one screenshot at a time, and every number in
it was checked at a terminal before any of it was wired to a canvas.

Screen space throughout: CSS pixels, y downward, discs described by centre and
diameter, because that is what the caller writes onto a box.

**`ScrollTrail.tsx`** owns both fixed layers, the `handoff` prop (`"[data-sky-moon]"`
from the home page), `discOf()`, the `moonSpan`/`moonFill` refs, the `chasing`
state that raises the Earth's frame rate during the handover, the
`data-relay-hold` toggle, and `data-scene-spill` on `document.body`.

### The constants, and why each is what it is

| Constant | Value | Why |
| --- | --- | --- |
| `EMERGE` | 1.15 | Viewports past the pinned trail over which the Moon emerges and takes over. Exported, because the caller starts the travel clock at the end of it and two copies would drift. |
| `SWING` | 0.5 | Fraction of that spent swinging out from behind, before moving forward. |
| `CROSS` | 0.5 | When the Moon stops being occluded and starts occluding. **The end of the swing and not a moment before**: two canvases cannot interleave in depth, so the swap can only happen on a frame where the discs do not overlap. |
| `EARTH_RECEDE` | 0.16 | How far the Earth draws back. Small enough to hide inside the Moon's disc. The check in the code is on the geometry, not on this number, so the two cannot disagree. |
| `ORBIT_FROM` | 0.1 | How far out the Moon starts, as a fraction of the Earth's radius. |
| `CLEAR` | 26 | Pixels of daylight at the far end of the arc. Solved for the gap rather than set to a multiple of the radius, which is what makes it work in portrait. |
| `ARC` | wide 255°→168°, narrow 200°→282° | The arc goes where the room is, and the room is wherever the globe is not. Wide: the planet is aimed right, so the Moon comes out left. Narrow: the planet rides high, so the Moon comes down underneath. |
| `HERO` | wide 0.6, narrow 0.74 | How much of the viewport the Moon fills once it owns the frame. |
| `SEED` | 0.3 | How big it starts, against that. |
| `HANDOVER` | 0.55 | Scroll past the handover before the relay is fully gone. |
| `VEIL` | 0.42 | How bright the Moon is while crossing the page. **Not a taste decision:** at full strength the Moon renders near pure white and crosses the capabilities section, where headings measured **1.05:1** over it. Brightness, not opacity, because a half-transparent moon in front of the Earth shows the Earth through it, which undoes the one thing the sequence is saying. Over black the two are the same number. |
| `UNVEIL` | 0.72 | Where it comes back to full, which is where there is nothing to read. |
| `BOW` | 0.09 | How far the journey bows out of the straight line. A body that slides flat across to the edge stops being a body and becomes a sprite on a rail. Perpendicular to the run and exactly zero at both ends. Was 0.14; reduced because it stacks with the latch. |
| `LATCH` | 0.9 | Viewports of *remaining distance* over which the Moon inherits the destination element's motion. |

### The latch, which is the subtlest part

The arrival used to snap. Sampling the Moon's position every twenty pixels of
scroll through the landing gave:

```
...  0.5   0.3   0.1  |  20.0   20.0   20.0
                      ^ the lock
```

It eased to a dead stop, because smoothstep has no velocity left at the end, and
then the page picked it up at full scroll speed, because the thing it lands on
is an element in the document and moves a pixel for every pixel of scroll. Zero
to twenty in a frame.

The fix is to aim at the **live element** rather than a predicted pose, and to
measure the blend in **distance remaining** rather than progress through the
journey:

```ts
const left  = Math.max(0, travel - travelled);
const latch = 1 - smooth(clamp(left / (LATCH * view.h)));
const dest  = {
  x: mix(rest.x, target.x, latch),
  y: mix(rest.y, target.y, latch),
  d: mix(rest.d, target.d, latch),
};
```

Ramping over the last stretch of the *journey* aims at something still a screen
and a half below the window, and the Moon sags off the bottom of the frame after
it. Over the last stretch of the *approach*, the pull is
`r·(1 - smoothstep(0, L, r))`, which peaks at `0.096·L` wherever it starts: 78px
instead of 370.

Vertical speed through the landing now reads 13.9, 17.5, 20.8, 23.7, 26.3, 28.1,
29.4, 30.0 and stays there. The two zeroes left in the sequence are the top and
bottom of the arc, where a body that is turning around is supposed to have none.

On a phone the Moon still comes to a stop at the end, because the about
section's moon is inside a sticky box and stops being carried by the page the
moment it pins. The relay tracks the real element, so it stops when the real one
does. That is correct behaviour.

### The type over it

`[data-scene-spill]` on `document.body` switches on a halo under
`h1,h2,h3,h4,p,span,li,dt,dd,summary,a,time,strong,em` while the relay is
crossing the reading. It is a five-pass shadow: a 4px blur is too soft to darken
the middle of a thin stem, so two opaque passes sit under the wide ones.

Contrast was measured **at the glyph pixels**, not at the text boxes. A bounding
box counts the empty half of every short line and invents failures nobody can
see; the method used here paints a magenta sentinel mask over the glyphs and
measures only those. Worst glyph core anywhere in the sequence: **4.95:1**, at
1440 and at 390. Nothing under 4.5:1 at any point in the fade.

---

## 11. Motion architecture

One orchestrated moment on load, then motion only in response to action.

### The preloader

A rocket sits on the pad under a launch countdown: **T-3, T-2, T-1**, one real
second each, and at **T-0** it lights and goes. The fragments then arrive at
their slots and the name expands along Archivo's width axis. About 3.9 seconds
to the curtain, skippable by any key or click, once per session.

The count is three whole seconds (`COUNT_MS = 3000`) because the number on
screen is a count of *seconds* and has to be told in them; the displayed figure
is `ceil(remaining / 1000)`, so each number owns the second it names. It is
deliberately **not** eased, unlike the engine ramp underneath it, which is: a
clock does not accelerate.

It replaced a 000 to 100 progress count, which was never progress. Nothing was
being measured, and by the time it read 40 the page underneath had been ready
for a while. A countdown says the same thing about time passing without
claiming to be a measurement of anything.

It is deliberately written with `requestAnimationFrame` and CSS transitions
rather than GSAP: it runs inside the load window, and pulling in a 50 KB
animation library to move four properties showed up directly as blocking time.

An **inline script in `layout.tsx`** decides before first paint whether it runs
at all: not off the home page, not for a visitor who has already seen it this
session, not under reduced motion. With JavaScript off the attribute is never
set and CSS keeps the overlay hidden, so it can never trap anyone behind a
curtain it cannot lift.

The overlay is **not detached** when it is done. React rendered it, so React owns
it; pulling it out of the DOM by hand leaves a fiber pointing at a node that is
no longer anybody's child, which stays quiet until the next client-side
navigation and then throws.

### `handover.ts`

Every WebGL context waits for the preloader's **launch**, not the end of the
sequence. The craft leaves the pad about 1.4 seconds before the overlay finishes
clearing, and everything still moving after that point is a CSS transition on
opacity and transform, which the compositor runs on its own thread and a busy
main thread cannot interrupt. So a scene gets a second and a half to build itself
behind a curtain that cannot stutter, and is up before the curtain is gone.

Three megabytes of WebGL parsing, compiling shaders and creating a context used
to land in the middle of the count, which is the one place on the site where a
stalled main thread is guaranteed to be seen.

Off the home page, on a second visit, or under reduced motion there is no
sequence and the callback runs on the spot.

### `idle.ts`

Everything scroll-linked is enhancement, so it starts on `requestIdleCallback`
after the preloader hands over. Starting it during hydration is what pushes
blocking time up.

### `capability.ts`

The gate: motion is skipped when the visitor asked for less of it, when the
device reports fewer than four logical cores, or when the connection reports
data saving. `reducedMotion` is `null` until resolved after mount, so nothing
animates early.

### `SmoothScroll.tsx`

One Lenis instance for the whole app, driving ScrollTrigger's update. GSAP and
Lenis are imported inside the effect rather than at module scope, so neither
reaches the initial bundle and a reduced-motion visitor never downloads them.
Gated to fine pointers, because touch platforms already have better momentum
scrolling than a library can synthesise.

### `HomeMotion.tsx`

The constellation drift and the pinned work rail, both inside a `gsap.context()`
that reverts on unmount. The drift is gated to ≥640px, because below that the
nodes it animates are not rendered.

### The cursor

At rest a small mono dot. Over something drawn as a box (a button, a card, a
field, anything with a border or fill) it dissolves into an outline of that box.
Elements with `data-cursor-label` get the label instead. **Text does not get an
outline**: it used to trace the run of glyphs under the pointer, which was
accurate and unwanted, because a rectangle drawn round a sentence reads as a
selection or an error. Prose gets the plain dot. Desktop pointer-fine only,
never under reduced motion, and nothing passes through React state.

### The bento

Pointing at one card lifts it and pushes its neighbours away, hardest next door
and less beyond. `NUDGE = 10px`, `FALLOFF = 420px`, `LIFT = 6`. The point is that
the grid reads as objects sharing a space rather than five independent hover
states. Only transforms, only on enter and leave, so the whole effect runs on the
compositor. Geometry is measured once against the grid's box and only a resize
invalidates it.

### The card deck

On a phone the off-the-clock grid would be six full-width cards in a row, about
two and a half screens of scrolling through pictures. Instead they arrive as a
**pile**, squared up with a strip of each showing, and slide apart into the list
as you scroll in. Nothing about the layout changes: the cards stay where the grid
puts them and are moved with a transform, so the page is the same height at every
point and the scroll position never has the ground shift under it. The pile is
anchored by its **bottom** edge, so every card shows exactly one strip whatever
its height. JavaScript off or reduced motion leaves the plain column, which is
the version that has to be right first.

### `NameGlow`

A light behind the heading following the pointer. It is a second copy of the
heading with `color: transparent` and nothing but a stack of glows for a text
shadow, laid over the real heading in `plus-lighter` so it only ever adds light.
A radial mask centred on the pointer keeps only the part near the cursor; the
layer is padded far past the text on every side, because a mask is clipped to
its element's box and without the padding the glow ends in a straight line. The
copy is built at runtime, so the page never ships the name twice for a search
engine to read.

---

## 12. Performance architecture and budgets

### Measured on this build

| Budget | Result |
| --- | --- |
| Lighthouse ≥ 95, mobile | **92–96** performance / 100 a11y / 100 best practices / 100 SEO. Its LCP is *simulated* and swings 2.3–3.1s between identical runs; the other three are stable at 100. |
| Lighthouse, desktop | **100 / 100 / 100 / 100** |
| CLS < 0.02 | **0.0004** measured, **0** as Lighthouse scores it |
| LCP < 2.0s | **0.70s** under 1.6 Mbps / 150ms RTT / 4× CPU |
| Initial JS ≤ 180 KB gz | **169 KB** on `/` at the time of that measurement; **183 KB** after the relay landed |
| Zero axe violations | 36–40 Playwright tests pass, desktop and mobile |

Both LCP figures are reported rather than picking the flattering one.

### How the budget is held

- **Every heavy library is dynamically imported and route-scoped.** three/fiber/
  drei behind `SceneMount` and each scene. Recharts only on the regression and
  the dashboard. cmdk and Fuse.js behind the first palette open (warmed on idle,
  so the shortcut never waits on a network round trip). Radix Dialog with the
  first stage click. react-hook-form + zod + resolver behind the contact form,
  with server rendering still on so the fields are in the HTML. Sonner after
  paint. Howler on first use and only if sound is switched on.
- **Shiki runs on the server.** Code is highlighted at render time and shipped as
  HTML; no highlighter reaches the client.
- **`optimizePackageImports`** in `next.config.ts` for lucide-react, recharts,
  date-fns and three Radix primitives.
- **Cache headers.** `/sound/*` gets a year immutable. `/media/*` gets a month
  with `stale-while-revalidate`, deliberately **not** a year and **not**
  immutable: those filenames are not content-addressed, so regenerating a map
  keeps its name and `immutable` would tell a browser it need never look again.
  By default they came back `max-age=0`, which does not mean re-downloading (the
  ETag makes it a 304) but does mean four conditional round trips before the
  globe can draw, which on a phone is the part you feel.
- **The bank dataset is a binary.** 43,193 rows in a columnar `.bin` of 844 KB,
  read as typed arrays. As JSON the same rows would be several megabytes. Every
  filter re-aggregates all rows in about a millisecond: no server, no pre-baked
  combinations.
- **The subway network is projected at build time.** 46 KB of JSON instead of a
  36 MB GTFS archive parsed in the browser.
- **Fonts are subset**, 168 KB to 94 KB.

### Frame budget

Measured at 1440×900 on an RTX 3060: **5.6–6.1ms median frames** across every
scene, with no frame over ~6.3ms once built. A whole pass down and back up
through the relay: no stall over 30ms on the way up, and one 116ms on the way
down when the globe first draws. That one is the shaders compiling, and it is
where it is on purpose; the alternative is paying it in the load window, which
this section was deliberately moved out of.

**When measuring, run `npm run measure:frames` headed.** Headless Chromium
renders through SwiftShader and does not wait on the GPU, so its frame times
only describe main-thread work.

---

## 13. Accessibility

- **Zero axe violations** on every route, at desktop and Pixel 5 viewports.
- **Skip link** is the first tab stop and lands on `#main`.
- **Focus is visible and never trapped**, verified across 60 tab stops on the
  home page.
- **Canvases are `aria-hidden`** wherever HTML controls already carry the
  content. The orbit's arrow buttons and dots do everything the drag does.
- **Meaning is never carried by colour alone.** The regression routes carry a
  dash pattern as well as a colour.
- **Contrast is measured at the glyph pixels**, not the text boxes. Worst glyph
  anywhere in the relay sequence: 4.95:1. Card captions over artwork: 4.72:1 for
  the mono label and 18:1 for the title, both against the scrim rather than the
  picture.
- **Errors are not red.** An invalid field is marked with a mono `error —`
  prefix and a message that says what broke and what to do.
- **Under reduced motion nothing animates**, no scene mounts, the preloader
  never runs, and content appears instantly.
- **With JavaScript disabled all text content is present**, the trail becomes six
  stacked prose blocks, the work rail becomes a native scroll, the deck becomes a
  plain column, and the experience bullets still open, because the collapse is a
  native `<details>`.
- **Targets are 44px under a coarse pointer**, driven from `--header-h`.

---

## 14. The data pipeline scripts

Four scripts fetch published sources and commit the result, so no page ever
depends on a live warehouse or an API being awake.

| Script | Source | Output |
| --- | --- | --- |
| `gen:dashboard` | His own notebooks, replayed against `bank-full.csv` | `public/data/bank-marketing.bin` (43,193 rows, columnar, 844 KB) + `src/content/data/bank-marketing.json` |
| `gen:subway-map` | MTA static GTFS feed | `public/data/subway-map.json`, 29 routes, 496 stations |
| `gen:wait-snapshot` | MTA Customer Journey-Focused Metrics + Central Park hourly rainfall (Open-Meteo) | `src/content/data/subway-wait-snapshot.json` |
| `gen:print-inspection` | The EagleEyes production run: `visualizer_results.csv` + `rules.json` | `src/content/data/print-inspection.json` |
| `gen:earth` | NASA Blue Marble Next Generation + Black Marble masters | `public/media/earth/{day,night,cloud,mask}.webp` |

### The bank marketing rebuild

`scripts/build-bank-dashboard.py` replays the notebooks' own cleaning, 3NF
normalisation and three classifiers. Cleaning: 45,211 contacts down to 43,193
(unknown job and education removed, unknown contact method reassigned in
proportion to the known split, `poutcome` folded into a single other category).
Normalised to third normal form and loaded into SQLite as a main table joined to
a previous-outcome table, so the transitive dependency on `poutcome` was removed
rather than tolerated. Stratified 80/20 split. Needs pandas, scikit-learn, scipy.

### The rainfall regression, and the null result

`build-wait-snapshot.py` regresses the MTA's own `additional_platform_time` on
the share of each month that was wet, per line, controlling for month-of-year
and for the 2020–21 collapse. Over eleven years and five lines, **all five
confidence intervals contain zero.**

The site reports that, rather than hunting for a specification that crosses a
threshold, which is the exact failure the rest of the page argues against. It is
also the argument for the pipeline: a monthly average over every trip is the
wrong instrument for a question about the twenty minutes it was raining.

If the export is ever removed, the section renders an honest pending state
rather than drawing numbers nobody measured.

### The Earth maps

The mask (R = water, G = terrain relief, B = ice) is **derived** here rather than
downloaded, because everything in it is already implied by the day map, and a
fourth request is a fourth thing that can 404 in two years.

### The UI sounds

`make-ui-sounds.mjs` synthesises the two ticks rather than shipping a licensed
sample: a short sine burst with exponential decay, band-limited by a
raised-cosine attack so it does not click at the edges. Sound is off by default,
never ambient, never autoplay.

---

## 15. Testing and measurement tooling

### `npm test`

Playwright against a **production build** on port 3100, two projects (Desktop
Chrome and Pixel 5), four workers locally and two in CI. Two spec files:

**`a11y.spec.ts`** runs axe on every route.

**`acceptance.spec.ts`** covers the mechanical half of the acceptance checklist:

- no horizontal overflow at 320px on any route
- focus visible and never trapped across 60 tab stops
- the skip link is the first stop and reaches `#main`
- under reduced motion nothing animates and the preloader never runs
- with JavaScript disabled the text content is present
- the command palette opens on the keyboard and jumps to a section
- a pipeline stage opens its panel with the code that runs it
- the contact form reports what broke

Current state: **40/40 passing.**

### The measurement harnesses

These exist because "is it smooth?" and "is it fast?" are questions that
averages cannot answer.

- **`measure-frames.mjs`** reports the shape of the frame-time distribution
  (median, tail, worst single frame) for each thing a visitor actually does, and
  counts the long tasks that caused them. A page that holds 60 and stalls for a
  third of a second twice still averages 58, and the stalls are the entire
  complaint. Read `>32ms` as "frames a visitor would see as a stutter". Takes an
  optional CPU slowdown factor and a `phone` flag. **Run headed.**
- **`measure-vitals.mjs`** drives a real Chromium under 1.6 Mbps / 150ms RTT /
  4× CPU and reads actual `PerformanceObserver` entries, once with the preloader
  and once as a returning visitor. Lighthouse's mobile preset *simulates* the
  critical path, which inflates LCP on a page shipping three self-hosted faces.
- **`audit.mjs`** sweeps nine routes at five widths and reports horizontal
  overflow, clipped text, console errors, failed requests, and any response that
  is not what the route should return.
- **`shoot.mjs`** writes full-page screenshots and reports any route/width that
  scrolls horizontally.

### A trap in the test setup, worth knowing before it costs you an hour

`playwright.config.ts` sets `reuseExistingServer: !process.env.CI`. Locally that
means **the suite will happily test whatever is already listening on port 3100**,
including a build of code you have since changed. On 2026-09-06 that produced
twelve confident failures, a bisect against `git stash` that appeared to confirm
them, and a wrong conclusion, before the port was freed and the same code passed
40/40.

If the suite fails in a way that makes no sense — home-page tests timing out on
the preloader is the signature — kill anything on 3100 and run it again. And do
not leave stray `next start` servers around: several production servers plus the
suite's own four workers is enough contention on its own to time tests out.

### One known console notice

On desktop only: `THREE.Clock: This module has been deprecated`. It comes from
inside `@react-three/fiber`, which calls a `three` API that `three` has since
deprecated. Both packages are on their latest versions (fiber 9.7.0, three
0.185.1). It clears when fiber updates. **There is nothing to change in this
repository.**

---

## 16. Deliberate departures from the original brief

Each of these is a case where two parts of the brief pulled against each other.
They are documented so nobody "fixes" them back.

**Work rail marks are hand-written SVG, not Recharts sparklines.** The brief asks
for a sparkline of each project's key metric, but it also forbids invented
numbers, and the source gives point values and one genuine before/after, with no
time series anywhere. `MetricMark` picks forms the source actually supports.
Recharts is still the chart library, on the regression and the dashboard.

**Experience uses `<details>`, not the Radix accordion.** Two non-negotiables
decided it: with JavaScript unavailable the extra bullets still open, and
dropping the primitive helped hold the 180 KB budget. Keyboard and
screen-reader behaviour come free.

**A lightened blue for marks on black.** See section 8.

**Errors are not red.** Colour appears only where it encodes data, so an invalid
field is marked by a mono prefix.

**Next 15, not 16.** `create-next-app@latest` now scaffolds Next 16; the brief
specifies 15, so the scaffold was pinned back.

**A procedural galaxy, not a video.** A clip good enough for a full-screen hero
is several megabytes, cannot react to the drag, and would undo the JS budget on
its own.

**Always the moon, never the sun**, beside the about section. See section 9.

**The résumé PDF is his document, not a rendering of the page.** A generator
that wrote to that path was deleted along with its npm script: with an authored
file at that path a generator pointed at the same name is not merely unused, it
is a loaded gun. One `npm run gen:resume` and his résumé would be silently
replaced.

---

## 17. Complete change history

Thirty-two commits, 2026-09-01 to 2026-09-06. In order.

### Phase 1: the build (2026-09-01 to 09-04)

**`0b1448a` Initial commit from Create Next App.**

**`ffd5cd4` Build the portfolio site.** The whole thing in one commit: Next.js 15
App Router, hero, selected work, the three live demos (subway network, print
inspection, bank marketing dashboard), the off-the-clock bento, and a working
contact route backed by Resend.

### Phase 2: the star, and what replaced the story (09-04)

**`4cd5b6d` Make the star clickable, and open it.** Clicking the centre of the
hero takes the screen: everything else fades to black and the star arrives into
it. The surface is the chromosphere in H-alpha rather than the photosphere in
white light, which is why it is fibrils and not granules. Baked into a cube map
once, behind the blackout, where a stall has nothing to stutter.

**`db68c1e` Make the star's atmosphere a volume instead of a backdrop.** The
prominences were a flat quad behind the sphere: everything they drew was a
function of distance from the middle of the *screen*, so they stood at screen
angles rather than at places on the sun and had no depth. Now each fragment
walks its own view ray through a shell around the star, sampled in the star's
own frame. Prominences stand on polarity inversion lines read from a baked field
cube, so a prominence at the limb is the filament that would be dark if it faced
us. The march skips the disc entirely, which is what pays for it.

**`2d7408d` Replace the strand and the graph with thirteen billion years.** The
scroll section's visual became the history of the universe in eight cross-fading
stages. Seven point clouds and one shaded sphere, all generated.

**`31e14c2` Ray-trace a black hole where the story was.** Replaced again, this
time with a single Schwarzschild black hole where the light is actually bent:
every pixel casts a ray backwards and integrates a null geodesic
(`d²u/dφ² = -u + (3/2) rs u²`). Everything the picture is known for falls out of
that loop rather than being drawn on top of it. The shadow edge lands at √27 M
because that is where captured rays end, not because a radius was typed in.

**`d8a74ae` Always show the moon beside the about section.** The sun/moon branch
removed. See section 9.

**`ece5e04` Earth, a card deck, shooting stars, and a landing that does not turn
a corner.** The black hole became **Earth**, from NASA's Blue Marble and Black
Marble at 4096 across. The rocket's landing corner was fixed (the cause was a
clamp whose slope where it clamped was `-π/0.68` rather than zero, so radial
speed fell from about -2.9 to exactly 0 between two frames). Off the clock became
a deck on a phone. Meteors crossed the sky behind the whole document. The
measured-outcomes section was removed and the ones after it renumbered. `/media`
got a real cache lifetime.

### Phase 3: real content (09-05)

**`be48d0b` Real links, and Team 7 on the watching card.** The LinkedIn and
GitHub URLs were placeholders, which the footer, the résumé page and the Person
schema were all quietly filtering out rather than printing, so the links were
**missing, not broken**. The Naruto card got official key art, cropped off its
scanned frame and re-encoded from the 1200px master.

**`0f4dbc6` Date the bank marketing project from its own history.** The last
placeholder that actually printed. Taken from the GitHub repository: six
commits, 11 to 17 January 2025. Written as a single month, because a week is
what the history supports.

**`9a19d9f` The résumé PDF the download button was promising.** `/resume` had had
a Download button pointing at a file that never existed, so it 404'd on the one
page a recruiter is most likely to use it. Also fixed a print rule: `li, section,
article` all carried `break-inside: avoid`, and on the résumé `section` and
`article` are page-sized containers, so the printer pushed each block whole and
left the rest of the sheet blank. Four sheets at 64% coverage became three at
85%. Also dropped the create-next-app leftover SVGs.

**`10012dd` Ship Aditya's own résumé as the download.** Replaced the generated
PDF with the tailored one-page document he actually sends to employers, and
deleted the generator.

**`c2e71ec` Bring the site in line with the résumé.** Google's three Mumbai
entries became one remote role. Constituents AI moved from Delhi to Remote. The
summary gained its closing metrics sentence. Skills took the résumé's five
groups. Education gained coursework. The experience heading was **typed, not
counted**, so it read "Five roles, one throughline" above three of them; it is
derived now, and the acceptance test that pinned the exact string was loosened to
match the shape.

**`90a9e4a` Let the globe outlive its section, and put back what the résumé
trimmed.** MLOps, prompt engineering and Azure came back. The Earth became a
fixed viewport layer instead of a canvas in a sticky box. The IntersectionObserver
deciding whether to draw was watching a box that is now `fixed` and therefore
always intersecting, so scroll position decides instead.

**`1bd753a` Retitle the three roles.** On his instruction. Sentence case.

### Phase 4: the relay (09-05)

**`d5d26ee` Carry the Earth into the Moon, across experience.** The relay, built.
`sky-relay.ts` created as a pure function. This is where the `AIM.y` inversion
and the 429 kB first-load regression were found and fixed.

**`d9d2392` Frame the receding Earth with the camera, not with CSS.** Two faults
that compounded. The globe was scaled about its *moving* centre while also being
translated by the same delta, one correction too many: it landed 254px from where
the arithmetic put it, and was then hidden by a coverage test that believed the
arithmetic rather than the pixels, so it blinked out with fifty pixels still
showing. And a canvas image is clipped at its own edges, so shrinking the layer
brought the straight cut into the middle of the picture. Both go away by asking
the camera: apparent size goes as one over the range, so a third of the size is
three times as far away. The journey also gained its bow.

**`ba5f18e` The cut was the moon's night side.** Not a clip. The drawn disc was
measured against its box at three window shapes and is a perfect circle at 0.893
of the frame every time. What ended at a hard edge was the earthshine, which had
no albedo (so the unlit side was one flat colour, and earthshine is the one light
in which the maria are famously visible) and no limb term (so shadowed ground
stayed at full strength right out to the edge, meeting black at a step from 19 to
1). The limb now goes 4, 2, 1 into the background.

**`79573d7` Land the moon already moving.** The latch. See section 10.

**`7162d9d` Take the judder out of the handover.** Three things. **51 canvas
reallocations in a single pass**: the moon's box was sized in CSS and moved with
a transform, and the size of an R3F canvas comes from `getBoundingClientRect`,
which a transform changes, so the renderer believed the element was resizing.
Worse, a measurement taken while the scale was small left the buffer stuck at 291
pixels stretched across 720. Fixed with a fixed layout size plus camera fill.
Second: the globe drew at 60fps while the page scrolled at 179, so the frame rate
is raised only while the scroll is actively reframing the globe. Third: the three
Earth maps were handed to the material together; one per frame now. Both canvases
also stopped re-measuring on scroll (`resize={{ scroll: false }}`).

**`f265f3f` The atmosphere was opaque where it was black.** The black gap. The
atmosphere shell is drawn 13% wider than the planet and its shader ended
`vec4(colour, 1.0)`; the blend adds alpha as well as colour, so that 1 made the
canvas fully opaque across the whole disc, including the outer part where the
shader contributes pure black. Black glass in a ring around the planet. Alpha is
now the brightest channel, so the shell is transparent exactly where it is dark.

### Phase 5: light, voice, and going live (09-05)

**`6a64fb5` Let the star's light out of the hero.** The orbit's canvas is
`inset-0` of the hero and the hero clips, so the glow fell to black at the
section's edge. Measured down the column under the star: 11, 9, 6, 4, 2, 1, 0,
hitting zero within a pixel or two of the boundary. A wash carries it further,
anchored on the same star.

**`cd9bc80` Fade the orbit's canvas at its foot.** The wash gave the light
somewhere to go but did not remove the canvas edge. The last fifth of the canvas
now tapers. Measured through the boundary: 53, 51, 46, 40, 35, 30, 25, 24, 23,
21, 20, 18, 17. Biggest step between adjacent pixels near the edge: 3 out of 765.
The taper is shallow on purpose; a deeper one removes the step just as well and
takes most of the brightness out of the two planets nearest the bottom.

**`3ad5b19` Drop the pulled-out figures from the trail.**

**`b2fbc46` Rewrite the trail in Aditya's own voice.** Six steps from business
rules to the dashboard. Also corrected a draft that had invented "six in the
morning and a cup of coffee" as colour: the ten seconds and the coffee were
already his, the six in the morning was not.

**`eca754e` Title-case the role.**

**Deployment happened here**, between commits: Vercel project created, the three
environment variables entered, the domain bought on Hostinger and pointed with an
A record, and "Valid Configuration" confirmed.

**`dbdb507` Stand the rocket on the planet, and a new coffee photograph.** Two
stacked errors. The park height was one number, 0.44, chosen to clear the largest
planet (radius 0.3); the other six have radius 0.2, so on every one of those the
craft rested a quarter of a unit above the ground, **sixty per cent of that
planet's own diameter**. And 0.44 was the wrong measurement even for the large
one: it was sized to the plume, which reaches -0.138, rather than to the craft,
whose lowest point is the nozzle at -0.072. A plume is not landing gear. The
coast now drifts from the pad it left to the pad it is going to, anchored at
`c = 0` so there is no step as it lifts.

**`1ad0cfa` Take the little charts off the work cards.** Then **`6c2de3c`
reverted it** on his instruction: "actually revert back and keep those in the
work section."

**`25f0630` Make the shortfall mark show its number.** See section 18.

### Phase 6: the record, and the landing again (09-05 to 09-06)

**`349d0de` Write the master file.** This document.

**`eb7396b` Land the craft on the planet on a phone, and on the first go.** The
stale pad and the world-space clearance, both in section 18. Reported a second
time after `dbdb507` had already been called a fix for it, which is the useful
part: `dbdb507` fixed a real fault and left two others standing behind it.

---

## 18. Mistakes made, and what they taught

This is the most useful section in the file for anyone continuing the work. Every
one of these was found by measuring, and several were wrong conclusions that had
to be corrected in the open.

### The ones that were my own false claims

**"Both TODOs render as TODO."** Only one did. The links were guarded by
`startsWith("http")` everywhere they appeared, so the placeholder URLs made the
links **missing, not broken**. Corrected explicitly to him.

**"The moon is being clipped."** It was not. Measuring the drawn disc against its
box at three window shapes showed a perfect circle at 0.893 of the frame every
time. The "cut" was the earthshine ending at a hard edge. The lesson: measure the
pixels before naming the cause.

**The chunked cube bake.** An attempt to split the moon's six-face surface bake
over six frames produced a cube with flat panels and hard seams.
`CubeCamera.update()` does more than six `setRenderTarget` calls: it updates the
rig's world matrix, and calling `updateMatrixWorld` by hand did not fix it. It
was **reverted**, with a comment in the file warning not to retry, and it had not
moved the stall anyway, because the stall is the globe.

### The geometry and rendering mistakes

**CSS transform on the Earth layer.** Scaled about a *moving* origin *and*
translated by the same delta. One correction too many. The globe landed 254px
from where the arithmetic put it, and a coverage test that believed the
arithmetic rather than the pixels then hid it with fifty pixels still visible.
**Lesson: check the drawn pixels, not the numbers that drew them.**

**`AIM.y` stored inverted.** 0.78 meaning 22% down. Harmless while the globe was
alone in the frame and 0.5 on every wide screen. Wrong the first time anything
had to be placed against it: the moon spent its first portrait outing orbiting a
point 470px below the planet it was supposed to be coming out from behind.

**Atmosphere alpha at 1.0.** Made the canvas opaque out to 1.13× the planet's
radius. Black glass. This was the "black gap between Earth and moon".

**Earthshine with no albedo and no limb falloff.** A flat slate disc ending at a
step from luminance 19 to 1. It had never shown before because the about section
only ever draws the *left half* of that scene, the lit half; the relay is the
first thing to show the whole body, and therefore the first thing to show the
half nobody had looked at.

**The arrival snapped.** Eased to a dead stop, then the page grabbed it at scroll
speed. A first attempt at fixing it latched on *journey* progress, which aimed at
something still a screen and a half below the window, and the moon sagged off the
bottom of the frame. Latching on **distance remaining** is the fix.

**51 canvas reallocations per pass.** A CSS scale changes
`getBoundingClientRect`, and that is where R3F gets its canvas size. One bad
measurement left the drawing buffer stuck at 291px stretched across 720 for the
rest of the sequence.

**The rocket never landed.** Park height fixed for the largest planet, so it
floated 0.24 units over the six small ones, and measured to the plume rather
than to the nozzle. Two independent errors in one constant.

**The rocket's first landing was on the wrong ring.** Reported as "on a phone,
the very first time, it doesn't land on the planet but slightly out of it", and
it was two independent faults stacked, again.

The first: `HeroScene` opens with `frameRing(16 / 9)` and corrects to the real
viewport a frame later. A portrait window draws the ring in from 3.45 to 3.05.
The planets take their position from that prop on every render and move; the
craft's pad is *solved once*, when a leg begins, and the first solve happens on
that first frame. So the craft spent its first landing four tenths of a unit
outboard of the planet it was supposedly standing on — and only the first,
because the next transfer re-solved it against the ring that was actually
there. Fixed by re-deriving the pad every frame while parked.

The second: `TAIL_CLEAR` is a *world-space* clearance, and the craft parks on
the pole, which is the one place on a sphere a camera looking down at it cannot
show you. In portrait the camera climbs to 4.5 to frame the ring, and only
0.658 of an offset along that pole survives the projection. The craft's centre
reached 0.816 of the planet's drawn radius: inside the outline. A wide screen
was never right either, only close enough at 1.010. Fixed by solving the
clearance in the picture rather than in the world — `standoff()` puts the foot
on the drawn limb at any camera angle, and reduces to the old constant exactly
when the view is edge-on.

Worth noting how this one was found, because three reasonable-sounding causes
were wrong first. Camera elevation was computed and ruled out (foreshortening
differs by only 6% between the two framings — true, and not the whole story).
The lit plume was read as "still under power" when the craft was parked and
that was the hull. And the disc's centre was eyeballed off a mostly-unlit
sphere, which put the offset sideways when it was radial. Only publishing the
scene's own numbers to `window` settled it: `pos.z` 3.45 against `planet.z`
3.05, in one line, after an hour of inference.

**The rocket's landing turned a visible corner.** The outward bulge was
`sin(π · min(1, c/0.68))`, whose slope where it clamps is `-π/0.68`, not zero.
Radial speed went from about -2.9 to exactly 0 between two frames.

### The bundle and build mistakes

**429 kB first load, against a 181 kB baseline.** `earthDisc` lived inside
`EarthScene`, so importing the arithmetic imported three.js, with the
`next/dynamic` boundary still in place and no longer buying anything. Split into
`earth-frame.ts`; 183 kB now.

**Print CSS `break-inside: avoid` on `section` and `article`.** On the résumé
those are page-sized containers. Telling a printer not to break inside something
that cannot fit does not make it fit: it pushes the block whole and leaves the
rest of the sheet blank. Four sheets at 64% coverage. Narrowed to `li`.

**A résumé generator pointed at an authored file's path.** Deleted, because one
accidental `npm run gen:resume` would have silently replaced his real document
with a print-out of the web page.

**"Five roles, one throughline."** above three roles. The heading was typed, not
counted. Now derived from `experience.length`, with the acceptance test loosened
from an exact string to a shape, because pinning the string would have failed on
his next job rather than catching anything.

### The information-design mistakes

**The shortfall mark did not draw its number.** He asked "this ones what? 19% but
doesn't show", and he was right. The mark encoded the figure as the **thickness**
of a full-width block: `const drop = Math.min(metric.value, 60) * 0.55`, so 19
became 10.45px of depth in a 56px viewBox, against no reference, and it
**saturated at 60**, so anything worse drew identically. Rewritten in the same
vocabulary as the `level` mark: an outlined track for the target, filled to where
the cohort actually got, a solid tick where it stops, a dashed marker at the
target. The gap between them is the number, and a fifth of a track left empty is
a fifth you can see.

**The trail's pulled-out figures.** "120s", "18 / 2,315", "0 of 5" quoted numbers
the sentence beside them had already earned, which made a section about *how* the
work is done read like a slide about *how well* it went.

**Invented colour in his voice.** A draft of the trail put "six in the morning"
and "a cup of coffee" into his mouth. The ten seconds and the coffee were already
his; the six in the morning was not.

### The measurement lessons

- **Bounding boxes over-report contrast failures.** They count the empty half of
  every short line. The method that works is a magenta sentinel mask painted over
  the glyphs, measuring only those pixels.
- **Averages hide stalls.** A page that holds 60fps and freezes twice for a third
  of a second still averages 58.
- **Headless Chromium does not wait on the GPU.** Its frame times only describe
  main-thread work.
- **Lighthouse's mobile LCP is simulated**, and swings 2.3 to 3.1 seconds between
  identical runs on this page. Both it and the measured 0.70s are reported.
- **When a scene disagrees with the maths, make the scene say what it thinks.**
  Screenshots tell you something is wrong; they are poor at telling you what. A
  temporary `window.__thing = {...}` in the frame loop, read back through
  Playwright and then deleted, settles in one line what an hour of measuring
  pixels only narrows down. R3F does not expose its store on the canvas, and
  walking the React fiber to find it does not work either — instrument the
  component.
- **A dev server is not the product.** It doubles the loading screen's blocking
  time, and "janky" reported from a dev server is usually that, or Chrome falling
  back to the integrated GPU.

---

## 19. Known limitations and open items

### Needs his action

1. **The contact form's from-address.** It sends from
   `Portfolio <onboarding@resend.dev>`, which Resend only delivers to the account
   owner's own address. The fix is to verify `adityaaryan.in` in the Resend
   dashboard and change `CONTACT_FROM` in Vercel to an address on that domain.
   **The live form should be tested.**
2. **No social preview image.** The site declares `twitter:card =
   summary_large_image` with no image behind it, so a pasted link shows a bare
   card. Offered, not yet requested.
3. **The off-the-clock card artwork is other people's work.** Official key art
   and wallpapers, supplied by him. Nothing is presented as his: every card names
   the *thing* rather than the person who made the picture, and `credit` is where
   a picture's author goes when there is one. Worth a decision before the site is
   promoted widely.
4. **No portrait.** `about.portrait.available` is `false`. Drop a 2000px image at
   `public/portrait.jpg` and flip the flag; the frame already reserves its
   dimensions so nothing shifts.
5. **Certification verification URLs.** All nine render as plain mono rows.
   Adding a `url` to an entry turns it into a link.
6. **The résumé PDF disagrees with the site on two job titles.** By his
   instruction. The PDF is his to reissue.

### Technical, and fine as they are

7. **The subway trains are simulated.** The MTA realtime feeds send protobuf with
   no CORS headers, so a browser cannot read them directly; that needs a small
   proxy. `TrainSource` in `src/lib/subway-map.ts` is the seam where one would
   attach. **The page says this plainly.**
8. **The rate limit is per-instance in-process memory.** Enough for a
   single-origin portfolio. A multi-region deployment should swap the map for a
   shared store (Upstash, Vercel KV); the call signature was designed not to
   change if that happens.
9. **`THREE.Clock` deprecation notice** on desktop. From inside fiber. Nothing to
   change here.
10. **The moon is a moon, not the Moon.** The maria are in plausible places, not
    their places. The phase and the lighting are real.
11. **The four "measured outcome" metric fragments in the hero `Constellation`**
    are only shown in the no-JS / reduced-motion fallback. Whether they should
    stay is an open question that was raised and not resolved.
12. **The mono key-measure caption lines on the work cards.** Removing them was
    offered alongside removing the charts; the charts were kept, and this was
    never decided.

---

## 20. House rules for whoever works on this next

**On content.** Everything a visitor reads is in `src/content/`. Change it there,
never in a component. If a number does not have a source, it does not go on the
site; say the thing is pending instead.

**On his voice.** Site copy is written the way he talks, and section 2 has the
phrasings. Before replacing copy that is in his voice, check with him. No em
dashes in the trail.

**On measuring.** Do not name a cause you have not measured. The tooling in
section 15 exists precisely so that "it looks cut" can be resolved into "the
earthshine has no limb falloff" rather than into a guess. Run
`measure:frames` headed. Check contrast at the glyph pixels.

**On the frame cap.** `Cadence` caps every canvas at 60. Do not raise it without
a reason; the 180Hz panel is why it exists.

**On the scenes.** They are all enhancement. Every one of them has a
server-rendered fallback that has to be right first. Before touching a scene,
check what the page looks like with JavaScript off.

**On the relay.** Read section 10 and `sky-relay.ts`'s own comments before
changing a constant. Every number in that file was checked at a terminal, and
several of them are solved from geometry rather than chosen, so changing one by
feel will break something two screens away.

**On the bundle.** The budget is 180 KB gzipped on the home page. Before adding
an import to a file that the home page reaches, ask what it drags in with it.
`earth-frame.ts` exists because of exactly that mistake. Run `npm run analyze`.

**On commits.** The commit messages in this repository explain *why*, at length,
including what was tried and rejected. That convention is the reason section 17
and 18 of this file could be written at all. Keep it. Every commit is
co-authored:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

**On pushing.** `git push origin main` is the deploy. There is no other step.

**On talking to Aditya.** He is not a coder. Explain in plain language, tell him
what you actually did rather than what you were going to do, and when he says
something is wrong, believe him and go and measure it. He was right about the
19%.
