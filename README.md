# Chroma Lite

I wanted my Razer keyboard and mouse to look good without Synapse running in the background all the time, so I made my own. Chroma Lite talks to the devices directly over USB HID and sits in the system tray. It does the one job I actually need: light the gear up while I'm using the PC, and turn it off when I'm not.

Built with Tauri 2, Rust, Solid, TypeScript and Vite. Windows for now.

> Not affiliated with or endorsed by Razer. It uses the same USB lighting commands that OpenRazer and OpenRGB do.

## Effects

Each device has a stack of layers, composited top over bottom:

| Effect | What it does |
|---|---|
| **Fire** | Heat simulation with 4 built-in palettes or your own 5-stop gradient, flame height, intensity, and an optional flare where you type |
| **Solid / Breathing / Spectrum / Wave** | The classic ambient effects |
| **Starlight** | Random keys twinkle |
| **Reactive** | Pressed keys (or clicks) light up and fade |
| **Ripple** | Rings spread out from each key press or click |

- **Add effect ▾** adds a layer from the menu.
- Drag a layer to reorder it (Alt+↑/↓ works too, Delete removes the focused one). Click a layer to edit it in the inspector on the right.
- Every layer has a blend mode (Normal, Add, Screen, Lighten, Multiply) and an opacity. Ripple on Screen at 80% over Fire gives rings that push through the flames; Reactive on Add over anything gives key-press flashes.
- The eye icon hides a layer without deleting it.

## Keeping it light

The engine picks the cheapest way to drive each device:

| Stack | How it runs |
|---|---|
| Nothing enabled | Lights off |
| One Solid / Breathing / Spectrum / Wave layer | Runs on the device itself, 0% CPU, nothing streamed. You can turn this off under Device → "Let the device run simple effects". |
| Anything else | Composited in the app and streamed at your frame rate (0.1–60 fps, decimals allowed). Frames that didn't change aren't re-sent, and a stack that doesn't animate on its own (like Solid + Reactive) sleeps until you press a key. |
| Idle / lights off | Everything stops |

**Input hooks:** reactive layers need global key and click events. On Windows those come from low-level hooks, which are only installed while a lit, streamed layer actually reacts to them, and removed otherwise, including while idle. The preview shows a "Listening for keys" badge whenever a hook is active. Keys are turned straight into an LED position; nothing is stored or logged. The mouse hook is only installed when a layer reacts to clicks, since it runs on every mouse movement.

> Some anti-cheat systems don't like input hooks. If a game complains, turn off or hide the reactive layers and the hook goes away immediately.

## Running it

Quit Synapse first (and ideally take it out of startup), otherwise the two fight over the lights.

```
bun install
bun tauri dev
```

The project uses Bun (`tauri.conf.json` runs `bun run dev` / `bun run build`). For npm, change those two commands and use `npm install` / `npm run tauri dev`.

### Releases

Pushing a tag like `v0.1.0` (matching `version` in `tauri.conf.json`) runs `.github/workflows/release.yml`, which builds for Windows, macOS (Apple Silicon and Intel) and Linux and puts everything in a draft GitHub release. Look it over, then publish it. You can also start it by hand from the Actions tab.

```
git tag v0.1.0
git push origin v0.1.0
```

The builds aren't code-signed, so Windows SmartScreen and macOS Gatekeeper will warn on first launch. Idle-off and the reactive effects are Windows-only for now; on macOS and Linux the lights stay on and reactive layers don't react.

On Linux the `.deb` and `.rpm` install a udev rule so the app can reach the Razer devices without root. For the AppImage, add it yourself:

```
sudo cp src-tauri/linux/70-chroma-lite.rules /etc/udev/rules.d/
sudo udevadm control --reload && sudo udevadm trigger
```

### Release build

```
bun run release      # tauri build → src-tauri/target/release/bundle/nsis/*-setup.exe
```

What's tuned for release:

| Where | Setting | Why |
|---|---|---|
| `Cargo.toml` | `opt-level = "s"`, fat LTO, `codegen-units = 1`, `strip`, `panic = "abort"` | Small binary; the app spends its time sleeping or on USB, not doing heavy CPU work |
| `tauri.conf.json` | `build.removeUnusedCommands` + a minimal capability | Only the window and zoom calls the title bar needs are allowed, so the rest of Tauri's JS APIs get compiled out |
| `tauri.conf.json` | NSIS only, per-user install | One small installer, no admin prompt, faster than also building an MSI |
| `vite.config.ts` | `chrome111` / `safari16.2` target, no sourcemaps, no preload polyfill | It only runs in WebView2 / WebKitGTK |

On Linux this took the binary from 4.74 MB to 2.59 MB. `opt-level = "z"` only saves about another 4% and makes the code slower, so it stays on `"s"`.

With `panic = "abort"`, a panic closes the whole tray app instead of quietly killing the lighting thread. `removeUnusedCommands` only applies when building through the Tauri CLI; a plain `cargo build --release` skips it.

## First-time setup

1. **+ Add device → Scan for devices** lists every Razer device, the transaction id it answers to, and its firmware. Click **Add**, or fix the PID / transaction id on the preset tabs under **Device → Advanced**.
2. **Matrix rows/columns:** the keyboard preset is 6×22, with column 0 for the macro keys. If the fire looks shifted, or reactive keys light up one spot off, adjust these. The Cobra preset is 1×1; raise the columns if your mouse has more addressable LEDs.
3. **LED zone ids** are used for brightness and on-device effects. 0x05 is the keyboard backlight; mice vary (0x00, 0x01 scroll wheel, 0x04 logo, 0x0A underglow…).

The key → LED map is `keymap` in `src-tauri/src/input.rs`. It assumes a full-size ANSI layout, so tweak it if a key lights up the wrong spot.

## The window

- Custom title bar: drag it to move, double-click to maximize, and − □ ✕ on the right. ✕ closes to the tray.
- Works at any size; the layout reflows down to phone width.
- Zoom with **Ctrl +/−/0** or **Ctrl + mouse wheel**, or click the % in the title bar to reset. It remembers the level.
- No right-click menu and no text selection, except in text fields. `bun tauri dev` keeps the right-click menu so you can still Inspect.

## In the background

- Closing the window destroys the webview so it isn't holding memory. The app keeps running in the tray: left-click the tray icon to reopen, right-click → Quit.
- Launch with `--tray` to start hidden, e.g. from a startup shortcut.
- On quit, streamed stacks get frozen into a static color so the gear isn't stuck on a random frame.

Settings are saved to `%APPDATA%\com.barkafterbark.chromalite\config.json`.

## Theme

Every color, radius, spacing step, font size, size and duration lives in `src/tokens.css` as a CSS custom property. `src/styles.css` and the components only use those. To retheme, edit the base palette (`--ink-*`, `--ember-*`); the tints are `color-mix()`ed from it, so they follow along.

## Project layout

```
src/
  App.tsx                  device tabs, workspace, layer ops, live save
  effects.ts               effect catalog: labels, defaults, summaries
  tokens.css               design tokens
  styles.css               all styling, tokens only
  zoom.ts                  webview zoom + shortcuts
  components/
    TitleBar.tsx           custom window chrome
    LayerStack.tsx         sortable layer boxes
    AddEffectMenu.tsx      "Add effect" dropdown
    EffectIcon.tsx         SVG icon per effect
    Inspector.tsx          settings for the selected layer
    Preview.tsx            live preview (frames come from the engine)
    DeviceSettings.tsx     brightness, hardware preference, advanced
src-tauri/src/
  razer.rs                 Razer HID protocol (90-byte feature reports)
  layers.rs                effect renderers + blend modes
  engine.rs                lighting thread: plan, composite, stream, idle
  input.rs                 on-demand Win32 hooks + key → LED map
  config.rs                settings model (layers, plans)
  idle.rs                  GetLastInputInfo
  lib.rs                   Tauri commands, tray, window lifecycle
```

## License

MIT, see [LICENSE](LICENSE).
