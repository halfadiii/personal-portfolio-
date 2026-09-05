"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Cadence } from "./Cadence";
import { AIM, LENS, RANGE, WIDE_AT, standoff } from "./earth-frame";

/**
 * Earth, from low orbit, with the terminator across it.
 *
 * Unlike everything else on this site the surface here is *not* generated. It
 * is NASA's Blue Marble and Black Marble, which are public domain, resized and
 * recompressed into four maps totalling half a megabyte and loaded only when
 * this section is close. That is a deliberate reversal: a generated moon is
 * still a moon, but a generated Earth is just a blue planet, and the whole
 * point of this one is that you recognise it.
 *
 * What is generated is everything the maps cannot hold, which is all of the
 * light:
 *
 *   - **The terminator is soft and it is orange.** Not because it is drawn
 *     that way but because the air along that line is being looked through
 *     edge-on, and air scatters blue out of a beam before red. The same reason
 *     a sunset is a sunset. A hard line between day and night is the single
 *     most common tell of a fake Earth.
 *   - **Cities come on as the sun goes off**, through the terminator rather
 *     than at it, because dusk lasts a while.
 *   - **The sea glints and the land does not.** There is a mask for that, and
 *     the highlight moves as the globe turns, which is the thing that most
 *     makes it read as a sphere with water on it rather than a printed ball.
 *   - **Clouds cast shadows** onto what is underneath, offset toward the sun
 *     and lengthening as it gets lower — so the shadows rake at the
 *     terminator and vanish at noon.
 *   - **Clouds stay lit after the ground goes dark**, because they are eleven
 *     kilometres up and can still see a sun the surface has lost.
 *   - **The limb glows**, brightest on the sunward side, and the atmosphere is
 *     visible slightly beyond the edge of the solid planet — which is what
 *     makes the edge look like air rather than like the end of a texture.
 *
 * ## Why this replaced a raytraced galaxy
 *
 * The galaxy that used to be here marched a volume: every pixel integrated a
 * hundred samples through a slab of gas. It looked good and it measured well —
 * 5.6ms a frame, nothing dropped — but the compile of a shader that large cost
 * a 318ms block of the main thread at the moment the section came into view,
 * which is to say the page stopped dead while you were scrolling. This is a
 * sphere with texture lookups on it. There is no march, the shader is a
 * fraction of the size, and the cost per frame does not depend on how much of
 * the screen it covers.
 */

/** Half a megabyte, fetched only once the section is near. */
const MAPS = {
  day: "/media/earth/day.webp",
  night: "/media/earth/night.webp",
  cloud: "/media/earth/cloud.webp",
  mask: "/media/earth/mask.webp",
} as const;

/** Cloud deck height as a fraction of the radius. Real ratio, near enough. */
const CLOUD_LIFT = 1.007;
/**
 * Where the atmosphere shell is drawn out to.
 *
 * Much further than the air actually goes, and that is the point. The shell is
 * not the atmosphere — it is only the surface the shader is evaluated on, and
 * the glow inside it falls off by its own exponential. Drawn tight to the real
 * hundred kilometres, as this was, the geometry's own edge becomes the edge of
 * the glow: a band of even width with a hard rim, which is what a sticker
 * looks like and not what air looks like.
 */
const AIR_LIFT = 1.13;

/** One day, in seconds of watching. Slow enough to be weather, not a fairground. */
const SPIN_RATE = 0.0125;

/* --------------------------------------------------------------- surface */

