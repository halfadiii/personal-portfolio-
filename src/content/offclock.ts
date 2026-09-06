/**
 * §6 — what is on outside the work.
 *
 * Five cards, and the two that are alive are the point of it: a clock that is
 * actually the time where he is, and a track that actually plays.
 *
 * The artwork is supplied rather than found — key art and wallpapers handed
 * over for this. None of it is his, so none of it is presented as his: every
 * card names the thing rather than the person who made the picture of it, and
 * `credit` is where the picture's author goes when there is one.
 */

export type OffClockCard = {
  id: string;
  /** The mono line above the name. */
  label: string;
  name: string;
  art: {
    src: string;
    alt: string;
    /** Which part survives a square-ish crop. */
    position?: string;
  };
  /** Who made the picture, where that is somebody in particular. */
  credit?: string;
};

export const offClock: OffClockCard[] = [
  {
    id: "watching",
    label: "currently watching",
    name: "Naruto",
    art: {
      src: "/media/naruto.webp",
      alt: "Naruto key art: Kakashi, Sakura, Sasuke and Naruto leaping forward together.",
      // Centred, unlike the poster this replaced. Team 7 is arranged
      // symmetrically about Naruto, so whichever way the card crops — width on
      // a narrow laptop, height on a phone — the middle is the part to keep.
      position: "50% 50%",
    },
  },
  {
    id: "playing",
    label: "currently playing",
    name: "Rocket League",
    art: {
      src: "/media/rocket-league.jpg",
      alt: "A purple and pink Fennec on the pitch, the ball behind it.",
      position: "50% 50%",
    },
  },
  {
    id: "valorant",
    label: "also playing",
    name: "Valorant",
    art: {
      src: "/media/valorant.jpg",
      alt: "Valorant key art: the agent Omen, hooded and armed, over his own name.",
      position: "50% 42%",
    },
  },
  {
    id: "coffee",
    label: "runs on",
    name: "Coffee",
    art: {
      src: "/media/coffee.webp",
      alt: "Espresso pulling from a machine into a small cup, steam rising off it.",
      /* The card is landscape and the photograph is tall, so a little over half
         its height is cropped away. Held slightly above centre: that keeps the
         spout, the stream and the cup, and loses the machine above them, which
         is the part that reads as any coffee machine anywhere. */
      position: "50% 45%",
    },
  },
];

/**
 * The track on the music card.
 *
 * Trimmed to forty seconds and 1.5MB from a 9.8MB original, cut on MPEG frame
 * boundaries so it is still a valid file. The card plays on a hover, and a
 * hover that pulls ten megabytes is a hover that has gone wrong — this is the
 * opening of the track, which is the part a hover is asking for anyway.
 */
export const onRepeat = {
  label: "on repeat",
  name: "Am I Dreaming",
  by: "Metro Boomin, A$AP Rocky & Roisee",
  from: "Across the Spider-Verse",
  available: true,
  src: "/sound/on-repeat.mp3",
  art: {
    src: "/media/spider-verse.jpg",
    alt: "Miles Morales mid-swing through a neon city.",
    position: "50% 46%",
  },
} as const;

/**
 * What the clock says he is probably doing, from the hour it actually is.
 *
 * Derived rather than declared: there is no editable string here that can
 * quietly become untrue at four in the morning.
 */
export function hourReads(hour: number): string {
  if (hour < 5) return "Should be asleep";
  if (hour < 9) return "Coffee, first";
  if (hour < 12) return "Deep in it";
  if (hour < 14) return "Somewhere near lunch";
  if (hour < 18) return "Deep in it";
  if (hour < 22) return "Winding down";
  return "Second wind";
}
