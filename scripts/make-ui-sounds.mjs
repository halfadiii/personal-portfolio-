/**
 * Generates the two UI ticks in public/sound/.
 *
 * §6 asks for subtle interface ticks and nothing else — no ambient bed, no
 * autoplay. Rather than ship a licensed sample, each tick is synthesised here:
 * a short sine burst with an exponential decay, band-limited by a raised-cosine
 * attack so it does not click at the edges.
 *
 *   node scripts/make-ui-sounds.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";

const RATE = 44100;

function tone({ freq, ms, gain = 0.18, harmonic = 0 }) {
  const frames = Math.round((ms / 1000) * RATE);
  const data = new Int16Array(frames);
  const attack = Math.round(RATE * 0.0015);

  for (let i = 0; i < frames; i++) {
    const t = i / RATE;
    const decay = Math.exp(-t * (2400 / ms));
    const envelope =
      i < attack ? 0.5 - 0.5 * Math.cos((Math.PI * i) / attack) : 1;
    let sample = Math.sin(2 * Math.PI * freq * t);
    if (harmonic) sample += harmonic * Math.sin(2 * Math.PI * freq * 2 * t);
    data[i] =
      Math.max(-1, Math.min(1, sample * decay * envelope * gain)) * 32767;
  }
  return data;
}

function wav(samples) {
  const header = Buffer.alloc(44);
  const bytes = samples.length * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + bytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(bytes, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer)]);
}

const dir = new URL("../public/sound/", import.meta.url);
await mkdir(dir, { recursive: true });

await writeFile(
  new URL("tick.wav", dir),
  wav(tone({ freq: 1180, ms: 38, gain: 0.14, harmonic: 0.25 })),
);
await writeFile(
  new URL("confirm.wav", dir),
  wav(tone({ freq: 1620, ms: 62, gain: 0.16, harmonic: 0.18 })),
);

console.log("wrote public/sound/tick.wav and public/sound/confirm.wav");
