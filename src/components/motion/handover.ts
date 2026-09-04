"use client";

/**
 * When the loading screen lets go of the page.
 *
 * The preloader is the one place on this site where a stalled main thread is
 * guaranteed to be seen: a counter and a rocket are the only things on screen,
 * so anything that blocks for a quarter of a second blocks the only thing
 * anybody is looking at. Three megabytes of WebGL parsing, compiling shaders
 * and creating a context is exactly that, and it used to land in the middle of
 * the count.
 *
 * So the heavy work waits for this. The moment it waits for is the *launch*,
 * not the end of the sequence: the craft leaves the pad about 1.4s before the
 * overlay has finished clearing, and everything still moving after that point
 * is a CSS transition on opacity and transform, which the compositor runs on
 * its own thread and a busy main thread cannot interrupt. So the scene gets a
 * second and a half to build itself behind a curtain that cannot stutter, and
 * is up before the curtain is gone.
 *
 * Off the home page, on a second visit, or under reduced motion there is no
 * sequence at all and the callback runs on the spot.
 */
export function onHandover(run: () => void): () => void {
  if (typeof document === "undefined") return () => {};

  const root = document.documentElement;
  const released = () =>
    root.dataset.preloader !== "on" || root.dataset.rocket === "away";

  if (released()) {
    run();
    return () => {};
  }

  const watch = new MutationObserver(() => {
    if (!released()) return;
    watch.disconnect();
    run();
  });
  watch.observe(root, {
    attributes: true,
    attributeFilter: ["data-preloader", "data-rocket"],
  });

  return () => watch.disconnect();
}

/**
 * When the loading screen has finished and gone.
 *
 * Later than `onHandover`, and for work that has no reason to be ready any
 * earlier: the page cannot be scrolled until the overlay has cleared, so a
 * scroll library loading before then is a hundred kilobytes of parsing put in
 * front of the one animation anybody is watching. Waiting also keeps it out of
 * the way of the scene, which is racing to be up before the curtain lifts.
 */
export function onSettled(run: () => void): () => void {
  if (typeof document === "undefined") return () => {};

  const root = document.documentElement;
  const done = () =>
    root.dataset.preloader === "done" || root.dataset.preloader === undefined;

  if (done()) {
    run();
    return () => {};
  }

  const watch = new MutationObserver(() => {
    if (!done()) return;
    watch.disconnect();
    run();
  });
  watch.observe(root, { attributes: true, attributeFilter: ["data-preloader"] });

  return () => watch.disconnect();
}
