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
    featured: true,
  },
  {
    slug: "bank-marketing-strategy",
    title: "Bank marketing strategy",
    hook: "43,193 telemarketing calls, normalised to 3NF, three classifiers — and a dashboard you can actually drive.",
    // TODO — client to confirm the period this project ran.
    period: "TODO — confirm dates",
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
    slug: "customer-churn",
    title: "Customer churn prediction",
    hook: "87% test accuracy on 10K telecom records, surfaced in Power BI.",
    period: "Jan 2025 – Feb 2025",
    stack: ["Python", "scikit-learn", "Random Forest", "Power BI"],
  },
  {
    slug: "fake-news-detector",
    title: "Real-time fake news detector",
    hook: "TF-IDF and ensemble models at 91% precision, streamed to a live dashboard.",
    period: "Jan 2025 – Feb 2025",
    stack: ["spaCy", "TF-IDF", "SVM", "Logistic Regression"],
  },
  {
    slug: "marketing-segmentation",
    title: "Marketing campaign segmentation",
    hook: "75K customer records segmented; found the cohort running 19% below ROI.",
    period: "Jan 2025 – Feb 2025",
    stack: ["R", "rpart", "dplyr", "Power BI"],
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
