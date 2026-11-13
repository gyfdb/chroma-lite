import { Blend, BuiltinPalette, EffectType, LayerEffect, Palette, Rgb, rgbToHex, Trigger } from "./api";

export interface EffectMeta {
  type: EffectType;
  label: string;
  blurb: string;
  group: "Ambient" | "Reactive";
  /** Can run on the device itself when it's the only layer. */
  hardware: boolean;
  make: () => LayerEffect;
  /** Blend mode that usually looks right when this is stacked on something. */
  blend: Blend;
}

export const EFFECTS: EffectMeta[] = [
  {
    type: "fire",
    label: "Fire",
    blurb: "Rising flames; can flare where you type",
    group: "Ambient",
    hardware: false,
    blend: "normal",
    make: () => ({
      type: "fire",
      palette: "classic",
      custom: PALETTES.classic.stops.map((s) => [...s] as Rgb),
      cooling: 0.22,
      sparks: 0.6,
      reactToKeys: true,
      typingHeat: false,
    }),
  },
  {
    type: "solid",
    label: "Solid",
    blurb: "One steady color",
    group: "Ambient",
    hardware: true,
    blend: "normal",
    make: () => ({ type: "solid", color: [255, 90, 20] }),
  },
  {
    type: "breathing",
    label: "Breathing",
    blurb: "Slow fade in and out",
    group: "Ambient",
    hardware: true,
    blend: "normal",
    make: () => ({ type: "breathing", color: [0, 160, 255], periodSecs: 4 }),
  },
  {
    type: "spectrum",
    label: "Spectrum",
    blurb: "Whole device cycles the rainbow",
    group: "Ambient",
    hardware: true,
    blend: "normal",
    make: () => ({ type: "spectrum", periodSecs: 9 }),
  },
  {
    type: "wave",
    label: "Wave",
    blurb: "Rainbow sweeping across",
    group: "Ambient",
    hardware: true,
    blend: "normal",
    make: () => ({ type: "wave", periodSecs: 3, reverse: false }),
  },
  {
    type: "starlight",
    label: "Starlight",
    blurb: "Random keys twinkle",
    group: "Ambient",
    hardware: false,
    blend: "screen",
    make: () => ({ type: "starlight", color: [255, 255, 255], density: 0.35, fadeMs: 900 }),
  },
  {
    type: "aurora",
    label: "Aurora",
    blurb: "Curtains of color drifting across",
    group: "Ambient",
    hardware: false,
    blend: "screen",
    make: () => ({ type: "aurora", colors: [[0, 255, 140], [0, 170, 255], [170, 60, 255]], speed: 1 }),
  },
  {
    type: "rain",
    label: "Rain",
    blurb: "Drops fall and splash on the bottom row",
    group: "Ambient",
    hardware: false,
    blend: "screen",
    make: () => ({ type: "rain", color: [120, 180, 255], density: 0.5, speed: 12 }),
  },
  {
    type: "lava",
    label: "Lava lamp",
    blurb: "Soft blobs that merge and split",
    group: "Ambient",
    hardware: false,
    blend: "normal",
    make: () => ({
      type: "lava",
      colors: [
        [30, 0, 40],
        [160, 20, 60],
        [255, 90, 0],
        [255, 200, 60],
      ],
      speed: 1,
    }),
  },
  {
    type: "candle",
    label: "Candle",
    blurb: "A warm, gentle flicker",
    group: "Ambient",
    hardware: false,
    blend: "normal",
    make: () => ({ type: "candle", color: [255, 147, 41], flicker: 0.5 }),
  },
  {
    type: "lightning",
    label: "Lightning",
    blurb: "A dim storm with the odd strike",
    group: "Ambient",
    hardware: false,
    blend: "screen",
    make: () => ({ type: "lightning", color: [200, 220, 255], sky: [20, 30, 90], frequency: 6, glow: 0.3 }),
  },
  {
    type: "timeOfDay",
    label: "Time of day",
    blurb: "Follows the clock, warm at sunrise and sunset",
    group: "Ambient",
    hardware: false,
    blend: "normal",
    make: () => ({ type: "timeOfDay", day: [255, 244, 229], night: [255, 120, 30] }),
  },
  {
    type: "reactive",
    label: "Reactive",
    blurb: "Pressed keys light up and fade",
    group: "Reactive",
    hardware: false,
    blend: "add",
    make: () => ({ type: "reactive", color: [255, 220, 140], fadeMs: 450, trigger: "keys" }),
  },
  {
    type: "comet",
    label: "Comet",
    blurb: "Typing draws streaks between keys",
    group: "Reactive",
    hardware: false,
    blend: "screen",
    make: () => ({ type: "comet", color: [120, 200, 255], fadeMs: 600 }),
  },
  {
    type: "shockwave",
    label: "Shockwave",
    blurb: "A press blasts out along its row and column",
    group: "Reactive",
    hardware: false,
    blend: "add",
    make: () => ({ type: "shockwave", color: [255, 255, 255], speed: 24, trigger: "keys" }),
  },
  {
    type: "fireworks",
    label: "Fireworks",
    blurb: "A spark shoots up from the key and bursts",
    group: "Reactive",
    hardware: false,
    blend: "screen",
    make: () => ({ type: "fireworks", color: [255, 200, 80], rainbow: true, trigger: "keys" }),
  },
  {
    type: "frost",
    label: "Frost",
    blurb: "Untouched keys frost over; typing thaws them",
    group: "Reactive",
    hardware: false,
    blend: "screen",
    make: () => ({ type: "frost", color: [170, 220, 255], freezeSecs: 30 }),
  },
  {
    type: "clickCharge",
    label: "Click charge",
    blurb: "Holding a mouse button charges it up",
    group: "Reactive",
    hardware: false,
    blend: "add",
    make: () => ({ type: "clickCharge", color: [255, 120, 40], chargeMs: 800, fadeMs: 400 }),
  },
  {
    type: "ripple",
    label: "Ripple",
    blurb: "Rings spread out from each press",
    group: "Reactive",
    hardware: false,
    blend: "screen",
    make: () => ({ type: "ripple", color: [120, 200, 255], speed: 14, width: 1.4, trigger: "keys" }),
  },
];

