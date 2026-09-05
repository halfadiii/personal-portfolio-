import type { Chapter } from "@/components/sections/ScrollTrail";

/**
 * The scroll narrative: how Aditya works, in his own words and his own order.
 *
 * Six steps that follow one job from the business rules to the screen at the
 * end of it. Method only, on his instruction: no project is named here, and the
 * pulled-out figures that used to sit beside four of these are gone. The
 * evidence lives in the case studies, and repeating it here made a section
 * about how the work is done read like a slide about how well it went.
 *
 * The voice is taken from how he actually talks about this rather than
 * invented. "You can make a hundred dashboards, but if they're not pointed at
 * what you're actually trying to do, it's just noise", "set up checks so it
 * stays clean instead of me fixing the same thing every month", the ten-second
 * health check, and the line about guessing with confidence are all his.
 *
 * No em dashes anywhere in the copy, also on his instruction. Colons, commas
 * and full stops do the same work.
 *
 * The visual behind it follows the same arc: eight loose filaments knitting
 * into one strand while the copy is about framing and sources, dissolving into
 * a graph of nodes and travelling pulses as the copy reaches measurement and
 * the answer.
 */
export const trailChapters: Chapter[] = [
  {
    id: "goal",
    index: "01",
    kicker: "The Goal",
    title: "Start with what you're actually trying to do.",
    body: "Before I build anything I want to know what the goal is. You can make a hundred dashboards, but if they're not pointed at what you're trying to decide, it's just noise, so I'd rather start there and work backwards to the data. That means pinning down the words too. What counts as a customer, when someone has actually churned. Those almost never exist in writing. They live in a few people's heads and quietly disagree.",
  },
  {
    id: "records",
    index: "02",
    kicker: "What it records",
    title: "Every table is a record of a process, not of the world.",
    body: "The usual starting position is a lot of data sitting in different systems and nobody fully trusting any of it. So I go and find what writes each row, when it fires, and the one everybody skips: what it does when nothing happens. A missing row is a claim too. Most of the numbers I've had to un-break turned out to be a column that meant one thing to the system writing it and something more convenient to whoever read it.",
  },
  {
    id: "correct",
    index: "03",
    kicker: "Make it correct",
    title: "Before you can talk about analysis, the raw data has to be right.",
    body: "Duplicates, gaps, records that don't line up across systems. It isn't glamorous and it's most of the job. The part that actually matters is what comes next: set up the checks so it stays clean, instead of me fixing the same thing every month. Assertions that run on every load, not a notebook cell I ran once and felt good about. And rows that can't be true are rarely noise to drop. More often they're the thing you were brought in to find.",
  },
  {
    id: "model",
    index: "04",
    kicker: "The Model",
    title: "Give it a shape you can query.",
    body: "Facts in the middle, dimensions around them, one row meaning exactly one thing. A wide flat table is where definitions go to start disagreeing again, so I'd rather make the joins on purpose than inherit them by accident. It's deliberately boring, and boring is the point. It's what lets somebody else pick it up, and what stops the same question getting two answers depending on who ran it.",
  },
  {
    id: "sowhat",
    index: "05",
    kicker: "The so what",
    title: "What sells the most isn't always what makes the most money.",
    body: "Then the actual thinking. Ranking by revenue tells you what's popular; ranking by margin tells you what's worth pushing. A dip in the middle of the year is a question, not a finding. Is it seasonal, is it a supply issue, or is that just how the business breathes? I'd rather say what I don't know than round it off. When the numbers are right people make better calls. When they're wrong, everyone's just guessing with confidence.",
  },
  {
    id: "dashboard",
    index: "06",
    kicker: "The Dashboard",
    title: "Open it, ten seconds, know where you stand.",
    body: "It all ends as a screen somebody opens before their coffee lands. Whoever's running the business should understand its health in about ten seconds and be able to dig in from there. So I build it backwards from the questions they'd actually ask. What's selling, what's profitable, how are we trending, where's it coming from. Not every chart I can fit onto a page. And when it isn't answering the question somebody walked up with, that's the goal at the top being wrong. Which is where you go back to.",
  },
];
