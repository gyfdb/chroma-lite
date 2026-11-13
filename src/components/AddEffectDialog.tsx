import { createEffect, For, onCleanup } from "solid-js";
import { EffectType } from "../api";
import { EFFECTS } from "../effects";
import { Button, Dialog, List, ListItem } from "../aalto";
import EffectIcon from "./EffectIcon";

const GROUPS = ["Ambient", "Reactive"] as const;

/** Picker for a new layer, grouped into ambient and reactive effects. */
export default function AddEffectDialog(props: { open: boolean; onClose: () => void; onAdd: (t: EffectType) => void }) {
  // Esc closes it, like every other dialog
  createEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      headline="Add effect"
      class="add-effect"
      actions={
        <Button variant="text" onClick={props.onClose}>
          Cancel
        </Button>
      }
    >
      <For each={GROUPS}>
        {(g) => (
          <>
            <h3 class="label-medium muted group-label">{g}</h3>
            <List class="effect-list">
              <For each={EFFECTS.filter((e) => e.group === g)}>
                {(e) => (
                  <ListItem
                    leading={
                      <span class="effect-tile">
                        <EffectIcon type={e.type} size={22} />
                      </span>
                    }
                    headline={e.label}
                    supporting={e.blurb}
                    trailing={e.hardware ? <span class="tag device">Runs on device</span> : undefined}
                    onClick={() => {
                      props.onAdd(e.type);
                      props.onClose();
                    }}
                  />
                )}
              </For>
            </List>
          </>
        )}
      </For>
    </Dialog>
  );
}
