/**
 * Fetch and prepare the Earth maps.
 *
 * Sources are NASA's Blue Marble Next Generation and Black Marble, which are
 * public domain. Run once; the output is committed and this script is not part
 * of the build.
 *
 *   day     surface colour, with shaded relief and shallow water
 *   night   city lights, for the half that is facing away from the sun
 *   cloud   cloud cover, as a single channel used for both colour and opacity
 *   mask    R = water, G = terrain relief, B = ice — derived here, not fetched
 *
 * The mask is derived rather than downloaded because everything in it is
 * already implied by the day map, and a fourth request is a fourth thing that
 * can 404 in two years' time.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("public/media/earth");
await mkdir(OUT, { recursive: true });

/*
 * The masters, not the web-sized copies.
 *
 * The 2048-wide files this started on are themselves downsamples, and at the
 * size this globe is drawn — a hemisphere across about 1200 device pixels on a
 * laptop, more on a retina one — a 2048 equirectangular map has under one
 * texel per pixel before the limb foreshortens it any further. That is the
 * whole of why it looked soft: there was no detail left in the file to show.
 * These are the originals, downsampled here to a size chosen for this shot.
 */
const SRC = {
  day: "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_8192.tif",
  cloud:
    "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_8192.tif",
  night:
    "https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.13500x6750.jpg",
};

