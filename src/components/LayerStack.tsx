import { createSignal, For, Show } from "solid-js";
import { EffectType, Layer } from "../api";
import { BLENDS, effectColor, meta, summary } from "../effects";
import AddEffectMenu from "./AddEffectMenu";
import EffectIcon from "./EffectIcon";

/**
 * Sortable stack of effect boxes. Drag a box (or its grip) up or down to
 * reorder it; the top of the list draws on top.
 */
// uses pointer events instead of HTML5 drag-and-drop, so Tauri's file-drop
// handling can't get in the way
export default function LayerStack(props: {
  layers: Layer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onAdd: (t: EffectType) => void;
}) {
  const [dragId, setDragId] = createSignal<string | null>(null);
  let list!: HTMLDivElement;

  const onPointerDown = (id: string, e: PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const startY = e.clientY;
    let started = false;

    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientY - startY) < 5) return;
        started = true;
        setDragId(id);
        document.body.classList.add("dragging-layer");
      }
      ev.preventDefault();
      const from = props.layers.findIndex((l) => l.id === id);
      const others = [...list.querySelectorAll<HTMLElement>("[data-layer-id]")].filter(
        (el) => el.dataset.layerId !== id,
      );
      const to = others.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 < ev.clientY;
      }).length;
      if (from !== -1 && to !== from) props.onMove(from, to);
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("dragging-layer");
      setDragId(null);
      if (!started) props.onSelect(id);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onKeyDown = (i: number, id: string, e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      props.onSelect(id);
    } else if (e.altKey && e.key === "ArrowUp" && i > 0) {
      e.preventDefault();
      props.onMove(i, i - 1);
    } else if (e.altKey && e.key === "ArrowDown" && i < props.layers.length - 1) {
      e.preventDefault();
      props.onMove(i, i + 1);
    } else if (e.key === "Delete") {
      props.onRemove(id);
    }
  };

  return (
    <section class="card layers">
      <header class="layers-head">
        <div>
          <h2>Layers</h2>
          <p class="hint">Top draws over bottom · drag to reorder</p>
        </div>
        <AddEffectMenu onAdd={props.onAdd} />
      </header>

      <div class="stack" ref={list}>
        <Show
          when={props.layers.length > 0}
          fallback={
            <div class="empty-drop">
              <p>No effects yet.</p>
              <p class="muted">Use “Add effect” to stack fire, ripples, starlight…</p>
            </div>
          }
        >
          <span class="stack-edge">top</span>
          <For each={props.layers}>
            {(layer, i) => {
              const m = () => meta(layer.effect.type);
              const swatch = () => effectColor(layer.effect);
              return (
                <div
                  class="layer"
                  classList={{
                    selected: props.selectedId === layer.id,
                    dragging: dragId() === layer.id,
                    disabled: !layer.enabled,
                  }}
                  data-layer-id={layer.id}
                  tabIndex={0}
                  onPointerDown={(e) => onPointerDown(layer.id, e)}
                  onKeyDown={(e) => onKeyDown(i(), layer.id, e)}
                  aria-label={`${m().label} layer`}
                >
                  <span class="grip" aria-hidden="true">
                    ⋮⋮
                  </span>
                  <span class="icon-tile">
                    <EffectIcon type={layer.effect.type} size={22} />
                  </span>
                  <span class="layer-text">
                    <strong>
                      {m().label}
                      <Show when={swatch()}>
                        <span class="dot-swatch" style={{ background: swatch()! }} />
                      </Show>
                    </strong>
                    <span class="muted">
                      {summary(layer.effect)}
                      <Show when={i() < props.layers.length - 1}>
                        {" · "}
                        {BLENDS.find((b) => b.value === layer.blend)?.label}
                      </Show>
                      <Show when={layer.opacity < 1}> · {Math.round(layer.opacity * 100)}%</Show>
                    </span>
                  </span>
                  <button
                    class="icon-btn"
                    title={layer.enabled ? "Hide layer" : "Show layer"}
                    onClick={() => props.onToggle(layer.id)}
                  >
                    <Show
                      when={layer.enabled}
                      fallback={
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3 3.6M6.6 6.6C4.3 8.2 3 12 3 12s4 6 9 6c1.4 0 2.7-.4 3.8-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                        </svg>
                      }
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6Z" stroke="currentColor" stroke-width="1.8" />
                        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
                      </svg>
                    </Show>
                  </button>
                  <button class="icon-btn danger" title="Remove layer" onClick={() => props.onRemove(layer.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                    </svg>
                  </button>
                </div>
              );
            }}
          </For>
          <span class="stack-edge">bottom</span>
        </Show>
      </div>
    </section>
  );
}
