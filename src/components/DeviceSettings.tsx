import { DeviceCfg, hex } from "../api";
import { Field, Slider, Toggle } from "./ui";

export default function DeviceSettings(props: {
  device: DeviceCfg;
  set: <K extends keyof DeviceCfg>(key: K, value: DeviceCfg[K]) => void;
  onRemove: () => void;
}) {
  const parseLeds = (s: string) =>
    s
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((x) => parseInt(x, x.toLowerCase().startsWith("0x") ? 16 : 10))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n < 256);

  return (
    <section class="card">
      <h2>Device</h2>
      <Slider
        label="Brightness"
        min={0}
        max={255}
        step={1}
        value={props.device.brightness}
        display={`${Math.round((props.device.brightness / 255) * 100)}%`}
        onInput={(v) => props.set("brightness", Math.round(v))}
      />
      <div class="row-between">
        <span class="label">
          Let the device run simple effects
          <span class="muted"> — single Solid/Breathing/Spectrum/Wave layer uses 0% CPU</span>
        </span>
        <Toggle checked={props.device.preferHardware} onChange={(v) => props.set("preferHardware", v)} />
      </div>

      <details class="advanced">
        <summary>Advanced</summary>
        <div class="grid">
          <Field label="Name">
            <input value={props.device.name} onChange={(e) => props.set("name", e.currentTarget.value)} />
          </Field>
          <Field label="PID (hex)">
            <input
              value={hex(props.device.pid, 4)}
              onChange={(e) => {
                const n = parseInt(e.currentTarget.value, 16);
                if (!Number.isNaN(n)) props.set("pid", n);
              }}
            />
          </Field>
          <Field label="Transaction ID">
            <input
              value={hex(props.device.transactionId)}
              onChange={(e) => {
                const n = parseInt(e.currentTarget.value, 16);
                if (!Number.isNaN(n)) props.set("transactionId", n & 255);
              }}
            />
          </Field>
          <Field label="LED zone ids">
            <input
              value={props.device.leds.map((l) => hex(l)).join(", ")}
              onChange={(e) => props.set("leds", parseLeds(e.currentTarget.value))}
            />
          </Field>
          <Field label="Matrix rows">
            <input
              type="number"
              min="1"
              max="12"
              value={props.device.rows}
              onChange={(e) => props.set("rows", Math.max(1, Math.min(12, +e.currentTarget.value || 1)))}
            />
          </Field>
          <Field label="Matrix columns">
            <input
              type="number"
              min="1"
              max="25"
              value={props.device.cols}
              onChange={(e) => props.set("cols", Math.max(1, Math.min(25, +e.currentTarget.value || 1)))}
            />
          </Field>
        </div>
        <button class="ghost danger-text" onClick={props.onRemove}>
          Remove this device
        </button>
      </details>
    </section>
  );
}