async function grab(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/*
 * Twice the width it was, so four times the texels.
 *
 * Sized so a hemisphere still has better than a texel per device pixel at a
 * pixel ratio of two. Past this the file grows faster than the picture
 * improves, and the limb is anisotropic filtering's problem rather than
 * resolution's.
 */
const W = 4096;
const H = 2048;

console.log("fetching…");
const [dayRaw, cloudRaw, nightRaw] = await Promise.all([
  grab(SRC.day),
  grab(SRC.cloud),
  grab(SRC.night),
]);

// ---------------------------------------------------------------- day
await sharp(dayRaw)
  .resize(W, H, { fit: "fill" })
  // A touch of saturation and contrast: the source is calibrated radiance,
  // which is flatter than anything anyone has seen a photograph of.
  .modulate({ saturation: 1.16 })
  .linear(1.06, -6)
  /*
   * Sharpened after the downsample, not instead of it.
   *
   * Halving 8192 to 4096 is an average of four texels into one, and averaging
   * is a low-pass — it takes the top octave off everything, which is exactly
   * the octave a coastline lives in. An unsharp mask puts back the local
   * contrast that the resize removed. It is not inventing detail; it is
   * undoing a known blur, which is the one case sharpening is honest.
   */
  .sharpen({ sigma: 0.7, m1: 0.4, m2: 1.6 })
  // Lower quality than before and still four times the detail: at this size
  // the artefacts fall below a texel, and resolution is what is doing the work.
  // `effort` is encoder time, and it is paid once, here.
  .webp({ quality: 78, effort: 6 })
  .toFile(path.join(OUT, "day.webp"));

// ---------------------------------------------------------------- night
await sharp(nightRaw)
  .resize(W / 2, H / 2, { fit: "fill" })
  // Cities are small bright points on black — the easiest thing there is to
  // compress, and the easiest to turn into mush. Bigger, not better.
  .webp({ quality: 70, effort: 6 })
  .toFile(path.join(OUT, "night.webp"));

// ---------------------------------------------------------------- cloud
await sharp(cloudRaw)
  /*
   * Full width, same as the ground.
   *
   * They were half of it, on the reasoning that cloud is soft and does not
   * need the pixels. That reasoning is wrong once the ground got sharp: at 3x
   * magnification the coastline resolves and the cloud beside it is visibly
   * mush, and a picture is only as sharp as the softest thing you are looking
   * at. Cloud edges are also where the eye checks — they have hard boundaries
   * against dark ocean, which is the highest-contrast edge in the frame.
   *
   * Greyscale, so a channel rather than three, which is most of what pays for
   * the extra width.
   */
  .resize(W, H, { fit: "fill" })
  .greyscale()
  // Lighter than the ground's, and at a much lower quality to pay for the
  // width. Cloud has no hard interior detail to lose, so the artefacts land in
  // places nothing is looking; what it does have is edges against dark ocean,
  // and those are worth the pixels. Measured across the sweep: full width at
  // q46 costs about the same as three-quarter width at q56 and looks better.
  .sharpen({ sigma: 0.5, m1: 0.25, m2: 1.2 })
  .webp({ quality: 46, effort: 6 })
  .toFile(path.join(OUT, "cloud.webp"));

// ---------------------------------------------------------------- mask
const size = { width: W / 2, height: H / 2 };
const day = await sharp(dayRaw)
  .resize(size.width, size.height, { fit: "fill" })
  .raw()
  .toBuffer();
// A blurred copy, so relief can be had as the difference between the picture
// and itself softened — a high-pass, which is what shaded relief already is.
const soft = await sharp(dayRaw)
  .resize(size.width, size.height, { fit: "fill" })
  .blur(5)
  .raw()
  .toBuffer();

const n = size.width * size.height;
const mask = Buffer.alloc(n * 3);
let water = 0;
let ice = 0;
for (let i = 0; i < n; i++) {
  const r = day[i * 3];
  const g = day[i * 3 + 1];
  const b = day[i * 3 + 2];

  /*
   * Water is where blue leads.
   *
   * In this product the ocean is rendered as a deep, desaturated blue and land
   * never is — even the bluest tundra has red within a few counts of blue.
   * Shallow water lightens but keeps the same ordering, so one comparison
   * separates them across the whole map. Ice is the exception and is caught
   * separately below, because it is bright and neutral rather than blue.
   */
  const wet = Math.max(0, Math.min(1, (b - r - 2) / 26));

  // Ice and snow: bright and colourless. Kept out of the water channel so the
  // poles do not turn into a mirror.
  const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  const spread = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  const frozen =
    Math.max(0, Math.min(1, (lum - 0.62) / 0.22)) *
    (1 - Math.min(1, spread / 0.18));

  const lumSoft =
    (soft[i * 3] * 0.299 + soft[i * 3 + 1] * 0.587 + soft[i * 3 + 2] * 0.114) /
    255;
  // Centred on 0.5 so the shader can read it as a signed height.
  const relief = Math.max(0, Math.min(1, 0.5 + (lum - lumSoft) * 3.2));

  const w = wet * (1 - frozen);
  mask[i * 3] = Math.round(w * 255);
  mask[i * 3 + 1] = Math.round(relief * 255);
  mask[i * 3 + 2] = Math.round(frozen * 255);
  water += w;
  ice += frozen;
}
console.log(
  `water ${((water / n) * 100).toFixed(1)}% of the map (Earth is ~71%), ice ${((ice / n) * 100).toFixed(1)}%`,
);

await sharp(mask, { raw: { ...size, channels: 3 } })
  .webp({ quality: 78, effort: 6 })
  .toFile(path.join(OUT, "mask.webp"));

await writeFile(
  path.join(OUT, "SOURCE.txt"),
  [
    "Earth maps for the scroll section.",
    "",
    "day.webp    NASA Blue Marble Next Generation — land surface, shallow water,",
    "            shaded topography.",
    `            ${SRC.day}`,
    "cloud.webp  NASA Blue Marble — combined cloud cover.",
    `            ${SRC.cloud}`,
    "night.webp  NASA Black Marble 2012 — day/night band, city lights.",
    `            ${SRC.night}`,
    "mask.webp   Derived here from day.webp. R water, G relief, B ice.",
    "",
    "NASA imagery is not copyrighted and may be used without permission. See",
    "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    "Regenerate with: npm run gen:earth  (scripts/build-earth-maps.mjs)",
  ].join("\n"),
);

console.log("done →", OUT);
