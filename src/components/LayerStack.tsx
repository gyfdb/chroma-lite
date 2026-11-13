import { createSignal, For, Show } from "solid-js";
import { EffectType, Layer } from "../api";
import { BLENDS, effectColor, meta, summary } from "../effects";
import { Button, Card, Icon, IconButton } from "../aalto";
import AddEffectDialog from "./AddEffectDialog";
import EffectIcon from "./EffectIcon";

/**
 * Sortable stack of effect rows. Drag a row up or down to reorder it; the top
 * of the list draws on top.
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
  const [adding, setAdding] = createSignal(false);
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
    if (e.target !== e.currentTarget) return;
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
    <Card variant="outlined" class="section layers">
      <header class="section-head">
        <div>
          <h2 class="title-medium">Layers</h2>
          <p class="body-small muted">Top draws over bottom. Drag to reorder.</p>
        </div>
        <Button variant="tonal" icon="add" onClick={() => setAdding(true)}>
          Add effect
        </Button>
      </header>

      <div class="stack" ref={list}>
        <Show
          when={props.layers.length > 0}
          fallback={
            <div class="empty">
              <Icon name="layers" size={32} />
              <p class="body-large">No effects yet</p>
              <p class="body-medium muted">Add fire, ripples or starlight and stack them however you like.</p>
            </div>
          }
        >
          <For each={props.layers}>
            {(layer, i) => {
              const m = () => meta(layer.effect.type);
              const swatch = () => effectColor(layer.effect);
              return (
                <div
                  class="layer aa-sl"
                  classList={{
                    "is-selected": props.selectedId === layer.id,
                    "is-dragging": dragId() === layer.id,
                    "is-hidden": !layer.enabled,
                  }}
                  data-layer-id={layer.id}
                  tabIndex={0}
                  onPointerDown={(e) => onPointerDown(layer.id, e)}
                  onKeyDown={(e) => onKeyDown(i(), layer.id, e)}
                  aria-label={`${m().label} layer`}
                >
                  <Icon name="drag_indicator" class="grip" />
                  <span class="effect-tile">
                    <EffectIcon type={layer.effect.type} size={22} />
                  </span>
                  <span class="layer-text">
                    <span class="body-large layer-name">
                      {m().label}
                      <Show when={swatch()}>
                        <span class="dot-swatch" style={{ background: swatch()! }} />
                      </Show>
                    </span>
                    <span class="body-medium muted">
                      {summary(layer.effect)}
                      <Show when={i() < props.layers.length - 1}>
                        {" · "}
                        {BLENDS.find((b) => b.value === layer.blend)?.label}
                      </Show>
                      <Show when={layer.opacity < 1}> · {Math.round(layer.opacity * 100)}%</Show>
                    </span>
                  </span>
                  <IconButton
                    icon={layer.enabled ? "visibility" : "visibility_off"}
                    label={layer.enabled ? "Hide layer" : "Show layer"}
                    onClick={() => props.onToggle(layer.id)}
                  />
                  <IconButton icon="delete" label="Remove layer" onClick={() => props.onRemove(layer.id)} />
                </div>
              );
            }}
          </For>
        </Show>
      </div>

      <AddEffectDialog open={adding()} onClose={() => setAdding(false)} onAdd={props.onAdd} />
    </Card>
  );
}
