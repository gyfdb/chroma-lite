import { For, JSX, Show } from "solid-js";
import { hexToRgb, Rgb, rgbToHex } from "../api";

export function Field(props: { label: string; hint?: string; children: JSX.Element }) {
  return (
    <div class="field">
      <span class="label">
        {props.label}
        <Show when={props.hint}>
          <span class="muted"> — {props.hint}</span>
        </Show>
      </span>
      {props.children}
    </div>
  );
}

export function Slider(props: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onInput: (v: number) => void;
  /** Swaps the value label for an editable number box (e.g. "fps"). */
  editable?: { unit: string; decimals?: number };
}) {
  const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v));
  return (
    <label class="field">
      <span class="label">
        {props.label}
        <Show when={props.hint}>
          <span class="muted"> — {props.hint}</span>
        </Show>
        <Show when={props.editable} fallback={<span class="value">{props.display}</span>}>
          {(ed) => (
            <span class="value num-edit">
              <input
                type="number"
                min={props.min}
                max={props.max}
                step="any"
                value={+props.value.toFixed(ed().decimals ?? 2)}
                onClick={(e) => e.preventDefault()}
                onChange={(e) => {
                  const v = parseFloat(e.currentTarget.value);
                  if (Number.isFinite(v)) props.onInput(clamp(v));
                  e.currentTarget.value = String(+props.value.toFixed(ed().decimals ?? 2));
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
              {ed().unit}
            </span>
          )}
        </Show>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onInput={(e) => props.onInput(+e.currentTarget.value)}
      />
    </label>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label class="switch" title={props.title}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.currentTarget.checked)} />
      <span />
    </label>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="segmented">
      <For each={props.options}>
        {(o) => (
          <button classList={{ active: props.value === o.value }} onClick={() => props.onChange(o.value)}>
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}

export function ColorField(props: { label?: string; value: Rgb; onChange: (c: Rgb) => void }) {
  const presets: Rgb[] = [
    [255, 255, 255],
    [255, 60, 20],
    [255, 140, 0],
    [255, 220, 140],
    [60, 255, 120],
    [0, 160, 255],
    [150, 60, 255],
    [255, 60, 200],
  ];
  return (
    <Field label={props.label ?? "Color"}>
      <div class="color-row">
        <input type="color" value={rgbToHex(props.value)} onInput={(e) => props.onChange(hexToRgb(e.currentTarget.value))} />
        <For each={presets}>
          {(p) => (
            <button
              class="chip"
              classList={{ active: rgbToHex(p) === rgbToHex(props.value) }}
              style={{ background: rgbToHex(p) }}
              title={rgbToHex(p)}
              onClick={() => props.onChange(p)}
            />
          )}
        </For>
      </div>
    </Field>
  );
}
