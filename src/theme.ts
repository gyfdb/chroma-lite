import { createSignal } from "solid-js";

/** "system" follows the OS; the others pin Aalto's light or dark scheme. */
export type ThemePref = "system" | "light" | "dark";

const KEY = "chroma-lite.theme";

function load(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(t: ThemePref) {
  // no data-theme means tokens.css falls back to prefers-color-scheme
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}

const [theme, setThemeSignal] = createSignal(load());
apply(theme());
export { theme };

export function setTheme(t: ThemePref) {
  setThemeSignal(t);
  apply(t);
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // storage unavailable, the choice just won't stick
  }
}
