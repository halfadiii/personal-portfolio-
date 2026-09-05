import type { Education, Profile } from "./types";

export const profile: Profile = {
  name: "Aditya Aryan",
  role: "Data analyst / analytics engineer",
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
    "Analytics professional with a Master's in Data Science and 3+ years across BI and data engineering. Builds governed pipelines in dbt, BigQuery, and GCP, then turns them into Power BI and SQL reporting leadership acts on. Drove a 65% rise in dashboard adoption, cut reporting cycles 40%, and lifted source reliability to 95%.",
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
