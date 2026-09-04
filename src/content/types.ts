export type Profile = {
  name: string;
  role: string;
  location: string;
  email: string;
  phone: string;
  links: { linkedin: string; github: string };
  positioning: string;
  headlineMetrics: { value: string; label: string }[];
};

export type Role = {
  org: string;
  title: string;
  location: string;
  /** ISO `YYYY-MM` */
  start: string;
  /** ISO `YYYY-MM`, or `present` */
  end: string;
  bullets: string[];
  stack: string[];
};

export type Project = {
  slug: string;
  title: string;
  hook: string;
  period: string;
  stack: string[];
  detail?: string[];
  featured?: boolean;
  /** A live, in-browser version of the project, if one exists. */
  live?: { href: string; label: string };
};

export type SkillGroup = {
  label: string;
  items: string[];
};

export type Certification = {
  issuer: string;
  name: string;
  /** Verification URL. Rendered as a link only when the client supplies one. */
  url?: string;
};

export type Education = {
  school: string;
  degree: string;
  gpa: string;
  start: string;
  end: string;
  location: string;
};
