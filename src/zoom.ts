import { createSignal } from "solid-js";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/** Same steps browsers use, so Ctrl +/- feels familiar. */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const KEY = "chroma-lite.zoom";

function load(): number {
  try {
    const v = parseFloat(localStorage.getItem(KEY) ?? "");
    return ZOOM_STEPS.includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

const [zoom, setZoomSignal] = createSignal(load());
export { zoom };

export function setZoom(z: number) {
  const v = Math.min(2, Math.max(0.5, z));
  setZoomSignal(v);
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    // storage unavailable, zoom just won't be remembered
  }
  // native webview zoom (WebView2 / WebKitGTK), keeps text crisp and hit-testing right
  getCurrentWebview()
    .setZoom(v)
    .catch(() => {});
}

export const zoomIn = () => setZoom(ZOOM_STEPS.find((s) => s > zoom() + 1e-6) ?? 2);
export const zoomOut = () => setZoom([...ZOOM_STEPS].reverse().find((s) => s < zoom() - 1e-6) ?? 0.5);
export const zoomReset = () => setZoom(1);

/** Ctrl + = / - / 0 and Ctrl + wheel. Returns a cleanup function. */
export function installZoomShortcuts(): () => void {
  // re-apply the saved level on startup
  if (zoom() !== 1) setZoom(zoom());

  const onKey = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      zoomIn();
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomOut();
    } else if (e.key === "0") {
      e.preventDefault();
      zoomReset();
    }
  };
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else if (e.deltaY > 0) zoomOut();
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("wheel", onWheel);
  };
}
