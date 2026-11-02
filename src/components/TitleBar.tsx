import { createSignal, JSX, onCleanup, onMount } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { zoom, zoomIn, zoomOut, zoomReset } from "../zoom";

/**
 * Custom window chrome. Anything with data-tauri-drag-region drags the window
 * (double-click toggles maximize), and buttons inside it still work.
 */
export default function TitleBar(props: { children?: JSX.Element }) {
  const win = (() => {
    try {
      return getCurrentWindow();
    } catch {
      return null; // outside Tauri (plain browser preview)
    }
  })();
  const [maximized, setMaximized] = createSignal(false);

  onMount(() => {
    if (!win) return;
    const sync = () => win.isMaximized().then(setMaximized).catch(() => {});
    sync();
    let unlisten: (() => void) | undefined;
    win
      .onResized(sync)
      .then((u) => (unlisten = u))
      .catch(() => {});
    onCleanup(() => unlisten?.());
  });

  return (
    <header class="titlebar" data-tauri-drag-region>
      <div class="tb-brand" data-tauri-drag-region>
        <span class="flame" data-tauri-drag-region>
          🔥
        </span>
        <span class="tb-title" data-tauri-drag-region>
          Chroma Lite
        </span>
      </div>

      <div class="tb-spacer" data-tauri-drag-region />

      <div class="tb-extras">{props.children}</div>

      <div class="tb-zoom" title="Zoom (Ctrl + / Ctrl − / Ctrl 0, or Ctrl + wheel)">
        <button class="tb-zbtn" onClick={zoomOut} aria-label="Zoom out">
          −
        </button>
        <button class="tb-zlabel" onClick={zoomReset} aria-label="Reset zoom">
          {Math.round(zoom() * 100)}%
        </button>
        <button class="tb-zbtn" onClick={zoomIn} aria-label="Zoom in">
          +
        </button>
      </div>

      <div class="tb-controls">
        <button class="tb-btn" aria-label="Minimize" onClick={() => win?.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 5h10" stroke="currentColor" stroke-width="1" />
          </svg>
        </button>
        <button
          class="tb-btn"
          aria-label={maximized() ? "Restore" : "Maximize"}
          onClick={() => win?.toggleMaximize()}
        >
          {maximized() ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2.5 2.5V.5h7v7h-2" stroke="currentColor" />
              <rect x=".5" y="2.5" width="7" height="7" stroke="currentColor" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x=".5" y=".5" width="9" height="9" stroke="currentColor" />
            </svg>
          )}
        </button>
        <button
          class="tb-btn close"
          aria-label="Close to tray"
          title="Close (keeps running in the tray)"
          onClick={() => win?.close()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1.1" />
          </svg>
        </button>
      </div>
    </header>
  );
}
