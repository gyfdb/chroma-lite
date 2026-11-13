import { For, JSX, Show } from "solid-js";
import { hexToRgb, Rgb, rgbToHex } from "../api";
import { Slider, Switch } from "../aalto";

/** A labelled block: label on top, control underneath. */
export function Field(props: { label: string; hint?: string; children: JSX.Element }) {
  return (
    <div class="field">
      <div class="field-head">
        <span class="label-large">{props.label}</span>
        <Show when={props.hint}>
          <span class="body-small muted">{props.hint}</span>
        </Show>
      </div>
      {props.children}
    </div>
  );
}

/**
 * Aalto slider with a label row. The value shows on the right, or as a small
 * number box when `editable` is set (the fps field).
 */
export function SliderField(props: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onInput: (v: number) => void;
  editable?: { unit: string; decimals?: number };
}) {
  const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v));
  const shown = (d: number) => String(+props.value.toFixed(d));
  return (
    <div class="field">
      <div class="field-head">
        <span class="label-large">{props.label}</span>
        <Show when={props.hint}>
          <span class="body-small muted">{props.hint}</span>
        </Show>
        <span class="field-spacer" />
        <Show when={props.editable} fallback={<span class="label-large value">{props.display}</span>}>
          {(ed) => (
            // a plain input on purpose: it commits on blur/Enter, so typing "0." doesn't snap back mid-edit
            <label class="num-box">
              <input
                type="number"
                min={props.min}
                max={props.max}
                step="any"
                value={shown(ed().decimals ?? 2)}
                aria-label={props.label}
                onChange={(e) => {
                  const v = parseFloat(e.currentTarget.value);
                  if (Number.isFinite(v)) props.onInput(clamp(v));
                  e.currentTarget.value = shown(ed().decimals ?? 2);
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
              <span class="body-small">{ed().unit}</span>
            </label>
          )}
        </Show>
      </div>
      <Slider
        label={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        discrete={false}
        onChange={props.onInput}
      />
    </div>
  );
}

/** Text on the left, Aalto switch on the right. */
export function SwitchRow(props: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div class="switch-row">
      <div class="switch-row-text">
        <span class="body-large">{props.label}</span>
        <Show when={props.hint}>
          <span class="body-small muted">{props.hint}</span>
        </Show>
      </div>
      <Switch checked={props.checked} onChange={props.onChange} aria-label={props.label} />
    </div>
  );
}

const PRESETS: Rgb[] = [
  [255, 255, 255],
  [255, 60, 20],
  [255, 140, 0],
  [255, 220, 140],
  [60, 255, 120],
  [0, 160, 255],
  [150, 60, 255],
  [255, 60, 200],
];

/** Color picker plus a row of quick presets. These are LED colors, not UI colors, so they stay raw. */
export function ColorField(props: { label?: string; value: Rgb; onChange: (c: Rgb) => void }) {
  return (
    <Field label={props.label ?? "Color"}>
      <div class="color-row">
        <label class="color-pick aa-sl" title="Pick any color">
          <input type="color" value={rgbToHex(props.value)} onInput={(e) => props.onChange(hexToRgb(e.currentTarget.value))} />
          <span style={{ background: rgbToHex(props.value) }} />
        </label>
        <For each={PRESETS}>
          {(p) => (
            <button
              type="button"
              class="color-preset aa-sl"
              classList={{ "is-selected": rgbToHex(p) === rgbToHex(props.value) }}
              style={{ background: rgbToHex(p) }}
              aria-label={rgbToHex(p)}
              title={rgbToHex(p)}
              onClick={() => props.onChange(p)}
            />
          )}
        </For>
      </div>
    </Field>
  );
}
