import type { Role } from "./types";

/**
 * Three roles, matching the résumé at /aditya-aryan-resume.pdf.
 *
 * Google was carried here as three separate Mumbai entries — report analyst,
 * data operations analyst, then reporting specialist — covering Jun 2022 to
 * Mar 2024. The résumé states that span as one remote role, and Aditya
 * confirmed the résumé on 2026-09-05. A visitor can read this page and open the
 * PDF in the same minute, so the two cannot disagree about where he worked.
 *
 * Bullets are the résumé's, in this file's house style: `%` rather than the
 * word, since every other bullet on the site is written that way.
 */
export const experience: Role[] = [
  {
    org: "Nissha Medical Technologies",
    title: "Data analytics & computer vision capstone",
    location: "Buffalo, NY",
    start: "2025-05",
    end: "2025-12",
    bullets: [
      "Designed automated testing routines in Python with pandas and NumPy, lowering manual production review effort by 35% across validation phases.",
      "Investigated 4,500+ manufacturing logs through EDA and statistical analysis, raising variance tracking consistency by 27%.",
      "Engineered anomaly-filtering logic with feature engineering and model checks, removing recurring calculation faults.",
      "Implemented monitoring triggers on yield variables, shortening factory inspection cycles by 31% through real-time streaming.",
      "Validated preprocessing routines under Git version control, decreasing false-positive anomaly flags by 18%.",
    ],
    stack: ["Python", "pandas", "NumPy", "OpenCV", "Git"],
  },
  {
    org: "Constituents AI & Technology",
    title: "Data analyst, business operations & reporting",
    location: "Remote",
    start: "2024-03",
    end: "2024-07",
    bullets: [
      "Developed 10+ Power BI dashboards with DAX and Power Query, merging marketing and operational clusters and expanding self-service usage by 65%.",
      "Mined 1.2M+ transaction records via SQL on PostgreSQL, running cohort and retention analysis that lifted conversions by 12%.",
      "Modeled subscriber shifts through time-series forecasting, lifting quarterly forecast accuracy by 20%.",
      "Standardized metric definitions and ran A/B testing with segmentation logic, cutting review prep timelines 40% and entry errors 90%.",
      "Facilitated requirements gathering with stakeholders, aligning raw operational metrics against structured RDBMS schemas.",
    ],
    stack: ["Power BI", "DAX", "Power Query", "PostgreSQL", "SQL"],
  },
  {
    org: "Google",
    title: "Data analytics & reporting specialist",
    location: "Remote",
    start: "2022-06",
    end: "2024-03",
    bullets: [
      "Consolidated reporting assets in Power BI and Excel across 10+ business units, shrinking manual spreadsheet work by 40% for leadership reviews.",
      "Optimized BigQuery and Spark transformation jobs feeding daily reporting, tuning partitioned query logic to stabilize production loads across dozens of migrated finance sources.",
      "Automated reconciliation checks enforcing data quality and governance across warehouse layers, flagging schema drift early to protect reporting integrity through platform transitions.",
      "Translated raw operational feeds into governed warehouse tables using dimensional modeling, documenting column-level lineage back to validated upstream finance sources.",
      "Produced standardized reporting packages from reconciled MySQL datasets, giving stakeholders consistent month-over-month figures and cutting historical gaps 95%.",
    ],
    // Only what these five bullets actually name. Airflow and dbt went with the
    // data-operations bullets the résumé drops; claiming them here would be the
    // site asserting something the résumé no longer does.
    stack: ["Power BI", "Excel", "BigQuery", "Spark", "MySQL"],
  },
];
