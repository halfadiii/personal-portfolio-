import type { Role } from "./types";

/**
 * The three Mumbai roles (Jun 2022 - Mar 2024) sit under one employer. Three
 * resume versions disagreed on the name; this is the one Aditya confirmed.
 */
const MUMBAI_EMPLOYER = "Google";

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
    title: "Data analyst",
    location: "Delhi, India",
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
    org: MUMBAI_EMPLOYER,
    title: "Data analytics & reporting specialist",
    location: "Mumbai, India",
    start: "2024-01",
    end: "2024-03",
    bullets: [
      "Consolidated reporting assets in Power BI and Excel across 10+ business units, shrinking manual spreadsheet work by 40%.",
      "Structured executive-facing KPI views, unifying fragmented metrics into one reporting layer for weekly leadership visibility.",
      "Built recurring DAX measures automating variance calculations, keeping figures aligned with upstream source systems.",
      "Delivered monthly demand patterns via regression projection models, holding forecast variation within ±6%.",
    ],
    stack: ["Power BI", "DAX", "Excel"],
  },
  {
    org: MUMBAI_EMPLOYER,
    title: "Data operations analyst",
    location: "Mumbai, India",
    start: "2023-01",
    end: "2023-12",
    bullets: [
      "Audited GCP ETL/ELT pipelines orchestrated in Airflow, adjusting validation rules to reduce load exceptions by 28%.",
      "Optimized BigQuery and Spark transformation jobs feeding reporting, tuning query logic to stabilize daily production loads.",
      "Automated reconciliation checks enforcing data quality and governance, flagging schema drift early during platform transitions.",
      "Translated raw feeds into governed warehouse tables using dimensional modeling, documenting lineage back to validated sources.",
    ],
    stack: ["GCP", "BigQuery", "Airflow", "Spark", "dbt"],
  },
  {
    org: MUMBAI_EMPLOYER,
    title: "Report analyst",
    location: "Mumbai, India",
    start: "2022-06",
    end: "2022-12",
    bullets: [
      "Isolated integrity failures with custom SQL cleansing scripts on MySQL, cutting historical reporting gaps by 95%.",
      "Analyzed monthly reconciliation between engineers and finance leads, improving reporting package clarity by 35%.",
      "Produced standardized reporting packages giving stakeholders consistent month-over-month figures across business units.",
    ],
    stack: ["SQL", "MySQL", "Excel"],
  },
];
