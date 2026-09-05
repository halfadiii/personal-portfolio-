import type { SkillGroup } from "./types";

/**
 * The résumé's five groups, in the résumé's order.
 *
 * These were four groups shaped differently — reporting tools sat with the
 * languages, and platforms sat with the AI work. Splitting analytics and
 * reporting out is the résumé's arrangement and it reads better: what he
 * builds *with* is separable from what he builds *in*.
 *
 * MLOps, prompt engineering and Azure are the site's, not the résumé's. A
 * one-page résumé cuts to fit; this section has no such limit, and Aditya
 * asked for them back after the first pass dropped them.
 */
export const skills: SkillGroup[] = [
  {
    label: "Languages",
    items: [
      "SQL",
      "Python (pandas, NumPy, scikit-learn)",
      "R",
      "DAX",
      "Power Query",
      "Git",
    ],
  },
  {
    label: "Analytics & reporting",
    items: [
      "Power BI",
      "Tableau",
      "Excel",
      "Microsoft Fabric",
      "KPI dashboards",
      "Data storytelling",
      "Executive reporting",
    ],
  },
  {
    label: "Statistical methods",
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
    label: "Data operations",
    items: [
      "ETL/ELT",
      "dbt",
      "Airflow",
      "Spark",
      "Dimensional/star-schema modeling",
      "Warehousing",
      "Cleansing",
      "Validation",
      "Governance",
    ],
  },
  {
    label: "Platforms & databases",
    items: [
      "BigQuery",
      "Snowflake",
      "GCP/AWS/Azure",
      "PostgreSQL",
      "MySQL",
      "SQL Server",
      "LLMs",
      "RAG",
      "Prompt engineering",
      "Vector DBs",
    ],
  },
];
