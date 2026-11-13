import { createSignal, JSX, onCleanup, onMount } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon, IconButton } from "../aalto";
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
        <Icon name="local_fire_department" filled class="tb-flame" />
        <span class="title-small" data-tauri-drag-region>
          Chroma Lite
        </span>
      </div>

      <div class="tb-spacer" data-tauri-drag-region />

      <div class="tb-extras">{props.children}</div>

      <div class="tb-zoom" title="Zoom (Ctrl + / Ctrl − / Ctrl 0, or Ctrl + wheel)">
        <IconButton icon="remove" label="Zoom out" size="xs" onClick={zoomOut} />
        <button type="button" class="tb-zlabel label-medium aa-sl" onClick={zoomReset} aria-label="Reset zoom">
          {Math.round(zoom() * 100)}%
        </button>
        <IconButton icon="add" label="Zoom in" size="xs" onClick={zoomIn} />
      </div>

      <div class="tb-controls">
        <button type="button" class="tb-btn aa-sl" aria-label="Minimize" onClick={() => win?.minimize()}>
          <Icon name="minimize" size={18} />
        </button>
        <button
          type="button"
          class="tb-btn aa-sl"
          aria-label={maximized() ? "Restore" : "Maximize"}
          onClick={() => win?.toggleMaximize()}
        >
          <Icon name={maximized() ? "filter_none" : "crop_square"} size={16} />
        </button>
        <button
          type="button"
          class="tb-btn close aa-sl"
          aria-label="Close to tray"
          title="Close (keeps running in the tray)"
          onClick={() => win?.close()}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </header>
  );
}
