import { invoke } from "@tauri-apps/api/core";

export type Rgb = [number, number, number];
export type Palette = "classic" | "soul" | "toxic" | "cursed" | "custom";
export type BuiltinPalette = Exclude<Palette, "custom">;
export type Blend = "normal" | "add" | "screen" | "multiply" | "lighten";
export type Trigger = "keys" | "clicks" | "both";

export type LayerEffect =
  | {
      type: "fire";
      palette: Palette;
      /** Stops for the custom palette, coolest → hottest. */
      custom: Rgb[];
      cooling: number;
      sparks: number;
      reactToKeys: boolean;
      /** Embers while idle, flames grow with typing speed. */
      typingHeat: boolean;
    }
  | { type: "solid"; color: Rgb }
  | { type: "breathing"; color: Rgb; periodSecs: number }
  | { type: "spectrum"; periodSecs: number }
  | { type: "wave"; periodSecs: number; reverse: boolean }
  | { type: "reactive"; color: Rgb; fadeMs: number; trigger: Trigger }
  | { type: "ripple"; color: Rgb; speed: number; width: number; trigger: Trigger }
  | { type: "starlight"; color: Rgb; density: number; fadeMs: number }
  // ambient
  | { type: "aurora"; colors: Rgb[]; speed: number }
  | { type: "rain"; color: Rgb; density: number; speed: number }
  | { type: "lava"; colors: Rgb[]; speed: number }
  | { type: "candle"; color: Rgb; flicker: number }
  | { type: "lightning"; color: Rgb; sky: Rgb; frequency: number; glow: number }
  | { type: "timeOfDay"; day: Rgb; night: Rgb }
  // reactive
  | { type: "comet"; color: Rgb; fadeMs: number }
  | { type: "shockwave"; color: Rgb; speed: number; trigger: Trigger }
  | { type: "fireworks"; color: Rgb; rainbow: boolean; trigger: Trigger }
  | { type: "frost"; color: Rgb; freezeSecs: number }
  | { type: "clickCharge"; color: Rgb; chargeMs: number; fadeMs: number };

export type EffectType = LayerEffect["type"];

export interface Layer {
  id: string;
  enabled: boolean;
  opacity: number;
  blend: Blend;
  effect: LayerEffect;
}

export interface DeviceCfg {
  name: string;
  pid: number;
  transactionId: number;
  kind: "keyboard" | "mouse" | "other";
  rows: number;
  cols: number;
  leds: number[];
  brightness: number;
  preferHardware: boolean;
  /** Top layer first. */
  layers: Layer[];
}

export interface Config {
  enabled: boolean;
  idleTimeoutSecs: number;
  fps: number;
  devices: DeviceCfg[];
}

export interface DeviceStatus {
  name: string;
  connected: boolean;
  firmware: string | null;
  error: string | null;
  mode: "off" | "device" | "stream";
}

export interface Status {
  dark: boolean;
  idleSecs: number;
  /** bit 1 is the keyboard hook, bit 2 is the mouse hook */
  hooks: number;
  devices: DeviceStatus[];
}

export interface Frame {
  rows: number;
  cols: number;
  rgb: number[];
}

export interface Found {
  pid: number;
  product: string;
  transactionId: number | null;
  firmware: string | null;
}

export const api = {
  getConfig: () => invoke<Config>("get_config"),
  setConfig: (config: Config) => invoke<void>("set_config", { config }),
  getStatus: () => invoke<Status>("get_status"),
  getPreview: (index: number) => invoke<Frame | null>("get_preview", { index }),
  scanDevices: () => invoke<Found[]>("scan_devices"),
};

export const hex = (n: number, width = 2) => "0x" + n.toString(16).toUpperCase().padStart(width, "0");

export const rgbToHex = ([r, g, b]: Rgb) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

export const hexToRgb = (h: string): Rgb => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
