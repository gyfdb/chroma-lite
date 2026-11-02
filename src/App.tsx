import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { api, Config, DeviceCfg, EffectType, Found, hex, Layer, LayerEffect, newId, Status } from "./api";
import { meta } from "./effects";
import DeviceSettings from "./components/DeviceSettings";
import Inspector from "./components/Inspector";
import LayerStack from "./components/LayerStack";
import Preview from "./components/Preview";
import TitleBar from "./components/TitleBar";
import { Slider, Toggle } from "./components/ui";

const KEYBOARD_HINTS = /keyboard|blackwidow|huntsman|ornata|cynosa|deathstalker/i;

function newDevice(f: Found): DeviceCfg {
  const keyboard = KEYBOARD_HINTS.test(f.product);
  return {
    name: f.product,
    pid: f.pid,
    transactionId: f.transactionId ?? 0x1f,
    kind: keyboard ? "keyboard" : "mouse",
    rows: keyboard ? 6 : 1,
    cols: keyboard ? 22 : 1,
    leds: keyboard ? [0x05] : [0x00],
    brightness: 255,
    preferHardware: true,
    layers: [{ id: newId(), enabled: true, opacity: 1, blend: "normal", effect: meta("fire").make() }],
  };
}

const ADD_DEVICE = -1;

