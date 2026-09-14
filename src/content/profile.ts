import type { Education, Profile } from "./types";

export const profile: Profile = {
  name: "Aditya Aryan",
  /* Title case, not the sentence case the rest of the site uses. This one is a
     job title rather than a sentence: it is the browser tab, the link preview
     card, the line under his name and the jobTitle in the structured data, and
     in every one of those it is a label. Both halves of the work since
     2026-09-15, at his request: the preview card should say AI/ML as well as
     analytics. */
  role: "AI/ML & Analytics Engineer",
  location: "New York City, NY",
  email: "adityaaryan541@gmail.com",
  phone: "+1 (716) 697-7737",
  links: {
    linkedin: "https://www.linkedin.com/in/halfadi/",
    github: "https://github.com/halfadiii",
  },
  // Third person, unlike the résumé's implied first person: this string is also
  // the meta description and the schema.org description, where a sentence
  // starting "Build governed pipelines" reads as an instruction.
  positioning:
    "AI/ML and analytics engineer with a Master's in Data Science and 3+ years across machine learning, data engineering, and BI. Ships computer vision and NLP models to production, including a YOLOv8 inspection model on edge hardware at 84ms, and builds the governed dbt and BigQuery pipelines and Power BI reporting leadership acts on.",
  headlineMetrics: [
    { value: "1.2M+", label: "transaction records analysed" },
    { value: "65%", label: "rise in dashboard adoption" },
    { value: "40%", label: "cut in reporting cycle time" },
    { value: "95%", label: "source reliability after validation" },
  ],
};

export const education: Education = {
  school: "State University of New York at Buffalo",
  degree: "MPS, Data Science & Applications",
  gpa: "3.5",
  start: "2024-08",
  end: "2025-12",
  location: "Buffalo, NY",
  coursework: [
    "Business Analytics",
    "Data Visualization",
    "Predictive Analytics",
    "Reporting Automation",
    "Cloud Analytics",
    "BigQuery",
    "Tableau",
    "DAX",
    "Microsoft Fabric",
  ],
};