const SURFACE_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    vUv = uv;
    // The globe is rotated by the model matrix, so the lighting has to happen
    // in world space or the sun would turn with the planet and the terminator
    // would never move.
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SURFACE_FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uCloud;
  uniform sampler2D uMask;
  uniform vec3 uSun;
  uniform float uCloudSpin;
  uniform float uExposure;
  /* One texel of the mask, handed in from the texture itself. It was a literal
     and the literal was wrong the moment the maps were regenerated at another
     size — the gradient below silently halved. */
  uniform float uMaskTexel;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;

  const float PI = 3.14159265;
  const float TAU = 6.28318531;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vView);
    vec3 L = normalize(uSun);

    vec4 mask = texture2D(uMask, vUv);
    float water = mask.r;
    float ice = mask.b;

    /*
     * A tangent frame, from the sphere itself.
     *
     * Everything below that needs to move a texture lookup by a distance —
     * the terrain gradient, the cloud shadow — needs to know which way is east
     * and which way is north at this point, in world space. On a sphere both
     * fall straight out of the normal, so there is no tangent attribute to
     * generate and no seam where one would have had to be duplicated.
     *
     * Longitude lines converge, so a step east near a pole is a much larger
     * step in u than the same step at the equator. That is the sine.
     */
    float sinLat = sqrt(max(1.0 - N.y * N.y, 1e-4));
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    vec3 north = cross(N, east);

    /*
     * Relief.
     *
     * The G channel is a high-pass of the day map, which for this source is
     * essentially its shaded topography — so the gradient of it is a usable
     * stand-in for a slope. Perturbing the normal by it means mountains catch
     * the light at a low sun and go flat at a high one, which is the whole
     * behaviour worth having from a bump map and costs two extra fetches.
     */
    float texel = uMaskTexel;
    float hx = texture2D(uMask, vUv + vec2(texel, 0.0)).g
             - texture2D(uMask, vUv - vec2(texel, 0.0)).g;
    float hy = texture2D(uMask, vUv + vec2(0.0, texel)).g
             - texture2D(uMask, vUv - vec2(0.0, texel)).g;
    // Flat where it is wet: the sea has waves, not hills, and they are handled
    // as roughness further down.
    float relief = (1.0 - water) * 1.6;
    vec3 Ng = normalize(N - (east * hx + north * hy) * relief);

    /*
     * Cloud shadows.
     *
     * The cloud casting a shadow here is the one between here and the sun, so
     * the lookup is displaced toward the sun — by the component of the light
     * that lies along the ground, over the component that points up. That
     * ratio is a tangent: nothing at noon, and long and raking as the sun goes
     * down, which is exactly how shadows behave.
     */
    vec3 flat_ = L - N * dot(N, L);
    float lift = 0.055 / max(dot(N, L), 0.22);
    vec2 shadowUv = vUv + vec2(
      dot(flat_, east) / (TAU * sinLat),
      dot(flat_, north) / PI
    ) * lift;

    vec2 cloudUv = vec2(vUv.x + uCloudSpin, vUv.y);
    float cloud = texture2D(uCloud, cloudUv).r;
    float caster = texture2D(uCloud, vec2(shadowUv.x + uCloudSpin, shadowUv.y)).r;
    float shade = 1.0 - 0.55 * smoothstep(0.16, 0.78, caster);

    float lambert = dot(Ng, L);
    float sun = max(lambert, 0.0);

    /*
     * The terminator.
     *
     * Widened well past where the geometry says day ends, because the surface
     * under a sun that has just set is still being lit by a sky that has not.
     * The warm band is the same air seen edge-on: the light reaching the
     * ground there has crossed a hundred times more atmosphere than it does at
     * noon, and everything blue in it has been scattered away long before it
     * arrives.
     */
    float dusk = smoothstep(-0.20, 0.18, lambert);
    float glow = smoothstep(0.17, 0.0, abs(lambert - 0.02));

    vec3 day = texture2D(uDay, vUv).rgb;

    /*
     * Sunlight itself reddens as it goes down. This is the light, not the ground.
     *
     * Narrow. The path length through the atmosphere only runs away in the
     * last few degrees before the sun touches the horizon — at twenty degrees
     * of elevation it is still under three times the overhead value, and
     * nothing looks orange. Spread across half a hemisphere, as this was, it
     * stops reading as a sunset and starts reading as a filter.
     */
    vec3 warmth = mix(vec3(1.18, 0.80, 0.58), vec3(1.0), smoothstep(-0.01, 0.15, lambert));
    vec3 lit = day * sun * shade * warmth;
    // Sky light: even in shadow the ground is under a blue dome.
    lit += day * vec3(0.055, 0.082, 0.140) * dusk;

    /*
     * Sun glint on water.
     *
     * A narrow lobe for the calm middle of it and a wide one for the roughness
     * around the edge, both of them gated on the water mask so no desert ever
     * shines. Ice takes a duller, broader highlight — it is bright, but it is
     * not a mirror.
     */
    vec3 H = normalize(L + V);
    float ndh = max(dot(Ng, H), 0.0);
    float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    float glint = (pow(ndh, 620.0) * 2.4 + pow(ndh, 42.0) * 0.30) * water * fresnel * 14.0;
    glint += pow(ndh, 30.0) * ice * 0.16;
    lit += vec3(1.0, 0.94, 0.82) * glint * sun;

    /*
     * Cities.
     *
     * Brought up through dusk rather than switched on at it, and never over
     * the day side — the map is a composite of cloudless nights, so used in
     * daylight it would put Tokyo on top of Tokyo.
     */
    float dark = 1.0 - smoothstep(-0.14, 0.10, lambert);
    vec3 lights = texture2D(uNight, vUv).rgb;
    lights *= lights;
    // Cloud cover puts them out.
    lit += vec3(1.00, 0.79, 0.46) * lights * dark * 4.4 * (1.0 - cloud * 0.72);

    /*
     * The air, seen through — everywhere, not only at the edge.
     *
     * This was a limb effect: a power of the facing angle, so it was nothing
     * across the middle of the disc and only appeared at the rim. That is why
     * the oceans came out almost black. Looking straight down at the sea you
     * are still looking through the whole atmosphere, and what it scatters
     * back is most of why the planet is called the blue one — the water itself
     * is dark, and a true-colour map of it is darker still.
     *
     * So the quantity is air mass: how much atmosphere the line of sight
     * crosses, which is one at the centre and grows as one over the cosine
     * toward the edge. Capped, because the real thing curves away and this
     * approximation would run to infinity at the horizon.
     */
    float facing = max(dot(N, V), 0.001);
    float airmass = min(1.0 / facing, 3.4);
    lit += vec3(0.17, 0.34, 0.72) * sun * (airmass - 0.78) * 0.34;
    // The terminator's own band, which is the same air at its longest path.
    lit += vec3(1.00, 0.50, 0.24) * glow * (airmass - 0.9) * 0.16;

    vec3 colour = lit * uExposure;
    colour = colour / (colour + vec3(0.88));
    colour = pow(clamp(colour, 0.0, 1.0), vec3(0.92));
    gl_FragColor = vec4(colour, 1.0);
  }
