import { For, Match, Show, Switch } from "solid-js";
import { Blend, BuiltinPalette, hexToRgb, Layer, LayerEffect, Rgb, rgbToHex } from "../api";
import { BLENDS, gradient, meta, PALETTES, TRIGGERS } from "../effects";

const STOP_LABELS = ["Coolest", "Embers", "Flame", "Bright", "Hottest"];
import EffectIcon from "./EffectIcon";
import { ColorField, Field, Segmented, Slider, Toggle } from "./ui";

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
    <section class="card inspector">
      <Show
        when={props.layer}
        fallback={
          <div class="inspector-empty">
            <p>Select a layer to configure it.</p>
          </div>
        }
      >
        {(layer) => (
          <>
            <header class="inspector-head">
              <span class="icon-tile big">
                <EffectIcon type={layer().effect.type} size={28} />
              </span>
              <div>
                <h2>{meta(layer().effect.type).label}</h2>
                <p class="hint">{meta(layer().effect.type).blurb}</p>
              </div>
              <Toggle
                checked={layer().enabled}
                onChange={(v) => props.patchLayer({ enabled: v })}
                title="Layer on/off"
              />
            </header>

            <Show when={props.onDevice}>
              <div class="note">
                Running on the device itself (0% CPU). It uses its own built-in speed, so the timing sliders only
                matter once this is stacked with other layers.
              </div>
            </Show>

            {/* effect settings */}
            <div class="inspector-body">
              <Switch>
                <Match when={as("fire")}>
                  {(f) => (
                    <>
                      <Field label="Palette">
                        <div class="palettes">
                          <For each={Object.keys(PALETTES) as BuiltinPalette[]}>
                            {(p) => (
                              <button
                                classList={{ swatch: true, active: f().palette === p }}
                                style={{ background: gradient(PALETTES[p].stops) }}
                                onClick={() => props.patchEffect({ palette: p })}
                              >
                                <span>{PALETTES[p].label}</span>
                              </button>
                            )}
                          </For>
                          <button
                            classList={{ swatch: true, custom: true, active: f().palette === "custom" }}
                            style={{ background: gradient(f().custom) }}
                            onClick={() => props.patchEffect({ palette: "custom" })}
                          >
                            <span>✎ Custom</span>
                          </button>
                        </div>
                      </Field>
                      <Show when={f().palette === "custom"}>
                        <div class="custom-palette">
                          <div class="gradient-bar" style={{ background: gradient(f().custom) }} />
                          <div class="stops">
                            <For each={f().custom}>
                              {(stop, i) => (
                                <label class="stop">
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
                            <span class="muted">Start from</span>
                            <For each={Object.keys(PALETTES) as BuiltinPalette[]}>
                              {(p) => (
                                <button
                                  class="mini-swatch"
                                  title={`Copy ${PALETTES[p].label}`}
                                  style={{ background: gradient(PALETTES[p].stops) }}
                                  onClick={() => props.patchEffect({ custom: PALETTES[p].stops.map((s) => [...s] as Rgb) })}
                                />
                              )}
                            </For>
                          </div>
                          <p class="hint">Heat maps left to right: the leftmost color is the cold top of the flames, the rightmost is the hot core.</p>
                        </div>
                      </Show>
                      <Slider
                        label="Flame height"
                        min={0.05}
                        max={0.6}
                        step={0.01}
                        value={0.65 - f().cooling}
                        display={`${Math.round(((0.6 - f().cooling) / 0.55) * 100)}%`}
                        onInput={(v) => props.patchEffect({ cooling: +(0.65 - v).toFixed(3) })}
                      />
                      <Slider
                        label="Intensity"
                        min={0.1}
                        max={1}
                        step={0.01}
                        value={f().sparks}
                        display={`${Math.round(f().sparks * 100)}%`}
                        onInput={(v) => props.patchEffect({ sparks: v })}
                      />
                      <div class="row-between">
                        <span class="label">Flare up where I type</span>
                        <Toggle checked={f().reactToKeys} onChange={(v) => props.patchEffect({ reactToKeys: v })} />
                      </div>
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
                      <Slider
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
                    <Slider
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
                      <Slider
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
                        <Segmented
                          value={w().reverse ? "rtl" : "ltr"}
                          options={[
                            { value: "ltr", label: "Left → right" },
                            { value: "rtl", label: "Right → left" },
                          ]}
                          onChange={(v) => props.patchEffect({ reverse: v === "rtl" })}
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
                        <Segmented value={r().trigger} options={TRIGGERS} onChange={(v) => props.patchEffect({ trigger: v })} />
                      </Field>
                      <Slider
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
                        <Segmented value={r().trigger} options={TRIGGERS} onChange={(v) => props.patchEffect({ trigger: v })} />
                      </Field>
                      <Slider
                        label="Speed"
                        min={4}
                        max={30}
                        step={1}
                        value={r().speed}
                        display={`${r().speed}`}
                        onInput={(v) => props.patchEffect({ speed: v })}
                      />
                      <Slider
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
                      <Slider
                        label="Density"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={s().density}
                        display={`${Math.round(s().density * 100)}%`}
                        onInput={(v) => props.patchEffect({ density: v })}
                      />
                      <Slider
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
              </Switch>
            </div>

            {/* blend + opacity */}
            <div class="inspector-section">
              <h3>Mixing</h3>
              <Field
                label="Blend mode"
                hint={props.isBottom ? "bottom layer draws over black" : BLENDS.find((b) => b.value === layer().blend)?.hint}
              >
                <select value={layer().blend} onChange={(e) => props.patchLayer({ blend: e.currentTarget.value as Blend })}>
                  <For each={BLENDS}>{(b) => <option value={b.value}>{b.label}</option>}</For>
                </select>
              </Field>
              <Slider
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
    </section>
  );
}
