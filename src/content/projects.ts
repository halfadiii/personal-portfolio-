import type { Project } from "./types";

export const projects: Project[] = [
  {
    slug: "nyc-subway-reliability",
    title: "NYC subway reliability pipeline",
    hook: "The MTA never records when a train actually arrives. This pipeline infers it.",
    period: "Aug 2026 – present",
    stack: ["Python", "BigQuery", "dbt", "GCP"],
    detail: [
      "Ingests eight real-time MTA feeds every 30 seconds into BigQuery.",
      "Derives actual arrivals from predictions that vanish — the source never writes an arrival event.",
      "Models excess wait time by line and hour in dbt star-schema tables.",
      "Runs a weather regression quantifying rain's measured effect on rider wait, with confidence intervals.",
    ],
    live: {
      href: "/demo/subway",
      label: "Watch an arrival happen",
    },
    repo: "https://github.com/halfadiii/nyc-subway-reliability",
    featured: true,
  },
  {
    slug: "bank-marketing-strategy",
    title: "Bank marketing strategy",
    hook: "43,193 telemarketing calls, normalised to 3NF, three classifiers — and a dashboard you can actually drive.",
    // Taken from the repository: six commits, 11–17 January 2025. A single
    // month rather than a range, because that is what the history supports.
    period: "Jan 2025",
    stack: ["Python", "scikit-learn", "SQLite", "Dash", "Plotly"],
    detail: [
      "Cleaned 45,211 contacts down to 43,193: unknown job and education removed, unknown contact method reassigned in proportion to the known split, poutcome folded into a single other category.",
      "Normalised to third normal form and loaded into SQLite as a main table joined to a previous-outcome table, so the transitive dependency on poutcome was removed rather than tolerated.",
      "Fitted logistic regression, a decision tree, and gradient boosting on a stratified 80/20 split. Gradient boosting took it at 0.916 ROC AUC — accuracy is the wrong column when 88% of contacts say no.",
      "Chi-squared and t-tests on job, education, housing, and previous outcome, all reported with their statistics rather than a verdict.",
    ],
    live: {
      href: "/dashboard/bank-marketing",
      label: "Open the live dashboard",
    },
  },
  {
    slug: "print-inspection-cv",
    title: "AI print inspection system",
    hook: "Defect detection on high-speed print lines, 69% → 95% mAP.",
    period: "Aug 2025 – Dec 2025",
    stack: ["OpenCV", "YOLOv8", "Python"],
    detail: [
      "Automated defect detection on high-speed print lines, reducing manual review time by 40%.",
      "Improved detection performance by 38 points of mAP across multiple print surfaces.",
      "Analysed 700+ print sheets with defect clustering, raising fault-pattern identification accuracy by 25%.",
      "Deployed into live inspection systems with real-time alerts, improving traceability by 35%.",
    ],
    live: {
      href: "/demo/print-inspection",
      label: "Watch the line run",
    },
  },
  {
    slug: "fda-agentic-rag",
    title: "Agentic RAG over FDA filings",
    hook: "Answers regulatory questions from 116 FDA documents, cites the page, and refuses rather than guess.",
    // Taken from the project folder: every file in it is dated 12–14 September 2026.
    period: "Sep 2026",
    stack: ["Python", "Qdrant", "BM25", "bge-small", "DeepSeek"],
    detail: [
      "Audited the corpus before indexing it: 42 of 140 downloaded 510(k) summaries were scanned images with no text, and were excluded rather than indexed empty.",
      "Searches 1,752 chunks two ways at once, by meaning and by exact keyword, and fuses the rankings, because \"ISO 10993-1\" and \"how is it sterilised\" fail in opposite ways.",
      "A relevance gate refuses when the retrieved passages do not answer the question, instead of answering from whatever text came closest.",
      "Every claim cites a numbered source, checked in plain code: a draft citing a source it was never given is thrown away, rewritten once, then refused.",
    ],
    live: {
      href: "/demo/rag",
      label: "Ask it a question",
    },
    repo: "https://github.com/halfadiii/fda-510k-agentic-rag",
  },
  {
    slug: "fake-news-detector",
    title: "Real-time fake news detector",
    hook: "TF-IDF and ensemble models at 91% precision, streamed to a live dashboard.",
    period: "Jan 2025 – Feb 2025",
    stack: ["spaCy", "TF-IDF", "SVM", "Logistic Regression"],
  },
  {
    slug: "streaming-engagement-analytics",
    title: "Streaming engagement analytics",
    hook: "567,528 rows of Netflix's own engagement data: total hours keep rising, hours per title keep falling.",
    period: "Sep 2026",
    stack: ["Python", "SQL", "SQLite", "Power BI"],
    detail: [
      "Modelled three half-yearly What We Watched reports and five years of weekly Top 10 charts — 94 countries, 567,528 rows — as two fact tables at different grains over conformed date, title and region dimensions, exported as a star Power BI loads directly. A weekly rank and a six-month hours total do not reconcile into one table without discarding one of them.",
      "Checked the build against Netflix's own published totals before trusting a single query against it: 95.19, 96.21 and 97.66 billion hours across the three halves.",
      "Series earn three and a half times what films earn per title, and the gap is widening — film titles grew from 8,674 to 9,179 while film hours fell from 24.1 to 23.3 billion. The growth is a wider catalogue, not bigger hits.",
      "The Gentlemen's second season pulled its own first season, all but gone from the charts since 2024, back into the Top 10 of 56 markets in its premiere week and 85 of 94 the week after. A premiere measured on its own undercounts what the release earned.",
      "Two bugs found rather than shipped: keying a title on show_title alone merged two concurrently-charting seasons of the same show into one row, and filtering to the latest week before a LAG() window ran left one row per partition, so the biggest-movers query silently returned nothing.",
    ],
    live: {
      href: "/dashboard/netflix-engagement",
      label: "Open the live dashboard",
    },
    repo: "https://github.com/halfadiii/netflix-engagement-analytics",
  },
  {
    slug: "mineral-mapping",
    title: "Mineral mapping and classification",
    hook: "Remote sensing plus ML for mineral exploration. Paper under review.",
    period: "Aug 2022 – Dec 2022",
    stack: ["CNN", "Random Forest", "Remote sensing"],
  },
];

export const featuredProject =
  projects.find((project) => project.featured) ?? projects[0];

export function projectBySlug(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug);
}