`;

/* ---------------------------------------------------------------- clouds */

const CLOUD_FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uCloud;
  uniform vec3 uSun;
  uniform float uCloudSpin;
  uniform float uExposure;
  uniform float uCloudTexel;
  /** Brought up once the map has arrived, so the sky does not pop in. */
  uniform float uFade;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vView);
    vec3 L = normalize(uSun);

    vec2 uv = vec2(vUv.x + uCloudSpin, vUv.y);
    float cover = texture2D(uCloud, uv).r;
    // The map runs down to nothing rather than stopping, so the thinnest haze
    // is cut off — otherwise the whole globe wears a grey film. Kept low: the
    // previous cut took most of the cloud with it.
    float alpha = smoothstep(0.05, 0.46, cover) * uFade;
    if (alpha < 0.004) discard;

    /*
     * Shaded by their own shape.
     *
     * A cloud map lit by a flat dot product is a grey stencil laid on a globe —
     * which is what this was, and why it read as part of the texture rather
     * than as something above it. Cloud has thickness, and the side of a system
     * facing the sun is bright while the far side of the same system is not.
     * Taking the gradient of the coverage and tilting the normal by it gives
     * exactly that for two extra fetches, and it is the whole difference
     * between a decal and a deck.
     */
    float texel = uCloudTexel;
    /*
     * Clamped, because this is a coverage map and not a height map.
     *
     * At the edge of a cloud the coverage falls from one to zero across a
     * texel, so its gradient there is enormous — and an unclamped tilt from it
     * throws the normal past the terminator and back, which speckles the whole
     * dusk side with hard black and white grain. Capping the slope keeps the
     * shading that makes a cloud look thick and drops the part that was only
     * ever an artefact of differentiating a mask.
     */
    float gx = clamp(texture2D(uCloud, uv + vec2(texel, 0.0)).r
             - texture2D(uCloud, uv - vec2(texel, 0.0)).r, -0.22, 0.22);
    float gy = clamp(texture2D(uCloud, uv + vec2(0.0, texel)).r
             - texture2D(uCloud, uv - vec2(0.0, texel)).r, -0.22, 0.22);
    float sinLat = sqrt(max(1.0 - N.y * N.y, 1e-4));
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    vec3 north = cross(N, east);
    vec3 Nc = normalize(N - (east * gx + north * gy) * 1.9);

    float lambert = dot(Nc, L);

    /*
     * Clouds are above the weather they make.
     *
     * Eleven kilometres of altitude buys a few extra minutes of sunlight, so
     * a deck stays lit after the ground beneath it has gone dark. That offset
     * is why the terminator on a real photograph is not a line but a band of
     * separately glowing cloud tops, and it is one of the details that reads
     * as real without anyone being able to say why.
     */
    float sun = smoothstep(-0.28, 0.30, lambert);

    // Thin cloud lights up from behind. Thick cloud does not.
    float through = pow(max(dot(-N, L), 0.0), 2.0) * (1.0 - alpha) * 0.6;

    vec3 warmth = mix(vec3(1.26, 0.76, 0.48), vec3(1.0), smoothstep(-0.04, 0.22, lambert));
    vec3 colour = vec3(1.0) * (sun * 1.24 + through) * warmth;
    // Cloud is white, so what is not lit by the sun is lit by the sky.
    colour += vec3(0.13, 0.19, 0.32) * smoothstep(-0.30, 0.30, dot(N, L));

    // Fade the deck out at the very edge of the disc, where it is being viewed
    // along its own thickness and a flat shell has nothing sensible to say.
    // Held closer to the edge than before: the deck standing a little off the
    // surface at the limb is one of the things that says this is not a ball
    // with a picture on it.
    float rim = smoothstep(-0.03, 0.15, dot(N, V));

    colour *= uExposure;
    colour = colour / (colour + vec3(0.82));
    gl_FragColor = vec4(pow(clamp(colour, 0.0, 1.0), vec3(0.92)), alpha * rim);
  }
`;