export const meta = (t: EffectType) => EFFECTS.find((e) => e.type === t)!;

export const PALETTES: Record<BuiltinPalette, { label: string; stops: Rgb[] }> = {
  classic: { label: "Classic", stops: [[0, 0, 0], [130, 0, 0], [255, 45, 0], [255, 140, 0], [255, 230, 120]] },
  soul: { label: "Soul", stops: [[0, 0, 0], [0, 10, 120], [0, 90, 255], [0, 200, 255], [200, 255, 255]] },
  toxic: { label: "Toxic", stops: [[0, 0, 0], [0, 70, 0], [40, 200, 0], [150, 255, 0], [230, 255, 150]] },
  cursed: { label: "Cursed", stops: [[0, 0, 0], [60, 0, 90], [150, 0, 255], [255, 60, 255], [255, 200, 255]] },
};

export const gradient = (stops: Rgb[]) => `linear-gradient(90deg, ${stops.map(rgbToHex).join(", ")})`;

export const BLENDS: { value: Blend; label: string; hint: string }[] = [
  { value: "normal", label: "Normal", hint: "Covers what's below" },
  { value: "add", label: "Add", hint: "Brightens; great for flashes" },
  { value: "screen", label: "Screen", hint: "Soft brighten" },
  { value: "lighten", label: "Lighten", hint: "Keeps the brighter color" },
  { value: "multiply", label: "Multiply", hint: "Tints / masks what's below" },
];

export const TRIGGERS: { value: Trigger; label: string }[] = [
  { value: "keys", label: "Keys" },
  { value: "clicks", label: "Clicks" },
  { value: "both", label: "Both" },
];

/** One-line summary shown on the layer box. */
export function summary(e: LayerEffect): string {
  switch (e.type) {
    case "fire":
      return `${paletteLabel(e.palette)}${e.reactToKeys ? " · flares on keys" : ""}${e.typingHeat ? " · typing heat" : ""}`;
    case "solid":
      return rgbToHex(e.color).toUpperCase();
    case "breathing":
      return `${rgbToHex(e.color).toUpperCase()} · ${e.periodSecs}s`;
    case "spectrum":
      return `${e.periodSecs}s cycle`;
    case "wave":
      return `${e.reverse ? "← " : ""}${e.periodSecs}s${e.reverse ? "" : " →"}`;
    case "reactive":
      return `on ${e.trigger} · ${e.fadeMs}ms`;
    case "ripple":
      return `on ${e.trigger}`;
    case "starlight":
      return `${Math.round(e.density * 100)}% density`;
    case "aurora":
    case "lava":
      return `${e.colors.length} colors · ${e.speed}× speed`;
    case "rain":
      return `${Math.round(e.density * 100)}% density`;
    case "candle":
      return `${Math.round(e.flicker * 100)}% flicker`;
    case "lightning":
      return `about ${e.frequency} a minute`;
    case "timeOfDay":
      return `${rgbToHex(e.day).toUpperCase()} by day`;
    case "comet":
      return `${e.fadeMs}ms trail`;
    case "shockwave":
    case "fireworks":
      return `on ${e.trigger}`;
    case "frost":
      return `freezes in ${e.freezeSecs}s`;
    case "clickCharge":
      return `${e.chargeMs}ms to full`;
  }
}

export const paletteLabel = (p: Palette) => (p === "custom" ? "Custom" : PALETTES[p].label);

/** The stops a fire layer actually uses. */
export const fireStops = (palette: Palette, custom: Rgb[]) => (palette === "custom" ? custom : PALETTES[palette].stops);

export const effectColor = (e: LayerEffect): string | null => ("color" in e ? rgbToHex(e.color) : null);