export default function App() {
  const [config, setConfig] = createStore<Config>({ enabled: true, idleTimeoutSecs: 300, fps: 24, devices: [] });
  const [loaded, setLoaded] = createSignal(false);
  const [status, setStatus] = createSignal<Status | null>(null);
  const [found, setFound] = createSignal<Found[] | null>(null);
  const [scanning, setScanning] = createSignal(false);
  const [save, setSave] = createSignal<"saved" | "saving" | "error">("saved");
  const [sel, setSel] = createSignal(0);
  const [layerSel, setLayerSel] = createSignal<string | null>(null);

  onMount(() => {
    api.getConfig().then((c) => {
      setConfig(reconcile(c));
      setLoaded(true);
      if (c.devices.length === 0) setSel(ADD_DEVICE);
    });
    const poll = () => api.getStatus().then(setStatus).catch(() => {});
    poll();
    const t = setInterval(poll, 1000);
    onCleanup(() => clearInterval(t));
  });

  // every edit applies live, debounced so dragging a slider doesn't flood the
  // engine (or the device's onboard memory)
  let timer: number | undefined;
  createEffect(
    on(
      () => JSON.stringify(config),
      (json) => {
        if (!loaded()) return;
        setSave("saving");
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          api
            .setConfig(JSON.parse(json))
            .then(() => setSave("saved"))
            .catch((e) => {
              console.error(e);
              setSave("error");
            });
        }, 300);
      },
      { defer: true },
    ),
  );

  // ─ Selection ───────────────────────────────────────────────────────────────
  const device = () => (sel() >= 0 ? config.devices[sel()] : undefined);
  const selectedLayer = (): Layer | null => {
    const d = device();
    if (!d) return null;
    return d.layers.find((l) => l.id === layerSel()) ?? d.layers[0] ?? null;
  };
  const devStatus = () => status()?.devices[sel()];

  // ─ Layer ops ; store paths typed loosely on purpose ────────────────────────
  const setLayers = (fn: (ls: Layer[]) => Layer[]) => setConfig("devices", sel(), "layers", fn);

  const addLayer = (t: EffectType) => {
    const m = meta(t);
    const layer: Layer = {
      id: newId(),
      enabled: true,
      opacity: 1,
      blend: (device()?.layers.length ?? 0) > 0 ? m.blend : "normal",
      effect: m.make(),
    };
    setLayers((ls) => [layer, ...ls]);
    setLayerSel(layer.id);
  };

  const removeLayer = (id: string) => {
    const ls = device()?.layers ?? [];
    const i = ls.findIndex((l) => l.id === id);
    setLayers((ls) => ls.filter((l) => l.id !== id));
    if (selectedLayer()?.id === id || layerSel() === id) {
      const next = ls[i + 1] ?? ls[i - 1];
      setLayerSel(next && next.id !== id ? next.id : null);
    }
  };

  const moveLayer = (from: number, to: number) =>
    setLayers((ls) => {
      const a = [...ls];
      const [x] = a.splice(from, 1);
      a.splice(to, 0, x);
      return a;
    });

  const patchLayer = (p: Partial<Layer>) => {
    const id = selectedLayer()?.id;
    if (id) (setConfig as any)("devices", sel(), "layers", (l: Layer) => l.id === id, p);
  };

  const patchEffect = (p: Record<string, unknown>) => {
    const id = selectedLayer()?.id;
    if (id)
      (setConfig as any)("devices", sel(), "layers", (l: Layer) => l.id === id, "effect", (e: LayerEffect) => ({
        ...e,
        ...p,
      }));
  };

  const toggleLayer = (id: string) =>
    (setConfig as any)("devices", sel(), "layers", (l: Layer) => l.id === id, "enabled", (v: boolean) => !v);

  const setDevice = <K extends keyof DeviceCfg>(key: K, value: DeviceCfg[K]) =>
    (setConfig as any)("devices", sel(), key, value);

  const removeDevice = () => {
    const i = sel();
    setConfig("devices", (ds) => ds.filter((_, j) => j !== i));
    setSel(config.devices.length ? 0 : ADD_DEVICE);
  };

  // ─ Scanner ─────────────────────────────────────────────────────────────────
  const scan = async () => {
    setScanning(true);
    try {
      setFound(await api.scanDevices());
    } catch (e) {
      console.error(e);
      setFound([]);
    } finally {
      setScanning(false);
    }
  };

  const statusLine = () => {
    const s = status();
    if (!s) return "Starting…";
    if (!config.enabled) return "Lighting off";
    if (s.dark) return "Idle — lights off";
    if (config.idleTimeoutSecs === 0) return "Active";
    const left = Math.max(0, config.idleTimeoutSecs - s.idleSecs);
    return left > 60 ? "Active" : `Active · dims in ${left}s`;
  };

  const onlyActive = () => {
    const d = device();
    const l = selectedLayer();
    if (!d || !l) return false;
    const active = d.layers.filter((x) => x.enabled && x.opacity > 0);
    return devStatus()?.mode === "device" && active.length === 1 && active[0].id === l.id;
  };

  return (
    <>
      <TitleBar>
        <span class={`pill ${status()?.dark ? "dark" : "live"}`}>{statusLine()}</span>
        <span class={`save ${save()}`}>
          {save() === "saving" ? "Saving…" : save() === "error" ? "Save failed" : "Saved"}
        </span>
        <Toggle checked={config.enabled} onChange={(v) => setConfig("enabled", v)} title="Master lighting switch" />
      </TitleBar>
      <div class="scroll">
      <main>

        <nav class="device-tabs">
          <For each={config.devices}>
            {(d, i) => (
              <button
                classList={{ "device-tab": true, active: sel() === i() }}
                onClick={() => {
                  setSel(i());
                  setLayerSel(null);
                }}
              >
                <span class={`dot ${status()?.devices[i()]?.connected ? "on" : ""}`} />
                {d.name}
              </button>
            )}
          </For>
          <button classList={{ "device-tab": true, add: true, active: sel() === ADD_DEVICE }} onClick={() => setSel(ADD_DEVICE)}>
            + Add device
          </button>
        </nav>

        <Show when={device()}>
          {(d) => (
            <div class="workspace">
              <div class="col-main">
                <Show when={devStatus()?.error}>
                  <div class="error">{devStatus()!.error}</div>
                </Show>
                <Show when={d()} keyed>
                  {(dev) => (
                    <Preview
                      device={dev}
                      index={sel()}
                      status={devStatus()}
                      dark={!!status()?.dark || !config.enabled}
                      fps={config.fps}
                      hooks={status()?.hooks ?? 0}
                    />
                  )}
                </Show>
                <LayerStack
                  layers={d().layers}
                  selectedId={selectedLayer()?.id ?? null}
                  onSelect={setLayerSel}
                  onToggle={toggleLayer}
                  onRemove={removeLayer}
                  onMove={moveLayer}
                  onAdd={addLayer}
                />
              </div>

              <aside class="col-side">
                <Inspector
                  layer={selectedLayer()}
                  isBottom={d().layers.length > 0 && d().layers[d().layers.length - 1].id === selectedLayer()?.id}
                  onDevice={onlyActive()}
                  patchLayer={patchLayer}
                  patchEffect={patchEffect}
                />
                <DeviceSettings device={d()} set={setDevice} onRemove={removeDevice} />
                <section class="card">
                  <h2>General</h2>
                  <Slider
                    label="Turn lights off after"
                    min={0}
                    max={60}
                    step={1}
                    value={Math.round(config.idleTimeoutSecs / 60)}
                    display={config.idleTimeoutSecs === 0 ? "never" : `${Math.round(config.idleTimeoutSecs / 60)} min`}
                    onInput={(v) => setConfig("idleTimeoutSecs", v * 60)}
                  />
                  <Slider
                    label="Frame rate"
                    hint="for streamed stacks"
                    min={0.1}
                    max={60}
                    step={0.1}
                    value={config.fps}
                    display={`${config.fps} fps`}
                    editable={{ unit: "fps", decimals: 2 }}
                    onInput={(v) => setConfig("fps", +v.toFixed(2))}
                  />
                </section>
              </aside>
            </div>
          )}
        </Show>

        <Show when={sel() === ADD_DEVICE}>
          <section class="card scan">
            <div class="scan-head">
              <div>
                <h2>Add a device</h2>
                <p class="hint">Close Synapse first; it holds the devices and fights over the lights.</p>
              </div>
              <button onClick={scan} disabled={scanning()}>
                {scanning() ? "Scanning…" : "Scan for devices"}
              </button>
            </div>
            <Show when={found()}>
              {(list) => (
                <Show when={list().length > 0} fallback={<p class="muted">No Razer devices found.</p>}>
                  <ul class="found">
                    <For each={list()}>
                      {(f) => {
                        const added = () => config.devices.some((d) => d.pid === f.pid);
                        return (
                          <li>
                            <div>
                              <strong>{f.product}</strong>
                              <span class="muted">
                                {" "}
                                · PID {hex(f.pid, 4)}
                                {f.transactionId != null
                                  ? ` · tid ${hex(f.transactionId)} · fw ${f.firmware}`
                                  : " · no lighting interface answered"}
                              </span>
                            </div>
                            <button
                              class="ghost"
                              disabled={added() || f.transactionId == null}
                              onClick={() => {
                                setConfig("devices", produce((ds) => ds.push(newDevice(f))));
                                setSel(config.devices.length - 1);
                              }}
                            >
                              {added() ? "Added" : "Add"}
                            </button>
                          </li>
                        );
                      }}
                    </For>
                  </ul>
                </Show>
              )}
            </Show>
          </section>
        </Show>

        <footer class="muted">Closing this window keeps Chroma Lite running in the tray.</footer>
      </main>
      </div>
    </>
  );
}
