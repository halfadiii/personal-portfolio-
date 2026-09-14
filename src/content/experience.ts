import type { Role } from "./types";

/**
 * Three roles, each carrying both halves of the work.
 *
 * Aditya keeps two résumés: a data and analytics one (the PDF served at
 * /aditya-aryan-resume.pdf) and an AI/ML engineer one. On 2026-09-15 he asked
 * for this section to hold the essence of both, and not to get longer for it.
 * So each role has four bullets where it used to have five, drawn from the two
 * résumés' own lines, and a title naming both kinds of work.
 *
 * That supersedes the 2026-09-05 note that two titles here deliberately
 * differed from the PDF. They now differ from both PDFs, on purpose, because
 * neither single résumé describes the combined role.
 *
 * Google was carried here as three separate Mumbai entries until 2026-09-05;
 * the résumés state that span as one remote role, and he confirmed it.
 *
 * House style: `%` rather than the word, and sentence-case titles, like every
 * other heading on the site.
 */
export const experience: Role[] = [
  {
    org: "Nissha Medical Technologies",
    title: "Machine learning & data engineer, computer vision",
    location: "Buffalo, NY",
    start: "2025-05",
    end: "2025-12",
    bullets: [
      "Built and trained a YOLOv8 object-detection model in PyTorch for automated print-defect inspection, identifying 99.9% of defects across multiple datasets.",
      "Exported it to ONNX and TensorRT on an NVIDIA Jetson edge device, cutting inference from ~300ms to 84ms, and served it with FastAPI and Docker for real-time inspection.",
      "Engineered a multi-stage quality gate in Python and OpenCV with visibility, density, and layout checks, so every pass/fail decision is auditable.",
      "Ran EDA and error audits on 4,500+ manufacturing logs with pandas and NumPy, feeding feature-engineering changes that raised consistency 27% and cut false-positive flags 18%.",
    ],
    stack: ["PyTorch", "YOLOv8", "OpenCV", "ONNX", "TensorRT", "FastAPI", "Docker", "pandas"],
  },
  {
    org: "Constituents AI & Technology",
    title: "Machine learning engineer & data analyst",
    location: "Remote",
    start: "2024-03",
    end: "2024-07",
    bullets: [
      "Developed a sentiment-analysis NLP model in scikit-learn on 1.2M+ customer reviews, surfacing the churn and satisfaction drivers leadership used for retention.",
      "Forecasted subscriber demand with time-series models, lifting quarterly forecast accuracy 20% across product lines.",
      "Mined cohort and retention patterns in SQL on PostgreSQL and designed A/B tests with segmentation logic, lifting conversion 12% in targeted offers.",
      "Built 10+ Power BI dashboards with DAX and Power Query, expanding self-service usage 65% across marketing and operations.",
    ],
    stack: ["Python", "scikit-learn", "NLP", "Prophet", "SQL", "PostgreSQL", "Power BI", "Airflow"],
  },
  {
    org: "Google",
    title: "Data engineer, analytics & ML pipelines",
    location: "Remote",
    start: "2022-06",
    end: "2024-03",
    bullets: [
      "Translated operational data into governed BigQuery tables and versioned feature datasets with dbt, Spark, and dimensional modeling, feeding both reporting and model training.",
      "Optimized BigQuery and Spark ETL jobs in Airflow with partitioning, clustering, and query rewrites to absorb 5x+ volume growth.",
      "Automated reconciliation and drift checks with PyTest and Great Expectations, catching schema and distribution changes before they reached reports or models.",
      "Consolidated KPI dashboards across 10+ business units, cutting manual spreadsheet reporting 40%, and published validated MySQL data as API-accessible packages that closed historical gaps 95%.",
    ],
    // Kept broad: merging the three earlier entries did not un-learn GCP,
    // Airflow or dbt, and Aditya asked for them kept.
    stack: ["GCP", "BigQuery", "dbt", "Airflow", "Spark", "Python", "Power BI", "MySQL"],
  },
];
