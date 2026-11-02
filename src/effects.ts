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
    type: "reactive",
    label: "Reactive",
    blurb: "Pressed keys light up and fade",
    group: "Reactive",
    hardware: false,
    blend: "add",
    make: () => ({ type: "reactive", color: [255, 220, 140], fadeMs: 450, trigger: "keys" }),
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
      return `${paletteLabel(e.palette)}${e.reactToKeys ? " · flares on keys" : ""}`;
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
  }
}

export const paletteLabel = (p: Palette) => (p === "custom" ? "Custom" : PALETTES[p].label);

/** The stops a fire layer actually uses. */
export const fireStops = (palette: Palette, custom: Rgb[]) => (palette === "custom" ? custom : PALETTES[palette].stops);

export const effectColor = (e: LayerEffect): string | null => ("color" in e ? rgbToHex(e.color) : null);
