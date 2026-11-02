//! The lighting thread. It owns the USB handles; the UI only ever edits `Shared`.
//!
//! Each device's layer stack turns into one of three plans (see config::Plan):
//!   * Off    — nothing enabled, brightness 0.
//!   * Device — one simple layer the device animates by itself. No frames get
//!              sent, and the thread sleeps ~1s between idle checks.
//!   * Stream — layers are composited here and streamed at `fps`. Frames that
//!              didn't change aren't re-sent, and if nothing on the stack
//!              animates by itself (like Solid + Reactive), the thread sleeps
//!              until input wakes it up.
//!
//! While the lights are dark everything stops, input hooks included.

use crate::{
    config::{Config, DeviceCfg, Kind, LayerEffect, Plan},
    idle, input,
    input::InputEvent,
    layers::{self, Ctx, Hit, Rgba, Source, State},
    razer::{self, Razer},
};
use hidapi::HidApi;
use serde::Serialize;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering::SeqCst},
        Arc, Mutex, OnceLock,
    },
    thread::{self, Thread},
    time::{Duration, Instant},
};

// ─ Status ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStatus {
    pub name: String,
    pub connected: bool,
    pub firmware: Option<String>,
    pub error: Option<String>,
    /// "off" | "device" | "stream"
    pub mode: &'static str,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub dark: bool,
    pub idle_secs: u64,
    pub hooks: u32,
    pub devices: Vec<DeviceStatus>,
}

#[derive(Serialize, Clone)]
pub struct Frame {
    pub rows: u8,
    pub cols: u8,
    pub rgb: Vec<u8>,
}

// ─ Shared state ──────────────────────────────────────────────────────────────

pub struct Shared {
    pub path: PathBuf,
    pub config: Mutex<Config>,
    version: AtomicU64,
    pub status: Mutex<Status>,
    pub previews: Mutex<Vec<Option<Frame>>>,
    /// Previews only render while the UI keeps asking for them.
    preview_until: Mutex<Option<Instant>>,
    events: Mutex<Vec<InputEvent>>,
    quit: AtomicBool,
    stopped: AtomicBool,
    thread: OnceLock<Thread>,
}

impl Shared {
    pub fn new(config: Config, path: PathBuf) -> Self {
        Self {
            path,
            config: Mutex::new(config),
            version: AtomicU64::new(0),
            status: Mutex::new(Status::default()),
            previews: Mutex::new(Vec::new()),
            preview_until: Mutex::new(None),
            events: Mutex::new(Vec::new()),
            quit: AtomicBool::new(false),
            stopped: AtomicBool::new(false),
            thread: OnceLock::new(),
        }
    }

    pub fn update(&self, cfg: Config) {
        *self.config.lock().unwrap() = cfg;
        self.version.fetch_add(1, SeqCst);
        self.wake();
    }

    pub fn push_input(&self, ev: InputEvent) {
        if let Ok(mut q) = self.events.lock() {
            if q.len() < 256 {
                q.push(ev);
            }
        }
        self.wake();
    }

    pub fn want_preview(&self) {
        let first = {
            let mut p = self.preview_until.lock().unwrap();
            let first = p.map_or(true, |t| t < Instant::now());
            *p = Some(Instant::now() + Duration::from_millis(1500));
            first
        };
        if first {
            self.wake();
        }
    }

    fn previewing(&self) -> bool {
        self.preview_until.lock().unwrap().is_some_and(|t| t > Instant::now())
    }

    fn wake(&self) {
        if let Some(t) = self.thread.get() {
            t.unpark();
        }
    }

    /// Leaves the devices in a sensible state and stops. Blocks for up to `timeout`.
    pub fn shutdown(&self, timeout: Duration) {
        self.quit.store(true, SeqCst);
        self.wake();
        let start = Instant::now();
        while !self.stopped.load(SeqCst) && start.elapsed() < timeout {
            thread::sleep(Duration::from_millis(10));
        }
    }
}

pub fn spawn(shared: Arc<Shared>) {
    let s = shared.clone();
    let handle = thread::Builder::new()
        .name("lighting".into())
        .spawn(move || run(s))
        .expect("failed to start lighting thread");
    let _ = shared.thread.set(handle.thread().clone());
}

// ─ Per-device slots ──────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq)]
enum Power {
    On,
    Dark,
}

