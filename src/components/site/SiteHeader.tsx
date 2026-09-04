import Link from "next/link";
import { profile } from "@/content";
import { nav } from "@/lib/site";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header
      /* Solid on a phone. The frosted treatment is 90% over black with a 2px
         blur, which is enough to sit a title under on a wide screen and not
         nearly enough on a narrow one: the bar is a sixth of the screen there,
         and body copy scrolling under it came through as legible grey. */
      className="rule-bottom bg-void sticky top-0 z-40 sm:bg-void/90 sm:backdrop-blur-[2px]"
    >
      {/* The bar's height comes from the targets inside it rather than from
          padding of its own, so it is 40px under a mouse and a thumb-sized
          60px under a finger without either being padded for the other. */}
      <div className="shell flex items-center justify-between gap-4 py-2">
        <Link
          href="/"
          className="tap font-display inline-flex text-[1rem] leading-none tracking-tight sm:text-[1.125rem]"
        >
          {profile.name}
          <span className="sr-only"> — home</span>
        </Link>

        <nav aria-label="Primary">
          <ul className="flex list-none items-center gap-4 p-0 sm:gap-6">
            {nav.map((item) => (
              <li
                key={item.href}
                className={cn(!item.compact && "hidden sm:block")}
              >
                <Link
                  href={item.href}
                  className="tap label-mono ease-brief hover:text-signal inline-flex transition-colors duration-[var(--dur-ui)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
