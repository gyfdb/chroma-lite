import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { EffectType } from "../api";
import { EFFECTS } from "../effects";
import EffectIcon from "./EffectIcon";

export default function AddEffectMenu(props: { onAdd: (t: EffectType) => void }) {
  const [open, setOpen] = createSignal(false);
  let root!: HTMLDivElement;

  onMount(() => {
    const onDown = (e: PointerEvent) => {
      if (open() && !root.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    });
  });

  const groups = ["Ambient", "Reactive"] as const;

  return (
    <div class="add-menu" ref={root}>
      <button class="add-btn" aria-expanded={open()} onClick={() => setOpen(!open())}>
        <span class="plus">+</span> Add effect <span class="caret">▾</span>
      </button>
      <Show when={open()}>
        <div class="menu" role="menu">
          <For each={groups}>
            {(g) => (
              <>
                <div class="menu-group">{g}</div>
                <For each={EFFECTS.filter((e) => e.group === g)}>
                  {(e) => (
                    <button
                      class="menu-item"
                      role="menuitem"
                      onClick={() => {
                        props.onAdd(e.type);
                        setOpen(false);
                      }}
                    >
                      <span class="icon-tile">
                        <EffectIcon type={e.type} size={22} />
                      </span>
                      <span class="menu-text">
                        <strong>{e.label}</strong>
                        <span class="muted">{e.blurb}</span>
                      </span>
                    </button>
                  )}
                </For>
              </>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