struct Slot {
    cfg: DeviceCfg,
    plan: Plan,
    dev: Option<Razer>,
    firmware: Option<String>,
    error: Option<String>,
    applied_version: Option<u64>,
    power: Option<Power>,
    /// Last on-device effect written, so the flash isn't rewritten for nothing.
    hw_applied: Option<LayerEffect>,
    persisted_brightness: Option<u8>,
    states: HashMap<String, State>,
    last_sent: Option<Vec<u8>>,
    last_render: Option<Instant>,
    /// From the last composite: does the stack change without input?
    animating: bool,
    scratch: Vec<Rgba>,
}

impl Slot {
    fn new(cfg: DeviceCfg) -> Self {
        Self {
            plan: cfg.plan(),
            cfg,
            dev: None,
            firmware: None,
            error: None,
            applied_version: None,
            power: None,
            hw_applied: None,
            persisted_brightness: None,
            states: HashMap::new(),
            last_sent: None,
            last_render: None,
            animating: false,
            scratch: Vec::new(),
        }
    }

    fn dims(&self) -> (usize, usize) {
        (self.cfg.rows.max(1) as usize, self.cfg.cols.max(1) as usize)
    }

    /// Turns global input into hits on this device's matrix.
    fn hits(&self, events: &[InputEvent]) -> Vec<Hit> {
        let (rows, cols) = self.dims();
        events
            .iter()
            .filter_map(|ev| match (ev, self.cfg.kind) {
                (InputEvent::Key { row, col }, Kind::Keyboard) => Some(Hit {
                    source: Source::Key,
                    pos: Some((
                        (*row as usize).min(rows - 1) as f32,
                        (*col as usize).min(cols - 1) as f32,
                    )),
                }),
                (InputEvent::OtherKey, Kind::Keyboard) => None,
                (InputEvent::Key { .. } | InputEvent::OtherKey, _) => Some(Hit { source: Source::Key, pos: None }),
                (InputEvent::Click, _) => Some(Hit { source: Source::Click, pos: None }),
            })
            .collect()
    }

    /// Composites the stack. Returns (rgb bytes, keeps animating by itself).
    fn composite(&mut self, t: f32, hits: &[Hit]) -> (Vec<u8>, bool) {
        let (rows, cols) = self.dims();
        let now = Instant::now();
        let dt = self
            .last_render
            .map_or(1.0 / 30.0, |p| now.duration_since(p).as_secs_f32())
            .clamp(0.001, 10.0);
        self.last_render = Some(now);

        let ctx = Ctx { t, dt, rows, cols, hits };
        let mut dst = vec![[0.0f32; 3]; rows * cols];
        self.scratch.resize(rows * cols, [0.0; 4]);
        let mut animating = false;

        // stored top-first, painted bottom-up
        for layer in self.cfg.layers.iter().rev().filter(|l| l.enabled && l.opacity > 0.0) {
            let state = self
                .states
                .entry(layer.id.clone())
                .or_insert_with(|| State::new(&layer.effect, rows, cols));
            if !state.fits(&layer.effect, rows, cols) {
                *state = State::new(&layer.effect, rows, cols);
            }
            animating |= layers::render(&layer.effect, state, &ctx, &mut self.scratch);
            for (d, s) in dst.iter_mut().zip(self.scratch.iter()) {
                *d = layers::blend(*d, *s, layer.blend, layer.opacity.clamp(0.0, 1.0));
            }
        }

        let rgb = dst
            .iter()
            .flat_map(|p| p.map(|v| v.round().clamp(0.0, 255.0) as u8))
            .collect();
        (rgb, animating)
    }

