import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { api, Config, DeviceCfg, EffectType, Found, hex, Layer, LayerEffect, newId, Status } from "./api";
import { meta } from "./effects";
import DeviceSettings from "./components/DeviceSettings";
import Inspector from "./components/Inspector";
import LayerStack from "./components/LayerStack";
import Preview from "./components/Preview";
import TitleBar from "./components/TitleBar";
import { Field, SliderField } from "./components/ui";
import { Button, Card, ExtendedFAB, FAB, Icon, IconButton, List, ListItem, NavigationRail, SegmentedButton, Snackbar, Switch } from "./aalto";
import { zoom, zoomIn, zoomOut, zoomReset } from "./zoom";
import { setTheme, theme, ThemePref } from "./theme";

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
const SETTINGS = -2;

const RAIL_KEY = "chroma-lite.rail-expanded";

const kindIcon = (k: DeviceCfg["kind"]) => (k === "keyboard" ? "keyboard" : k === "mouse" ? "mouse" : "devices_other");

/** "Razer BlackWidow V4 X" reads as "BlackWidow V4 X" in the rail. */
const shortName = (n: string) => n.replace(/^razer\s+/i, "");

export default function App() {
  const [config, setConfig] = createStore<Config>({ enabled: true, idleTimeoutSecs: 300, fps: 24, devices: [] });
  const [loaded, setLoaded] = createSignal(false);
  const [status, setStatus] = createSignal<Status | null>(null);
  const [found, setFound] = createSignal<Found[] | null>(null);
  const [scanning, setScanning] = createSignal(false);
  const [save, setSave] = createSignal<"saved" | "saving" | "error">("saved");
  const [sel, setSel] = createSignal(0);
  const [layerSel, setLayerSel] = createSignal<string | null>(null);
  const [railOpen, setRailOpen] = createSignal(
    (() => {
      try {
        return localStorage.getItem(RAIL_KEY) === "1";
      } catch {
        return false;
      }
    })(),
  );
  const toggleRail = (v: boolean) => {
    setRailOpen(v);
    try {
      localStorage.setItem(RAIL_KEY, v ? "1" : "0");
    } catch {
      // not remembered, that's fine
    }
  };

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
  const push = (json: string) =>
    api
      .setConfig(JSON.parse(json))
      .then(() => setSave("saved"))
      .catch((e) => {
        console.error(e);
        setSave("error");
      });
  createEffect(
    on(
      () => JSON.stringify(config),
      (json) => {
        if (!loaded()) return;
        setSave("saving");
        clearTimeout(timer);
        timer = window.setTimeout(() => push(json), 300);
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
    if (!s) return "Starting";
    if (!config.enabled) return "Lighting off";
    if (s.dark) return "Idle, lights off";
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

  // only devices live in the rail list; add and settings sit in the bottom section
  const railValue = () => (sel() >= 0 ? String(sel()) : "");
  const railItems = () => [
    ...config.devices.map((d, i) => ({
      value: String(i),
      label: shortName(d.name),
      icon: kindIcon(d.kind),
      // a dot on devices that aren't answering
      badge: status() && !status()!.devices[i]?.connected ? (true as const) : undefined,
    })),
  ];

  const pickRail = (v: string) => {
    setSel(v === "settings" ? SETTINGS : v === "add" ? ADD_DEVICE : +v);
    setLayerSel(null);
  };

  return (
    <div class="app">
      <TitleBar>
        <span class="tb-status label-medium" classList={{ "is-dark": !!status()?.dark || !config.enabled }}>
          <span class="dot" />
          {statusLine()}
        </span>
        <Show when={save() === "saving"}>
          <span class="label-small muted">Saving</span>
        </Show>
        <Switch checked={config.enabled} onChange={(v) => setConfig("enabled", v)} aria-label="Lighting on or off" />
      </TitleBar>

      <div class="body">
        <div class="sidebar" classList={{ "is-expanded": railOpen() }}>
          <NavigationRail
            items={railItems()}
            value={railValue()}
            onChange={pickRail}
            expanded={railOpen()}
            onExpandedChange={toggleRail}
            label="Devices"
          />
          <div class="sidebar-bottom">
            <Show
              when={railOpen()}
              fallback={
                <FAB
                  icon="add"
                  label="Add device"
                  color="tertiary-container"
                  class={sel() === ADD_DEVICE ? "is-current" : undefined}
                  onClick={() => pickRail("add")}
                />
              }
            >
              <ExtendedFAB
                icon="add"
                label="Add device"
                color="tertiary-container"
                class={sel() === ADD_DEVICE ? "is-current" : undefined}
                onClick={() => pickRail("add")}
              />
            </Show>
            <IconButton
              icon="settings"
              label="Settings"
              variant={sel() === SETTINGS ? "tonal" : "standard"}
              onClick={() => pickRail("settings")}
            />
          </div>
        </div>

        <div class="scroll">
          <main>
            <Show when={device()}>
              {(d) => (
                <>
                  <header class="page-head">
                    <div>
                      <h1 class="headline-medium">{d().name}</h1>
                      <p class="body-medium muted">
                        {devStatus()?.connected
                          ? `Connected${devStatus()?.firmware ? ` · firmware ${devStatus()!.firmware}` : ""}`
                          : "Not connected"}
                      </p>
                    </div>
                  </header>

                  <Show when={devStatus()?.error}>
                    <div class="banner" role="alert">
                      <Icon name="error" />
                      <span class="body-medium">{devStatus()!.error}</span>
                    </div>
                  </Show>

                  <div class="workspace">
                    <div class="col-main">
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
                      {/* keyed so the text fields start fresh for each device */}
                      <Show when={d()} keyed>
                        {(dev) => <DeviceSettings device={dev} set={setDevice} onRemove={removeDevice} />}
                      </Show>
                    </aside>
                  </div>
                </>
              )}
            </Show>

            <Show when={sel() === ADD_DEVICE}>
              <header class="page-head">
                <div>
                  <h1 class="headline-medium">Add a device</h1>
                  <p class="body-medium muted">Close Synapse first. It holds the devices and fights over the lights.</p>
                </div>
                <Button variant="filled" icon="search" onClick={scan} disabled={scanning()}>
                  {scanning() ? "Scanning" : "Scan for devices"}
                </Button>
              </header>
              <Show when={found()}>
                {(list) => (
                  <Card variant="outlined" class="section">
                    <Show
                      when={list().length > 0}
                      fallback={
                        <div class="empty">
                          <Icon name="search_off" size={32} />
                          <p class="body-large">No Razer devices found</p>
                          <p class="body-medium muted">Check the cable or receiver, then scan again.</p>
                        </div>
                      }
                    >
                      <List class="found">
                        <For each={list()}>
                          {(f) => {
                            const added = () => config.devices.some((d) => d.pid === f.pid);
                            return (
                              <ListItem
                                leading={KEYBOARD_HINTS.test(f.product) ? "keyboard" : "mouse"}
                                headline={f.product}
                                supporting={
                                  `PID ${hex(f.pid, 4)}` +
                                  (f.transactionId != null
                                    ? ` · tid ${hex(f.transactionId)} · firmware ${f.firmware}`
                                    : " · no lighting interface answered")
                                }
                                trailing={
                                  <Button
                                    variant="tonal"
                                    icon={added() ? "check" : undefined}
                                    disabled={added() || f.transactionId == null}
                                    onClick={() => {
                                      setConfig("devices", produce((ds) => ds.push(newDevice(f))));
                                      setSel(config.devices.length - 1);
                                    }}
                                  >
                                    {added() ? "Added" : "Add"}
                                  </Button>
                                }
                              />
                            );
                          }}
                        </For>
                      </List>
                    </Show>
                  </Card>
                )}
              </Show>
            </Show>

            <Show when={sel() === SETTINGS}>
              <header class="page-head">
                <div>
                  <h1 class="headline-medium">Settings</h1>
                  <p class="body-medium muted">These apply to every device.</p>
                </div>
              </header>
              <div class="settings">
                <Card variant="outlined" class="section">
                  <header class="section-head">
                    <h2 class="title-medium">Lighting</h2>
                  </header>
                  <div class="section-body">
                    <SliderField
                      label="Turn lights off after"
                      min={0}
                      max={60}
                      step={1}
                      value={Math.round(config.idleTimeoutSecs / 60)}
                      display={config.idleTimeoutSecs === 0 ? "Never" : `${Math.round(config.idleTimeoutSecs / 60)} min`}
                      onInput={(v) => setConfig("idleTimeoutSecs", v * 60)}
                    />
                    <SliderField
                      label="Frame rate"
                      hint="For streamed stacks"
                      min={0.1}
                      max={60}
                      step={0.1}
                      value={config.fps}
                      display={`${config.fps} fps`}
                      editable={{ unit: "fps", decimals: 2 }}
                      onInput={(v) => setConfig("fps", +v.toFixed(2))}
                    />
                  </div>
                </Card>
                <Card variant="outlined" class="section">
                  <header class="section-head">
                    <h2 class="title-medium">Appearance</h2>
                  </header>
                  <div class="section-body">
                    <Field label="Theme">
                      <SegmentedButton
                        label="Theme"
                        value={theme()}
                        onChange={(v: ThemePref) => setTheme(v)}
                        options={[
                          { value: "system", label: "System", icon: "brightness_auto" },
                          { value: "light", label: "Light", icon: "light_mode" },
                          { value: "dark", label: "Dark", icon: "dark_mode" },
                        ]}
                      />
                    </Field>
                    <Field label="Zoom" hint="Ctrl + and Ctrl −, Ctrl 0 to reset, or Ctrl + scroll">
                      <div class="zoom-row">
                        <IconButton icon="remove" label="Zoom out" variant="outlined" onClick={zoomOut} disabled={zoom() <= 0.5} />
                        <span class="title-medium zoom-value">{Math.round(zoom() * 100)}%</span>
                        <IconButton icon="add" label="Zoom in" variant="outlined" onClick={zoomIn} disabled={zoom() >= 2} />
                        <Button variant="text" onClick={zoomReset} disabled={zoom() === 1}>
                          Reset
                        </Button>
                      </div>
                    </Field>
                  </div>
                </Card>
                <p class="body-small muted footnote">Closing this window keeps Chroma Lite running in the tray.</p>
              </div>
            </Show>
          </main>
        </div>
      </div>

      <Show when={save() === "error"}>
        <div class="snack-host">
          <Snackbar
            message="Couldn't save your changes"
            action="Retry"
            onAction={() => {
              setSave("saving");
              push(JSON.stringify(config));
            }}
          />
        </div>
      </Show>
    </div>
  );
}
