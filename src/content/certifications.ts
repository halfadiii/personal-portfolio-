import type { Certification } from "./types";

/**
 * Verification URLs are optional: each entry renders as a plain mono row until
 * the client supplies its credential link (Appendix A asset checklist).
 */
export const certifications: Certification[] = [
  { issuer: "Google · Coursera", name: "Crash Course on Python" },
  {
    issuer: "Google · Coursera",
    name: "Using Python to Interact with the Operating System",
  },
  { issuer: "Google · Coursera", name: "Introduction to Git and GitHub" },
  {
    issuer: "Google · Coursera",
    name: "Troubleshooting and Debugging Techniques",
  },
  {
    issuer: "Google · Coursera",
    name: "Configuration Management and the Cloud",
  },
  { issuer: "Vanderbilt", name: "Introduction to Programming with MATLAB" },
  { issuer: "Oracle Academy", name: "Database Foundations" },
  {
    issuer: "Red Hat Academy",
    name: "RH124 — Red Hat System Administration I",
  },
  {
    issuer: "Red Hat Academy",
    name: "RH134 — Red Hat System Administration II",
  },
];