    /// Returns (wants frame-rate ticks, preview frame).
    fn tick(
        &mut self,
        version: u64,
        want: Power,
        t: f32,
        hits: &[Hit],
        preview: bool,
        due: bool,
    ) -> Result<(bool, Option<Frame>), razer::Error> {
        if self.applied_version != Some(version) {
            // mark it first, so a rejected command isn't retried every tick
            self.applied_version = Some(version);
            self.power = None;
            self.last_sent = None;
            self.plan = self.cfg.plan();
            let ids: Vec<&str> = self.cfg.layers.iter().map(|l| l.id.as_str()).collect();
            self.states.retain(|id, _| ids.contains(&id.as_str()));

            if let Some(dev) = &self.dev {
                match &self.plan {
                    Plan::Device(effect) => {
                        if self.hw_applied.as_ref() != Some(effect) {
                            apply_hardware(dev, &self.cfg.leds, effect)?;
                            self.hw_applied = Some(effect.clone());
                        }
                    }
                    Plan::Stream => {
                        dev.show_custom()?;
                        self.hw_applied = None;
                    }
                    Plan::Off => {}
                }
                if self.plan != Plan::Off && self.persisted_brightness != Some(self.cfg.brightness) {
                    for &led in &self.cfg.leds {
                        dev.set_brightness(led, self.cfg.brightness, true)?;
                    }
                    self.persisted_brightness = Some(self.cfg.brightness);
                }
            }
        }

        let power = if self.plan == Plan::Off { Power::Dark } else { want };
        if let Some(dev) = &self.dev {
            if self.power != Some(power) {
                self.power = Some(power);
                let level = if power == Power::On { self.cfg.brightness } else { 0 };
                for &led in &self.cfg.leds {
                    dev.set_brightness(led, level, false)?;
                }
                if power == Power::On && self.plan == Plan::Stream {
                    // coming back from dark, make sure custom mode is live
                    dev.show_custom()?;
                }
                self.last_sent = None;
            }
        }

        let streaming = self.dev.is_some() && self.plan == Plan::Stream && power == Power::On;
        if !streaming && !preview {
            self.last_render = None;
            self.animating = false;
            return Ok((false, None));
        }
        if !due {
            // between frames, keep showing the last one
            return Ok((self.animating || preview, None));
        }

        let (rgb, animating) = self.composite(t, hits);
        self.animating = animating;

        if streaming && self.last_sent.as_deref() != Some(rgb.as_slice()) {
            let dev = self.dev.as_ref().unwrap();
            let row_len = self.dims().1 * 3;
            for (r, row) in rgb.chunks(row_len).enumerate() {
                dev.custom_row(r as u8, row)?;
            }
            dev.show_custom()?;
            self.last_sent = Some(rgb.clone());
        }

        let frame = preview.then(|| Frame { rows: self.cfg.rows.max(1), cols: self.cfg.cols.max(1), rgb });
        Ok((animating || preview, frame))
    }

    /// On quit, leaves something sensible on the device instead of a frozen
    /// frame or the idle-dark state.
    fn park(&self) {
        let Some(dev) = &self.dev else { return };
        if self.plan == Plan::Stream {
            let color = self
                .cfg
                .active_layers()
                .last()
                .map(|l| fallback_color(&l.effect))
                .unwrap_or([255, 80, 0]);
            for &led in &self.cfg.leds {
                let _ = dev.set_static(led, color);
            }
        }
        if self.plan != Plan::Off {
            for &led in &self.cfg.leds {
                let _ = dev.set_brightness(led, self.cfg.brightness, true);
            }
        }
    }
}

// ─ Helpers ───────────────────────────────────────────────────────────────────

fn fallback_color(e: &LayerEffect) -> [u8; 3] {
    match e {
        LayerEffect::Fire { palette, custom, .. } => {
            layers::sample_stops(&layers::fire_stops(*palette, custom), 0.6).map(|v| v as u8)
        }
        LayerEffect::Solid { color }
        | LayerEffect::Breathing { color, .. }
        | LayerEffect::Reactive { color, .. }
        | LayerEffect::Ripple { color, .. }
        | LayerEffect::Starlight { color, .. } => *color,
        LayerEffect::Spectrum { .. } | LayerEffect::Wave { .. } => [255, 255, 255],
    }
}

fn apply_hardware(dev: &Razer, leds: &[u8], effect: &LayerEffect) -> Result<(), razer::Error> {
    for &led in leds {
        match effect {
            LayerEffect::Solid { color } => dev.set_static(led, *color)?,
            LayerEffect::Breathing { color, .. } => dev.set_breathing(led, *color)?,
            LayerEffect::Spectrum { .. } => dev.set_spectrum(led)?,
            LayerEffect::Wave { reverse, .. } => dev.set_wave(led, if *reverse { 2 } else { 1 })?,
            _ => {}
        }
    }
    Ok(())
}

// ─ Lighting loop ─────────────────────────────────────────────────────────────

