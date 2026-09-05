import type { Chapter } from "@/components/sections/ScrollTrail";

/**
 * The scroll narrative: how a problem gets approached before it gets answered.
 *
 * Six steps, in the order they actually happen, and every one of them carries
 * an example from a project on this site rather than a principle in the
 * abstract. That constraint is the point — a method stated without evidence is
 * a list of things everybody already agrees with.
 *
 * The pulled-out figures that used to sit beside four of these are gone: the
 * chapters already carry their numbers in the sentence that earns them, and
 * quoting the same thing twice made the section read like a slide.
 *
 * The visual behind it follows the same arc: eight loose filaments knitting
 * into one strand while the copy is about framing and sources, dissolving into
 * a graph of nodes and travelling pulses as the copy reaches measurement and
 * the answer.
 */
export const trailChapters: Chapter[] = [
  {
    id: "decision",
    index: "01",
    kicker: "the decision",
    title: "Start at the decision, not the data.",
    body: "The first question is what somebody will do differently depending on the answer — who acts, and at what threshold. A question with the same action for every answer is not worth the week it costs. On the print line the ask was never whether a model could find the marks; it was whether a bad ticket could be allowed through. That framing set the two mistakes against each other, and everything downstream followed from it.",
  },
  {
    id: "source",
    index: "02",
    kicker: "what it records",
    title: "Every table records a process, not the world.",
    body: "Find out what event writes the row, when it fires, and what it does when nothing happens. The MTA publishes predictions and never arrivals: a train that has arrived simply stops being predicted. Read that column as an arrival and every number after it is wrong. The arrival is the last prediction a trip carried before it vanished — and a trip that vanishes while still minutes from due was cancelled, not arrived.",
  },
  {
    id: "impossible",
    index: "03",
    kicker: "before cleaning",
    title: "Count the things that cannot be true.",
    body: "Not a tidy-up pass — a census of the impossible, written as assertions that run on every load rather than as a cell in a notebook, because data breaks later and quietly. Every frame off the print line carries either twenty-one marks or fourteen. Eighteen came back carrying something else, and those eighteen are not noise to be dropped: they are the defect the whole system exists to catch.",
  },
  {
    id: "shape",
    index: "04",
    kicker: "the shape",
    title: "An average summarises a shape you have not looked at.",
    body: "Plot it before aggregating it: where the mass sits, where the tail runs, and above all where the seams are — the day the method changed, the batch shot on a different machine. Every good frame in the print set was photographed before the first defective one, so in collection order the opening stretch is nothing but passes. No summary statistic shows that. The ordering does, which is why the demo shuffles it and says so on the page.",
  },
  {
    id: "measure",
    index: "05",
    kicker: "with the uncertainty",
    title: "Fix the specification before you see the result.",
    body: "Choose the regressor, the controls and the window in advance, then report what comes back — including nothing. Rain against excess wait, five lines, controlled for month and for the pandemic years: five coefficients, and every interval crossing zero. That is an answer, and it is in the section below rather than quietly traded for a specification that would have cleared a threshold.",
  },
  {
    id: "answer",
    index: "06",
    kicker: "and back to the top",
    title: "The deliverable is a decision, not a chart.",
    body: "One sentence for the answer, one for the confidence, one for the conditions under which it stops holding. The print thresholds were fitted on good frames only — so catching every defective one is an out-of-sample result and the pass rate on good ones is not, which changes what each number means and is said wherever they appear. An answer that changes the question sends you back to the first step, which is where most of the work was anyway.",
  },
];