/* ------------------------------------------------------------ atmosphere */

const AIR_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * The halo outside the disc.
 *
 * Not a rim shader. A rim shader shades the *shell* — so the glow is as wide
 * as the geometry, has whatever edge the geometry has, and gets wider if you
 * move the shell out. Every one of those is wrong, and together they are why
 * the first version read as an outline drawn around a ball.
 *
 * What actually decides how bright a piece of sky is, is how much air the line
 * of sight passes through, and that depends on one number: how close the ray
 * gets to the planet before it turns away. So that number is what this
 * computes — the impact parameter — and the glow falls off from it by an
 * exponential, the way the atmosphere's own density does. The shell is then
 * just a surface to run the shader on, and it can sit anywhere outside the
 * glow without changing it.
 *
 * Two scale heights, because one does not look right. The tight one is the
 * dense lower air that makes the hard bright line hugging the horizon in every
 * photograph from orbit; the loose one is the faint high haze that fades out
 * over ten times the distance. A single exponential gives you one or the
 * other and neither on its own reads as air.
 */
const AIR_FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 uSun;
  uniform float uExposure;

  varying vec3 vWorld;

  /** Dense lower atmosphere: the bright line right against the horizon. */
  const float H_LOW = 0.009;
  /** The high haze above it, which is most of what is seen from far away. */
  const float H_HIGH = 0.032;

  void main() {
    vec3 origin = cameraPosition;
    vec3 dir = normalize(vWorld - origin);
    vec3 L = normalize(uSun);

    /*
     * Closest approach.
     *
     * The planet is at the origin, so the nearest the ray gets to its centre
     * is the length of the part of the camera's position that is perpendicular
     * to the ray. Below one it would have hit the ground — those fragments are
     * behind the solid planet and the depth test has already thrown them away.
     */
    float along = -dot(origin, dir);
    vec3 nearest = origin + dir * along;
    float impact = length(nearest);
    float height = max(impact - 1.0, 0.0);

    float low = exp(-height / H_LOW);
    float high = exp(-height / H_HIGH);

    // Taper the last of it to nothing before the shell's own edge, so there is
    // no rim to see even where the exponential has not quite reached zero.
    float taper = 1.0 - smoothstep(0.075, 0.125, height);

    // Lit by the sun at the point the ray passes closest, which is the piece of
    // air actually doing the scattering.
    vec3 up = normalize(nearest);
    float lambert = dot(up, L);
    float lit = smoothstep(-0.32, 0.26, lambert);

    // Rayleigh scattering goes as one plus cosine squared of the scattering
    // angle, so there is more of it straight ahead than off to the side.
    float mu = dot(dir, L);
    float phase = 0.75 * (1.0 + mu * mu);

    // The band over the terminator reddens for the same reason the ground
    // under it does: a very long path through air, with the blue taken out.
    float dusk = smoothstep(0.26, -0.04, lambert) * lit;

    vec3 nearAir = mix(vec3(0.62, 0.82, 1.00), vec3(1.00, 0.52, 0.24), dusk);
    vec3 farAir = mix(vec3(0.16, 0.36, 0.95), vec3(0.72, 0.34, 0.30), dusk * 0.75);

    vec3 colour = (nearAir * low * 1.15 + farAir * high * 0.62) * lit * phase * taper;

    colour *= uExposure;
    colour = colour / (colour + vec3(0.9));
    vec3 glow = pow(clamp(colour, 0.0, 1.0), vec3(0.92));

    /*
     * Alpha is the light this actually adds, not 1.
     *
     * The blend adds both colour and alpha, so writing 1 here made the canvas
     * opaque across the whole shell — a disc 13% wider than the planet — even
     * out at the edge where the exponential has long since fallen to nothing
     * and the shader is contributing pure black. Nothing behind the globe could
     * be seen through that ring: the star field lost a band around the limb,
     * and once the moon started coming out from *behind* the planet it spent
     * the first part of its arc hidden by black glass.
     *
     * Tying it to the brightest channel makes the shell transparent exactly
     * where it is dark, which is the only place it was ever wrong.
     */
    gl_FragColor = vec4(glow, max(max(glow.r, glow.g), glow.b));
  }
