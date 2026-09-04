/**
 * §6 `/about`. Three short paragraphs, education, certifications, and one line
 * beyond the résumé. Written from the facts in §5 — no claims that are not
 * already on the résumé.
 */
export const about = {
  paragraphs: [
    "I build the layer between a raw feed and a decision. Most of my work has been the unglamorous half of that: getting a warehouse to agree with itself, writing the validation that catches schema drift before a dashboard quietly starts lying, and defining a metric once so four teams stop defining it five ways.",
    "Three years of that ran across BI and data engineering — Power BI and DAX in front, GCP, BigQuery, Airflow, and dbt behind. Then a Master's in Data Science at Buffalo, and a capstone with Nissha Medical Technologies putting computer vision on a production line rather than in a notebook.",
    "The NYC subway pipeline is the project I keep returning to, because the interesting part is not the model. The MTA never publishes an arrival. Everything a rider actually wants to know sits downstream of an event that has to be inferred, defended, and tested — which is most data work, with the difficulty made visible.",
  ],
  beyond: [
    "Black belt in Okinawa Shorin Ryu karate",
    "ACM Python mentor",
    "Lead guitarist",
  ],
  portrait: {
    /**
     * Appendix A asks the client for a 2000px portrait on a neutral background.
     * Drop it at `public/portrait.jpg` and set `available` to true; the frame
     * below reserves its dimensions either way, so nothing shifts (§2.4).
     */
    available: false,
    src: "/portrait.jpg",
    width: 1200,
    height: 1500,
    alt: "Aditya Aryan, photographed against a neutral background.",
  },
} as const;
