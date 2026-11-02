import { onCleanup, onMount, Show } from "solid-js";
import { api, DeviceCfg, DeviceStatus, Frame } from "../api";

const GAP = 4;

/**
 * Live preview of the composited stack. The frames come from the engine, the
 * same code that drives the hardware, so typing in the app shows reactive
 * layers too.
 */
export default function Preview(props: {
  device: DeviceCfg;
  index: number;
  status?: DeviceStatus;
  dark: boolean;
  fps: number;
  hooks: number;
}) {
  let canvas!: HTMLCanvasElement;
  let wrap!: HTMLDivElement;
  let frame: Frame | null = null;

  onMount(() => {
    const ctx = canvas.getContext("2d")!;
    let alive = true;
    let raf = 0;

    const poll = async () => {
      if (!alive) return;
      try {
        frame = await api.getPreview(props.index);
      } catch {
        frame = null;
      }
      setTimeout(poll, 33);
    };
    poll();

    const draw = () => {
      const rows = Math.max(1, props.device.rows);
      const cols = Math.max(1, props.device.cols);
      const avail = Math.max(120, wrap.clientWidth - 36);
      const cell = Math.max(10, Math.min(40, Math.floor((avail + GAP) / cols) - GAP));
      const w = cols * (cell + GAP) - GAP;
      const h = rows * (cell + GAP) - GAP;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      const k = props.dark ? 0 : props.device.brightness / 255;
      const ok = frame && frame.rows === rows && frame.cols === cols;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * (cell + GAP);
          const y = r * (cell + GAP);
          ctx.fillStyle = "#1b1b22";
          ctx.fillRect(x, y, cell, cell);
          if (!ok) continue;
          const i = (r * cols + c) * 3;
          const R = Math.round(frame!.rgb[i] * k);
          const G = Math.round(frame!.rgb[i + 1] * k);
          const B = Math.round(frame!.rgb[i + 2] * k);
          if (R + G + B > 0) {
            ctx.fillStyle = `rgb(${R},${G},${B})`;
            ctx.shadowColor = `rgba(${R},${G},${B},0.55)`;
            ctx.shadowBlur = 8;
            ctx.fillRect(x, y, cell, cell);
            ctx.shadowBlur = 0;
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    onCleanup(() => {
      alive = false;
      cancelAnimationFrame(raf);
    });
  });

  const mode = () => props.status?.mode ?? "stream";

  return (
    <section class="card preview-card">
      <div class="preview-badges">
        <span class={`badge ${mode()}`}>
          {mode() === "device" ? "On device · 0% CPU" : mode() === "off" ? "Off" : `Streaming · ${+props.fps.toFixed(2)} fps`}
        </span>
        <Show when={props.hooks !== 0}>
          <span class="badge listen" title="Global input hooks are installed only while a lit layer reacts to them">
            Listening for {props.hooks === 3 ? "keys + clicks" : props.hooks === 1 ? "keys" : "clicks"}
          </span>
        </Show>
        <Show when={props.dark}>
          <span class="badge">Idle — lights off</span>
        </Show>
      </div>
      <div class="preview-wrap" ref={wrap}>
        <canvas ref={canvas} class="preview" />
      </div>
    </section>
  );
}