`;

/* ------------------------------------------------------------------ maps */

/** Pixel width of whatever the loader ended up producing. */
function widthOf(texture: THREE.Texture) {
  const image = texture.image as { width?: number; naturalWidth?: number } | null;
  return image?.width || image?.naturalWidth || 2048;
}

type Maps = {
  day: THREE.Texture;
  night: THREE.Texture;
  mask: THREE.Texture;
  /** Arrives after the rest. See `useMaps`. */
  cloud: THREE.Texture | null;
};

function useMaps(anisotropy: number) {
  const [maps, setMaps] = useState<Maps | null>(null);

  useEffect(() => {
    let live = true;
    const loaded: THREE.Texture[] = [];

    /*
     * Decoded off the main thread.
     *
     * Half a megabyte of WebP is two thousand by one thousand pixels four
     * times over, and `TextureLoader` decodes all of it on the thread that is
     * also trying to scroll the page — which was most of a 134ms block, and
     * 134ms of a page not responding is something you feel. `createImageBitmap`
     * hands the decode to the browser to do wherever it likes and gives back
     * something the GPU can take directly.
     *
     * The flip is the catch: three cannot apply `flipY` to an ImageBitmap, so
     * the bitmap has to be asked for the right way up when it is made. Get
     * that wrong and the world is upside down, which is at least a legible
     * failure.
     */
    const bitmaps =
      typeof createImageBitmap === "function"
        ? new THREE.ImageBitmapLoader()
        : null;
    bitmaps?.setOptions({ imageOrientation: "flipY" });
    const fallback = new THREE.TextureLoader();

    const one = (url: string, colour: boolean) =>
      new Promise<THREE.Texture>((resolve, reject) => {
        const ready = (texture: THREE.Texture) => {
          // Colour maps are sRGB; the mask is numbers and must not be
          // converted, or every threshold in the shader moves.
          texture.colorSpace = colour
            ? THREE.SRGBColorSpace
            : THREE.NoColorSpace;
          texture.anisotropy = anisotropy;
          // Longitude wraps and latitude does not — which is also what lets
          // the cloud deck be turned by sliding its lookup sideways.
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          loaded.push(texture);
          resolve(texture);
        };
        if (bitmaps) {
          bitmaps.load(
            url,
            (bitmap) => ready(new THREE.CanvasTexture(bitmap)),
            undefined,
            reject,
          );
        } else {
          fallback.load(url, ready, undefined, reject);
        }
      });

    /*
     * The ground first, the weather after.
     *
     * The cloud map is a megabyte on its own — half of everything here — and
     * the globe does not need it to be a globe. Waiting for all four means the
     * section is empty for as long as the slowest one takes; waiting for three
     * puts a planet on screen at about half the bytes and lets the sky arrive
     * over it. The surface shader reads the cloud map for shadows, and an
     * unbound sampler reads as black, which is exactly "no cloud, no shadow" —
     * so there is nothing to guard.
     */
    Promise.all([one(MAPS.day, true), one(MAPS.night, true), one(MAPS.mask, false)])
      .then(([day, night, mask]) => {
        if (!live) return;
        setMaps({ day, night, mask, cloud: null });
        return one(MAPS.cloud, false).then((cloud) => {
          if (!live) return;
          setMaps((current) => (current ? { ...current, cloud } : current));
        });
      })
      .catch(() => {
        /* No maps, no globe. The chapters are the content and they are in the
           page either way. */
      });

    return () => {
      live = false;
      for (const texture of loaded) texture.dispose();
    };
  }, [anisotropy]);

  return maps;
}

/* ----------------------------------------------------------------- scene */

/**
 * How the globe is framed, when something outside wants a say.
 *
 * `scale` is a fraction of the size it would otherwise be drawn at, and x and y
 * are where its centre goes as fractions of the frame. Both are applied through
 * the camera — further back, aimed elsewhere — and not with a CSS transform on
 * the canvas.
 *
 * That distinction is the whole reason this exists. Scaling the canvas element
 * scales an image that was already clipped at its own edges: the atmosphere
 * runs past the bottom and right of the frame at rest, which reads as bleed
 * until the layer shrinks and drags those straight cut edges into the middle of
 * the picture. Moving the camera has no edge to reveal, and redraws at full
 * resolution instead of resampling.
 */
export type EarthFrame = { scale: number; x: number; y: number };

export type EarthSceneProps = {
  /** 0..1 across the whole pinned section. */
  progressRef: React.RefObject<number>;
  /** Optional override for the shot. Left out, the globe frames itself. */
  frameRef?: React.RefObject<EarthFrame>;
  /** Cursor over the section in -1..1, and whether there is one. */
  pointerRef: React.RefObject<{ x: number; y: number; on: number }>;
  /** False once the section has been scrolled past; stops the render loop. */
  running: boolean;
  /**
   * How often to draw.
   *
   * Sixty is right for this scene at rest: the globe turns once a day and the
   * sun creeps, and nothing there is worth more frames than that on a panel
   * running at three times the rate. It is wrong while something outside is
   * moving the camera with the scroll — a position updated sixty times a second
   * against a page scrolling a hundred and eighty is a judder you can see,
   * because the type beside it is moving smoothly and the planet is not.
   */
  fps?: number;
};

export default function EarthScene({
  progressRef,
  frameRef,
  pointerRef,
  running,
  fps,
}: EarthSceneProps) {
  return (
    <Canvas
      frameloop="never"
      /*
       * Full ratio, unlike the volume this replaced. The cost here is a fixed
       * number of texture fetches per pixel rather than a hundred steps of a
       * march, so resolution is affordable — and it is the coastlines and the
       * city lights that need it.
       */
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      camera={{ fov: LENS, near: 0.1, far: 40, position: [0, 0.9, RANGE.far] }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      /*
       * Do not re-measure this canvas on scroll.
       *
       * react-use-measure, which is what sizes an R3F canvas, re-reads
       * `getBoundingClientRect` on every scroll by default — and that rect is
       * affected by transforms. The relay moves and scales this element with a
       * transform on every frame of the handover, so the measured size wobbled
       * with it and the drawing buffer was reallocated sixty-odd times in a
       * single pass, each one a React render and a rebuilt camera. Layout is
       * what decides the buffer here, and layout does not change on scroll.
       *
       * Safe because nothing in this scene answers a pointer: the rect is only
       * needed to turn a page coordinate into a canvas one.
       */
      resize={{ scroll: false }}
    >
      <Cadence running={running} fps={fps} />
      <Globe
        progressRef={progressRef}
        frameRef={frameRef}
        pointerRef={pointerRef}
      />
    </Canvas>
  );
}

function Globe({
  progressRef,
  frameRef,
  pointerRef,
}: {
  progressRef: EarthSceneProps["progressRef"];
  frameRef: EarthSceneProps["frameRef"];
  pointerRef: EarthSceneProps["pointerRef"];
}) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  const anisotropy = useMemo(
    /*
     * Sixteen where the hardware has it.
     *
     * Near the limb a texel is being squeezed into a fraction of its width
     * while keeping its full height, and that is exactly the case ordinary
     * mip-mapping handles worst: it picks a level for the *worst* axis and
     * blurs the other one to match. Anisotropic filtering samples along the
     * squeezed direction instead, and it is the single setting that decides
     * whether the edge of the disc has coastlines on it or a smear.
     */
    () => Math.min(16, gl.capabilities.getMaxAnisotropy()),
    [gl],
  );
  const maps = useMaps(anisotropy);

  const planet = useRef<THREE.Mesh>(null);
  const clouds = useRef<THREE.Mesh>(null);

  /*
   * The materials, by reference, because the uniforms objects below are not
   * the ones that end up on them.
   *
   * React Three Fiber clones what you pass as `uniforms` rather than adopting
   * it, so the tidy-looking thing — hold the object, mutate `.value` on it
   * every frame — writes to a copy nobody renders. That is not a small bug: it
   * silently reverts every uniform to whatever it was constructed with, which
   * here meant black textures and a sun stuck at its initial direction, and it
   * fails without an error because an unbound sampler is simply black. So the
   * objects below are initial values only, and everything that changes is
   * written straight to the material.
   */
  const surfaceMat = useRef<THREE.ShaderMaterial>(null);
  const cloudMat = useRef<THREE.ShaderMaterial>(null);
  const airMat = useRef<THREE.ShaderMaterial>(null);

  const sun = useMemo(() => new THREE.Vector3(1, 0, 0), []);

  const surfaceUniforms = useMemo(
    () => ({
      uDay: { value: null as THREE.Texture | null },
      uNight: { value: null as THREE.Texture | null },
      uCloud: { value: null as THREE.Texture | null },
      uMask: { value: null as THREE.Texture | null },
      uSun: { value: sun },
      uCloudSpin: { value: 0 },
      uExposure: { value: 1.34 },
      uMaskTexel: { value: 1 / 2048 },
    }),
    [sun],
  );

  const cloudUniforms = useMemo(
    () => ({
      uCloud: { value: null as THREE.Texture | null },
      uSun: { value: sun },
      uCloudSpin: { value: 0 },
      uExposure: { value: 1.25 },
      uCloudTexel: { value: 1 / 2048 },
      uFade: { value: 0 },
    }),
    [sun],
  );

  const airUniforms = useMemo(
    () => ({ uSun: { value: sun }, uExposure: { value: 1.25 } }),
    [sun],
  );

  const scratch = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      target: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      worldUp: new THREE.Vector3(0, 1, 0),
    }),
    [],
  );

  const eased = useRef(0);
  const lean = useRef({ x: 0, y: 0 });
  const clock = useRef(0);

  useFrame((_, delta) => {
    clock.current += delta;
    const time = clock.current;

    const raw = Math.min(1, Math.max(0, progressRef.current ?? 0));
    eased.current += (raw - eased.current) * (1 - Math.exp(-5 * delta));
    const p = eased.current;

    const pointer = pointerRef.current;
    const settle = 1 - Math.exp(-3 * delta);
    lean.current.x += (pointer.x * pointer.on - lean.current.x) * settle;
    lean.current.y += (pointer.y * pointer.on - lean.current.y) * settle;

    // The globe turns west to east, and the cloud deck runs a little ahead of
    // it — the jet stream, more or less.
    const spin = time * SPIN_RATE;
    if (planet.current) planet.current.rotation.y = spin;
    if (clouds.current) clouds.current.rotation.y = spin * 1.04;

    /*
     * Where the sun is, relative to where you are.
     *
     * Tied to the camera rather than fixed in the world, because the shot is
     * the point: the terminator has to stay on the visible face or there is
     * nothing to look at but a fully lit ball or a fully dark one. Sixty-five
     * degrees off the view axis puts it across the middle of the disc, with
     * the night side and its cities toward the edge of frame.
     */
    const orbit = 0.5 + p * 0.72 + lean.current.x * 0.3;
    const height = 0.2 + p * 0.3 + lean.current.y * 0.34;
    /*
     * Far enough back to be a planet.
     *
     * A 32-degree lens puts half the frame height at 0.287 of the distance, so
     * a globe of radius one needs about four and a half to sit inside the
     * picture with air around it. Three, which is where this started, is
     * closer than the International Space Station and fills the frame with a
     * patch of ground.
     */
    // A portrait frame carries the same vertical angle but far less horizontal,
    // so the distance that frames a sphere on a laptop has it spilling off both
    // sides of a phone with a paragraph on top of it. `standoff` carries that,
    // and `earthDisc` in earth-frame reads the same function — the relay
    // outside this file has to agree with this loop about where the planet is.
    //
    // Anything smaller than full size is bought with distance rather than with
    // a scale on the canvas: apparent size goes as one over the range, so a
    // third of the size is three times as far away.
    const shot = frameRef?.current;
    const shrink = Math.min(1, Math.max(0.02, shot?.scale ?? 1));
    const distance = standoff(p, size.width, size.height) / shrink;

    const cosH = Math.cos(height);
    scratch.pos.set(
      Math.sin(orbit) * cosH * distance,
      Math.sin(height) * distance,
      Math.cos(orbit) * cosH * distance,
    );

    const sunAngle = orbit + 1.16 + Math.sin(time * 0.02) * 0.05;
    sun
      .set(Math.sin(sunAngle) * 0.94, 0.28, Math.cos(sunAngle) * 0.94)
      .normalize();

    // Copied into each material's own vector, not assigned over it, for the
    // same reason: what is on the material is a clone.
    const surface = surfaceMat.current;
    if (surface) {
      surface.uniforms.uSun.value.copy(sun);
      /*
       * One map per frame, not three.
       *
       * Handing a texture to a material is where it actually reaches the GPU:
       * eight million texels uploaded and a mip chain built for each, on the
       * thread that is also running the scroll. All three at once measured at
       * 129ms of blocked main thread on first draw — the largest stall left on
       * the page, and it landed wherever the visitor happened to be scrolling.
       * Taken one at a time it is the same total work spread across three
       * frames, and the globe is not on screen yet for any of them.
       */
      if (maps) {
        if (!surface.uniforms.uDay.value) {
          surface.uniforms.uDay.value = maps.day;
          surface.needsUpdate = true;
        } else if (!surface.uniforms.uNight.value) {
          surface.uniforms.uNight.value = maps.night;
          surface.needsUpdate = true;
        } else if (!surface.uniforms.uMask.value) {
          surface.uniforms.uMask.value = maps.mask;
          surface.uniforms.uMaskTexel.value = 1 / widthOf(maps.mask);
          surface.needsUpdate = true;
        }
      }
    }
    if (cloudMat.current) {
      cloudMat.current.uniforms.uSun.value.copy(sun);
      if (surface && maps?.cloud && !surface.uniforms.uCloud.value) {
        // The ground wants it too, for the shadows it casts.
        surface.uniforms.uCloud.value = maps.cloud;
        surface.needsUpdate = true;
      }
      if (maps?.cloud && !cloudMat.current.uniforms.uCloud.value) {
        cloudMat.current.uniforms.uCloud.value = maps.cloud;
        cloudMat.current.uniforms.uCloudTexel.value = 1 / widthOf(maps.cloud);
        cloudMat.current.needsUpdate = true;
      }
      const want = maps?.cloud ? 1 : 0;
      cloudMat.current.uniforms.uFade.value +=
        (want - cloudMat.current.uniforms.uFade.value) * (1 - Math.exp(-2.6 * delta));
    }
    if (airMat.current) airMat.current.uniforms.uSun.value.copy(sun);

    scratch.target.set(0, 0, 0);
    scratch.fwd.copy(scratch.target).sub(scratch.pos).normalize();
    scratch.right.crossVectors(scratch.fwd, scratch.worldUp).normalize();
    scratch.up.crossVectors(scratch.right, scratch.fwd).normalize();

    /*
     * Where it sits, which is a legibility decision before it is a nice one.
     *
     * Wide enough for two columns and the chapters own the left, so the globe
     * is aimed into the half that is empty. On a phone there are no halves —
     * the copy is over the middle of the picture whatever happens — so instead
     * it stands back and rides high, which puts the text on sky and the limb
     * above it rather than white cloud directly behind a paragraph.
     */
    const aspect = size.width / Math.max(1, size.height);
    const halfH = Math.tan((LENS * Math.PI) / 360) * distance;
    const halfW = halfH * aspect;
    const base = size.width >= WIDE_AT ? AIM.wide : AIM.narrow;
    const aim = shot ? { x: shot.x, y: shot.y } : base;
    scratch.target.addScaledVector(scratch.right, -(aim.x - 0.5) * 2 * halfW);
    scratch.target.addScaledVector(scratch.up, (aim.y - 0.5) * 2 * halfH);

    camera.position.copy(scratch.pos);
    camera.lookAt(scratch.target);
  });

  if (!maps) return null;

  return (
    <>
      <mesh ref={planet} renderOrder={0}>
        <sphereGeometry args={[1, 160, 96]} />
        <shaderMaterial
          ref={surfaceMat}
          uniforms={surfaceUniforms}
          vertexShader={SURFACE_VERT}
          fragmentShader={SURFACE_FRAG}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={clouds} visible={Boolean(maps.cloud)} renderOrder={1}>
        <sphereGeometry args={[CLOUD_LIFT, 128, 72]} />
        <shaderMaterial
          ref={cloudMat}
          uniforms={cloudUniforms}
          vertexShader={SURFACE_VERT}
          fragmentShader={CLOUD_FRAG}
          toneMapped={false}
          transparent
          depthWrite={false}
        />
      </mesh>

      <mesh renderOrder={2}>
        <sphereGeometry args={[AIR_LIFT, 96, 56]} />
        <shaderMaterial
          ref={airMat}
          uniforms={airUniforms}
          vertexShader={AIR_VERT}
          fragmentShader={AIR_FRAG}
          toneMapped={false}
          transparent
          side={THREE.BackSide}
          depthWrite={false}
          // Air adds light; it does not cover what is behind it.
          blending={THREE.CustomBlending}
          blendSrc={THREE.OneFactor}
          blendDst={THREE.OneFactor}
        />
      </mesh>
    </>
  );
}