fn run(shared: Arc<Shared>) {
    let mut api = match HidApi::new() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("hidapi init failed: {e}");
            shared.stopped.store(true, SeqCst);
            return;
        }
    };

    let start = Instant::now();
    let mut version = u64::MAX;
    let mut cfg = Config::default();
    let mut slots: Vec<Slot> = Vec::new();
    let mut last_scan: Option<Instant> = None;
    let mut hooks = 0u32;
    let mut next_frame = Instant::now();

    loop {
        if shared.quit.load(SeqCst) {
            input::set_needs(0);
            slots.iter().for_each(Slot::park);
            shared.stopped.store(true, SeqCst);
            return;
        }

        // pick up config edits, keeping open handles and effect state
        let v = shared.version.load(SeqCst);
        let changed = v != version;
        if changed {
            version = v;
            cfg = shared.config.lock().unwrap().clone();
            let mut old = std::mem::take(&mut slots);
            slots = cfg
                .devices
                .iter()
                .cloned()
                .map(|c| {
                    match old.iter().position(|o| o.cfg.pid == c.pid && o.cfg.transaction_id == c.transaction_id) {
                        Some(i) => {
                            let mut s = old.swap_remove(i);
                            s.cfg = c;
                            s
                        }
                        None => Slot::new(c),
                    }
                })
                .collect();
            last_scan = None;
        }

        // (re)connect missing devices every few seconds
        if slots.iter().any(|s| s.dev.is_none())
            && last_scan.map_or(true, |t| t.elapsed() >= Duration::from_secs(5))
        {
            let _ = api.refresh_devices();
            for s in slots.iter_mut().filter(|s| s.dev.is_none()) {
                if let Some((dev, (maj, min))) = razer::open(&api, s.cfg.pid, s.cfg.transaction_id) {
                    s.dev = Some(dev);
                    s.firmware = Some(format!("v{maj}.{min}"));
                    s.error = None;
                    s.applied_version = None;
                    s.hw_applied = None;
                    s.persisted_brightness = None;
                }
            }
            last_scan = Some(Instant::now());
        }

        let idle_secs = idle::idle_secs();
        let dark = !cfg.enabled || (cfg.idle_timeout_secs > 0 && idle_secs >= cfg.idle_timeout_secs);
        let want = if dark { Power::Dark } else { Power::On };
        let preview = shared.previewing();

        // hooks only while something lit actually reacts (or the UI is previewing)
        let needs = if dark && !preview {
            0
        } else {
            slots.iter().fold(0, |acc, s| {
                let (k, m) = s.cfg.input_needs();
                acc | if k { input::NEED_KEYS } else { 0 } | if m { input::NEED_CLICKS } else { 0 }
            })
        };
        if needs != hooks {
            input::set_needs(needs);
            hooks = needs;
        }

        // frames render on schedule, or right away on input or config edits,
        // so reactive layers and UI tweaks never wait on a slow frame rate
        let frame_interval = Duration::from_secs_f32(1.0 / cfg.fps.clamp(0.1, 60.0));
        let now = Instant::now();
        let events: Vec<InputEvent> = std::mem::take(&mut *shared.events.lock().unwrap());
        let due = now >= next_frame || changed || !events.is_empty();
        if due {
            next_frame = now + frame_interval;
        }
        let t = start.elapsed().as_secs_f32();

        let mut animating = false;
        let mut previews = Vec::with_capacity(slots.len());
        for s in slots.iter_mut() {
            let hits = s.hits(&events);
            match s.tick(version, want, t, &hits, preview, due) {
                Ok((anim, frame)) => {
                    animating |= anim;
                    previews.push(frame);
                }
                Err(e) if e.is_transport() => {
                    s.error = Some(format!("disconnected: {e}"));
                    s.dev = None;
                    s.firmware = None;
                    previews.push(None);
                }
                Err(e) => {
                    s.error = Some(e.to_string());
                    previews.push(None);
                }
            }
        }

        if due {
            *shared.previews.lock().unwrap() = previews;
        }
        *shared.status.lock().unwrap() = Status {
            dark,
            idle_secs,
            hooks,
            devices: slots
                .iter()
                .map(|s| DeviceStatus {
                    name: s.cfg.name.clone(),
                    connected: s.dev.is_some(),
                    firmware: s.firmware.clone(),
                    error: s.error.clone(),
                    mode: match s.plan {
                        Plan::Off => "off",
                        Plan::Device(_) => "device",
                        Plan::Stream => "stream",
                    },
                })
                .collect(),
        };

        // never sleep past 1s, so idle/wake checks stay quick even at 0.1 fps
        let nap = if animating {
            next_frame.saturating_duration_since(Instant::now()).min(Duration::from_secs(1))
        } else {
            Duration::from_secs(1)
        };
        // wakes early on config change, input, preview request or quit
        thread::park_timeout(nap);
    }
}
