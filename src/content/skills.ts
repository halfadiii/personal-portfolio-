import type { SkillGroup } from "./types";

export const skills: SkillGroup[] = [
  {
    label: "Languages & BI",
    items: [
      "SQL",
      "Python (pandas, NumPy, scikit-learn)",
      "R",
      "Power BI",
      "Tableau",
      "DAX",
      "Power Query",
      "Excel",
      "Git",
    ],
  },
  {
    label: "Statistics & ML",
    items: [
      "Regression",
      "Time-series forecasting",
      "A/B testing",
      "Cohort & retention",
      "Segmentation",
      "Feature engineering",
      "EDA",
      "MLOps",
    ],
  },
  {
    label: "Data engineering",
    items: [
      "ETL/ELT",
      "dbt",
      "Airflow",
      "Spark",
      "Star-schema modeling",
      "Warehousing",
      "Cleansing",
      "Validation",
      "Governance",
    ],
  },
  {
    label: "Platforms & AI",
    items: [
      "BigQuery",
      "Snowflake",
      "GCP/AWS/Azure",
      "PostgreSQL/MySQL/SQL Server",
      "LLMs",
      "RAG",
      "Prompt engineering",
      "Vector DBs",
    ],
  },
];
