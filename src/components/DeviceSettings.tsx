import { createSignal, Show } from "solid-js";
import { DeviceCfg, hex } from "../api";
import { Button, Card, Dialog, TextField } from "../aalto";
import { SliderField, SwitchRow } from "./ui";

export default function DeviceSettings(props: {
  device: DeviceCfg;
  set: <K extends keyof DeviceCfg>(key: K, value: DeviceCfg[K]) => void;
  onRemove: () => void;
}) {
  const [advanced, setAdvanced] = createSignal(false);
  const [confirming, setConfirming] = createSignal(false);

  const parseLeds = (s: string) =>
    s
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((x) => parseInt(x, x.toLowerCase().startsWith("0x") ? 16 : 10))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n < 256);

  const parseHex = (s: string) => parseInt(s.trim().replace(/^0x/i, ""), 16);

  return (
    <Card variant="outlined" class="section">
      <header class="section-head">
        <h2 class="title-medium">Device</h2>
      </header>
      <div class="section-body">
        <SliderField
          label="Brightness"
          min={0}
          max={255}
          step={1}
          value={props.device.brightness}
          display={`${Math.round((props.device.brightness / 255) * 100)}%`}
          onInput={(v) => props.set("brightness", Math.round(v))}
        />
        <SwitchRow
          label="Let the device run simple effects"
          hint="A single Solid, Breathing, Spectrum or Wave layer then uses 0% CPU"
          checked={props.device.preferHardware}
          onChange={(v) => props.set("preferHardware", v)}
        />

        <Button
          variant="text"
          class="disclosure"
          trailingIcon={advanced() ? "expand_less" : "expand_more"}
          aria-expanded={advanced()}
          onClick={() => setAdvanced(!advanced())}
        >
          Advanced
        </Button>

        <Show when={advanced()}>
          {/* uncontrolled on purpose: edits apply as you type, and the box keeps
              what you typed instead of reformatting it mid-edit */}
          <div class="grid">
            <TextField
              variant="outlined"
              label="Name"
              defaultValue={props.device.name}
              onChange={(v) => v.trim() && props.set("name", v.trim())}
            />
            <TextField
              variant="outlined"
              label="PID (hex)"
              defaultValue={hex(props.device.pid, 4)}
              onChange={(v) => {
                const n = parseHex(v);
                if (!Number.isNaN(n)) props.set("pid", n);
              }}
            />
            <TextField
              variant="outlined"
              label="Transaction ID"
              defaultValue={hex(props.device.transactionId)}
              onChange={(v) => {
                const n = parseHex(v);
                if (!Number.isNaN(n)) props.set("transactionId", n & 255);
              }}
            />
            <TextField
              variant="outlined"
              label="LED zone ids"
              defaultValue={props.device.leds.map((l) => hex(l)).join(", ")}
              onChange={(v) => props.set("leds", parseLeds(v))}
            />
            <TextField
              variant="outlined"
              label="Matrix rows"
              type="number"
              supporting="1 to 12"
              defaultValue={String(props.device.rows)}
              onChange={(v) => +v > 0 && props.set("rows", Math.min(12, Math.round(+v)))}
            />
            <TextField
              variant="outlined"
              label="Matrix columns"
              type="number"
              supporting="1 to 25"
              defaultValue={String(props.device.cols)}
              onChange={(v) => +v > 0 && props.set("cols", Math.min(25, Math.round(+v)))}
            />
          </div>
          <Button variant="outlined" icon="delete" class="danger" onClick={() => setConfirming(true)}>
            Remove this device
          </Button>
        </Show>
      </div>

      <Dialog
        open={confirming()}
        onClose={() => setConfirming(false)}
        icon="delete"
        headline={`Remove ${props.device.name}?`}
        actions={
          <>
            <Button variant="text" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="text"
              onClick={() => {
                setConfirming(false);
                props.onRemove();
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        Its layers and settings are deleted. You can add it again with a scan.
      </Dialog>
    </Card>
  );
}
