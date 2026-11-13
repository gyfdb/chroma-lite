import { For, Match, Show, Switch as Branch } from "solid-js";
import { BuiltinPalette, hexToRgb, Layer, LayerEffect, Rgb, rgbToHex } from "../api";
import { BLENDS, gradient, meta, PALETTES, TRIGGERS } from "../effects";
import { Card, Chip, Divider, Icon, SegmentedButton, Switch } from "../aalto";
import EffectIcon from "./EffectIcon";
import { ColorField, Field, SliderField, SwitchRow } from "./ui";

const STOP_LABELS = ["Coolest", "Embers", "Flame", "Bright", "Hottest"];

type Narrow<T extends LayerEffect["type"]> = Extract<LayerEffect, { type: T }>;

/** Config panel for the selected layer. */
export default function Inspector(props: {
  layer: Layer | null;
  isBottom: boolean;
  onDevice: boolean;
  patchLayer: (p: Partial<Omit<Layer, "effect" | "id">>) => void;
  patchEffect: (p: Record<string, unknown>) => void;
}) {
  const as = <T extends LayerEffect["type"]>(t: T) =>
    props.layer?.effect.type === t ? (props.layer.effect as Narrow<T>) : null;

  return (
    <Card variant="outlined" class="section inspector">
      <Show
        when={props.layer}
        fallback={
          <div class="empty">
            <Icon name="tune" size={32} />
            <p class="body-medium muted">Select a layer to change its settings.</p>
          </div>
        }
      >
        {(layer) => (
          <>
            <header class="inspector-head">
              <span class="effect-tile big">
                <EffectIcon type={layer().effect.type} size={28} />
              </span>
              <div class="inspector-title">
                <h2 class="title-large">{meta(layer().effect.type).label}</h2>
                <p class="body-medium muted">{meta(layer().effect.type).blurb}</p>
              </div>
              <Switch
                checked={layer().enabled}
                onChange={(v) => props.patchLayer({ enabled: v })}
                aria-label="Layer on or off"
              />
            </header>

            <Show when={props.onDevice}>
              <div class="note">
                <Icon name="memory" />
                <span class="body-medium">
                  Running on the device itself, so it costs 0% CPU. The device uses its own speed, so timing sliders
                  only matter once this is stacked with other layers.
                </span>
              </div>
            </Show>

            {/* effect settings */}
            <div class="inspector-body">
              <Branch>
                <Match when={as("fire")}>
                  {(f) => (
                    <>
                      <Field label="Palette">
                        <div class="palettes">
                          <For each={Object.keys(PALETTES) as BuiltinPalette[]}>
                            {(p) => (
                              <button
                                type="button"
                                class="swatch aa-sl"
                                classList={{ "is-selected": f().palette === p }}
                                style={{ background: gradient(PALETTES[p].stops) }}
                                onClick={() => props.patchEffect({ palette: p })}
                              >
                                <span>{PALETTES[p].label}</span>
                              </button>
                            )}
                          </For>
                          <button
                            type="button"
                            class="swatch aa-sl"
                            classList={{ "is-selected": f().palette === "custom" }}
                            style={{ background: gradient(f().custom) }}
                            onClick={() => props.patchEffect({ palette: "custom" })}
                          >
                            <span><Icon name="edit" size={14} /> Custom</span>
                          </button>
                        </div>
                      </Field>
                      <Show when={f().palette === "custom"}>
                        <div class="custom-palette">
                          <div class="gradient-bar" style={{ background: gradient(f().custom) }} />
                          <div class="stops">
                            <For each={f().custom}>
                              {(stop, i) => (
                                <label class="stop aa-sl">
                                  <input
                                    type="color"
                                    value={rgbToHex(stop)}
                                    onInput={(e) => {
                                      const next = f().custom.map((s) => [...s] as Rgb);
                                      next[i()] = hexToRgb(e.currentTarget.value);
                                      props.patchEffect({ custom: next });
                                    }}
                                  />
                                  <span>{STOP_LABELS[i()] ?? `Stop ${i() + 1}`}</span>
                                </label>
                              )}
                            </For>
                          </div>
                          <div class="start-from">
                            <span class="body-small muted">Start from</span>
                            <For each={Object.keys(PALETTES) as BuiltinPalette[]}>
                              {(p) => (
                                <button
                                  type="button"
                                  class="mini-swatch aa-sl"
                                  title={`Copy ${PALETTES[p].label}`}
                                  style={{ background: gradient(PALETTES[p].stops) }}
                                  onClick={() => props.patchEffect({ custom: PALETTES[p].stops.map((s) => [...s] as Rgb) })}
                                />
                              )}
                            </For>
                          </div>
                          <p class="body-small muted">
                            Heat maps left to right: the leftmost color is the cold top of the flames, the rightmost is
                            the hot core.
                          </p>
                        </div>
                      </Show>
                      <SliderField
                        label="Flame height"
                        min={0.05}
                        max={0.6}
                        step={0.01}
                        value={0.65 - f().cooling}
                        display={`${Math.round(((0.6 - f().cooling) / 0.55) * 100)}%`}
                        onInput={(v) => props.patchEffect({ cooling: +(0.65 - v).toFixed(3) })}
                      />
                      <SliderField
                        label="Intensity"
                        min={0.1}
                        max={1}
                        step={0.01}
                        value={f().sparks}
                        display={`${Math.round(f().sparks * 100)}%`}
                        onInput={(v) => props.patchEffect({ sparks: v })}
                      />
                      <SwitchRow
                        label="Flare up where I type"
                        checked={f().reactToKeys}
                        onChange={(v) => props.patchEffect({ reactToKeys: v })}
                      />
                    </>
                  )}
                </Match>

                <Match when={as("solid")}>
                  {(s) => <ColorField value={s().color} onChange={(c) => props.patchEffect({ color: c })} />}
                </Match>

                <Match when={as("breathing")}>
                  {(b) => (
                    <>
                      <ColorField value={b().color} onChange={(c) => props.patchEffect({ color: c })} />
                      <SliderField
                        label="Breath length"
                        min={1}
                        max={10}
                        step={0.5}
                        value={b().periodSecs}
                        display={`${b().periodSecs}s`}
                        onInput={(v) => props.patchEffect({ periodSecs: v })}
                      />
                    </>
                  )}
                </Match>

                <Match when={as("spectrum")}>
                  {(s) => (
                    <SliderField
                      label="Cycle length"
                      min={2}
                      max={30}
                      step={1}
                      value={s().periodSecs}
                      display={`${s().periodSecs}s`}
                      onInput={(v) => props.patchEffect({ periodSecs: v })}
                    />
                  )}
                </Match>

                <Match when={as("wave")}>
                  {(w) => (
                    <>
                      <SliderField
                        label="Speed"
                        hint="seconds per sweep"
                        min={0.5}
                        max={10}
                        step={0.5}
                        value={w().periodSecs}
                        display={`${w().periodSecs}s`}
                        onInput={(v) => props.patchEffect({ periodSecs: v })}
                      />
                      <Field label="Direction">
                        <SegmentedButton
                          label="Direction"
                          value={w().reverse ? "rtl" : "ltr"}
                          options={[
                            { value: "ltr", label: "Left to right", icon: "arrow_forward" },
                            { value: "rtl", label: "Right to left", icon: "arrow_back" },
                          ]}
                          onChange={(v: string) => props.patchEffect({ reverse: v === "rtl" })}
                        />
                      </Field>
                    </>
                  )}
                </Match>

                <Match when={as("reactive")}>
                  {(r) => (
                    <>
                      <ColorField value={r().color} onChange={(c) => props.patchEffect({ color: c })} />
                      <Field label="Reacts to">
                        <SegmentedButton
                          label="Reacts to"
                          value={r().trigger}
                          options={TRIGGERS}
                          onChange={(v: string) => props.patchEffect({ trigger: v })}
                        />
                      </Field>
                      <SliderField
                        label="Fade time"
                        min={100}
                        max={2000}
                        step={50}
                        value={r().fadeMs}
                        display={`${r().fadeMs} ms`}
                        onInput={(v) => props.patchEffect({ fadeMs: v })}
                      />
                    </>
                  )}
                </Match>

                <Match when={as("ripple")}>
                  {(r) => (
                    <>
                      <ColorField value={r().color} onChange={(c) => props.patchEffect({ color: c })} />
                      <Field label="Reacts to">
                        <SegmentedButton
                          label="Reacts to"
                          value={r().trigger}
                          options={TRIGGERS}
                          onChange={(v: string) => props.patchEffect({ trigger: v })}
                        />
                      </Field>
                      <SliderField
                        label="Speed"
                        min={4}
                        max={30}
                        step={1}
                        value={r().speed}
                        display={`${r().speed}`}
                        onInput={(v) => props.patchEffect({ speed: v })}
                      />
                      <SliderField
                        label="Ring width"
                        min={0.5}
                        max={3}
                        step={0.1}
                        value={r().width}
                        display={r().width.toFixed(1)}
                        onInput={(v) => props.patchEffect({ width: v })}
                      />
                    </>
                  )}
                </Match>

                <Match when={as("starlight")}>
                  {(s) => (
                    <>
                      <ColorField value={s().color} onChange={(c) => props.patchEffect({ color: c })} />
                      <SliderField
                        label="Density"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={s().density}
                        display={`${Math.round(s().density * 100)}%`}
                        onInput={(v) => props.patchEffect({ density: v })}
                      />
                      <SliderField
                        label="Twinkle length"
                        min={200}
                        max={3000}
                        step={100}
                        value={s().fadeMs}
                        display={`${s().fadeMs} ms`}
                        onInput={(v) => props.patchEffect({ fadeMs: v })}
                      />
                    </>
                  )}
                </Match>
              </Branch>
            </div>

            {/* blend + opacity */}
            <Divider />
            <div class="inspector-body">
              <h3 class="title-small">Mixing</h3>
              <Field
                label="Blend mode"
                hint={props.isBottom ? "The bottom layer draws over black" : BLENDS.find((b) => b.value === layer().blend)?.hint}
              >
                <div class="chips">
                  <For each={BLENDS}>
                    {(b) => (
                      <Chip
                        variant="filter"
                        label={b.label}
                        selected={layer().blend === b.value}
                        onClick={() => props.patchLayer({ blend: b.value })}
                      />
                    )}
                  </For>
                </div>
              </Field>
              <SliderField
                label="Opacity"
                min={0}
                max={1}
                step={0.01}
                value={layer().opacity}
                display={`${Math.round(layer().opacity * 100)}%`}
                onInput={(v) => props.patchLayer({ opacity: v })}
              />
            </div>
          </>
        )}
      </Show>
    </Card>
  );
}
