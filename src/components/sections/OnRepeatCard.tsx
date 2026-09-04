"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useCapability } from "@/components/motion/capability";
import { onRepeat } from "@/content/offclock";
import { useUi } from "@/stores/ui";
import { cn } from "@/lib/utils";

/**
 * The record, and it actually plays.
 *
 * Pointing at it starts the track and leaving stops it; pressing it toggles.
 * Both, rather than either, because a hover is not available to a thumb and a
 * press is the only thing a browser will accept as permission to make noise
 * before the visitor has touched the page at all.
 *
 * The footer's sound switch is honoured for the hover and not for the press.
 * That switch is about the site making noise at you — the ticks and confirms —
 * and a hover is close enough to that to obey it. A press on a control whose
 * label says it plays a track is not ambient anything; it is being asked, and
 * refusing it would be the site being clever at the visitor's expense.
 *
 * Nothing is fetched until the first of those happens, and nothing is fetched
 * at all until the track exists — see `onRepeat.available` in the content.
 */

/** Seconds to come up and to go away. Long enough not to click, short enough
 *  to feel like it answered the pointer. */
const FADE_IN = 0.35;
const FADE_OUT = 0.5;
const VOLUME = 0.5;

type HowlLike = {
  play: () => void;
  pause: () => void;
  stop: () => void;
  fade: (from: number, to: number, ms: number) => void;
  volume: (value?: number) => number;
  playing: () => boolean;
  unload: () => void;
  once: (event: string, handler: () => void) => void;
};

export function OnRepeatCard({ className }: { className?: string }) {
  const { pointerFine } = useCapability();
  const soundOn = useUi((state) => state.soundOn);
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState(false);
  const howl = useRef<HowlLike | null>(null);
  const wanted = useRef(false);

  useEffect(
    () => () => {
      howl.current?.unload();
      howl.current = null;
    },
    [],
  );

  const load = useCallback(async () => {
    if (howl.current) return howl.current;
    const { Howl } = await import("howler");
    const instance = new Howl({
      src: [onRepeat.src],
      volume: 0,
      html5: true,
      loop: true,
      // A file that will not load is a broken card and stays broken. A play
      // that is refused is usually the browser's autoplay policy — it wants a
      // click on the page before it will let a hover make noise — and that is
      // a "not yet", not a "never".
      onloaderror: () => setBroken(true),
      onplayerror: () => {
        wanted.current = false;
        setPlaying(false);
      },
      onend: () => setPlaying(false),
    }) as unknown as HowlLike;
    howl.current = instance;
    return instance;
  }, []);

  const start = useCallback(async () => {
    if (!onRepeat.available || broken) return;
    wanted.current = true;
    const instance = await load();
    // The pointer may well have left again while the file was arriving.
    if (!wanted.current) return;
    instance.volume(0);
    instance.play();
    instance.fade(0, VOLUME, FADE_IN * 1000);
    setPlaying(true);
  }, [broken, load]);

  const stop = useCallback(() => {
    wanted.current = false;
    const instance = howl.current;
    setPlaying(false);
    if (!instance?.playing()) return;
    instance.fade(instance.volume(), 0, FADE_OUT * 1000);
    instance.once("fade", () => {
      if (!wanted.current) instance.pause();
    });
  }, []);

  const toggle = useCallback(() => {
    if (playing) stop();
    else void start();
  }, [playing, start, stop]);

  const live = onRepeat.available && !broken;
  const hoverPlays = live && pointerFine && soundOn;

  return (
    <button
      type="button"
      onClick={live ? toggle : undefined}
      onPointerEnter={
        hoverPlays
          ? (event) => {
              if (event.pointerType === "touch") return;
              void start();
            }
          : undefined
      }
      onPointerLeave={hoverPlays ? stop : undefined}
      onBlur={hoverPlays ? stop : undefined}
      aria-pressed={live ? playing : undefined}
      disabled={!live}
      className={cn(
        "border-hairline ease-brief group relative isolate flex min-h-[15rem] flex-col justify-end overflow-hidden border text-left transition-colors duration-[var(--dur-ui)] sm:min-h-0",
        live && "hover:border-signal",
        !live && "cursor-default",
        className,
      )}
    >
      <Image
        src={onRepeat.art.src}
        alt={onRepeat.art.alt}
        fill
        sizes="(min-width: 1024px) 38vw, 100vw"
        style={{ objectPosition: onRepeat.art.position }}
        className="-z-10 object-cover"
      />
      {/* One scrim, at the foot, holding everything — so this card is composed
          exactly like the three picture cards beside it.

          It used to carry a second one at the top for the status line, which
          worked while the card was tall. It is a strip now, and two scrimmed
          ends on a strip leaves no plateau in either: the status line came out
          at 3.9 against a neon skyline. The meter moves up beside the label to
          pay for it, which is where it should have been anyway — it is a
          state, and the label line is where this card states things. */}
      <span
        data-card-scrim
        className="flex flex-col gap-2 px-5 pt-9 pb-4 [--scrim-fade:2.25rem]"
      >
        <span className="label-mono flex items-baseline justify-between gap-4">
          <span className="flex items-center gap-3">
            <span>{onRepeat.label}</span>

            {/* A level meter rather than an icon: four bars that move only
                while something is coming out of the speakers, so the card
                reports its own state instead of claiming one. */}
            <span aria-hidden className="flex h-3 items-end gap-1">
              {[0, 1, 2, 3].map((bar) => (
                <span
                  key={bar}
                  data-bar={playing ? "on" : undefined}
                  style={{ animationDelay: `${bar * 90}ms` }}
                  className={cn(
                    "bg-steel w-1 origin-bottom",
                    playing ? "h-3" : "h-1",
                  )}
                />
              ))}
            </span>
          </span>

          {live ? (
            <span className="text-signal">
              {playing
                ? "Playing"
                : pointerFine
                  ? "Hover to play"
                  : "Tap to play"}
            </span>
          ) : null}
        </span>

        <span>
          <span className="font-display text-sub text-signal block leading-none">
            {onRepeat.name}
          </span>
          <span className="text-small text-steel mt-2 block">
            {onRepeat.by} · {onRepeat.from}
          </span>
        </span>
      </span>
    </button>
  );
}
