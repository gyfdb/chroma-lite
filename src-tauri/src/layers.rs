//! Software renderers for each layer type, and the blend modes.
//!
//! Each layer renders RGBA into a scratch buffer (rgb 0..255, alpha 0..1),
//! then the engine blends them bottom → top onto black.

use crate::config::{Blend, LayerEffect, Palette, Trigger};

pub type Rgba = [f32; 4];

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Source {
    Key,
    Click,
    /// A mouse button let go. Only charge-style effects care about these.
    Release,
}

/// An input hit, from one device's point of view. `pos` is (row, col) on its
/// matrix, or None for the whole device (clicks, or any key on a mouse).
#[derive(Clone, Copy, Debug)]
pub struct Hit {
    pub source: Source,
    pub pos: Option<(f32, f32)>,
}

pub struct Ctx<'a> {
    pub t: f32,
    pub dt: f32,
    pub rows: usize,
    pub cols: usize,
    pub hits: &'a [Hit],
    /// Local time of day in hours, 0..24 (for the time-of-day effect).
    pub hour: f32,
}

impl Ctx<'_> {
    fn center(&self) -> (f32, f32) {
        ((self.rows as f32 - 1.0) / 2.0, (self.cols as f32 - 1.0) / 2.0)
    }
    fn hits_for(&self, trigger: Trigger) -> impl Iterator<Item = &Hit> {
        self.hits.iter().filter(move |h| match h.source {
            Source::Key => trigger.keys(),
            Source::Click => trigger.clicks(),
            Source::Release => false,
        })
    }
}

// ─ RNG ───────────────────────────────────────────────────────────────────────

pub struct Rng(u64);

impl Rng {
    pub fn new() -> Self {
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x9E37_79B9_7F4A_7C15);
        Rng(seed | 1)
    }
    /// xorshift64* → uniform 0..1
    pub fn f(&mut self) -> f32 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        ((x.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 40) as f32) / (1u64 << 24) as f32
    }
}

// ─ Color helpers ─────────────────────────────────────────────────────────────

/// Samples a gradient with any number of stops at t (0..=1).
pub fn sample_stops(stops: &[[f32; 3]], t: f32) -> [f32; 3] {
    match stops.len() {
        0 => [0.0; 3],
        1 => stops[0],
        n => {
            let x = t.clamp(0.0, 1.0) * (n - 1) as f32;
            let i = (x as usize).min(n - 2);
            let f = x - i as f32;
            [0, 1, 2].map(|k| stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f)
        }
    }
}

/// Turns a fire palette (built-in or the layer's custom one) into stops.
pub fn fire_stops(p: Palette, custom: &[[u8; 3]]) -> Vec<[f32; 3]> {
    match builtin_stops(p) {
        Some(s) => s.to_vec(),
        None => custom.iter().take(8).map(|c| c.map(|v| v as f32)).collect(),
    }
}

fn builtin_stops(p: Palette) -> Option<[[f32; 3]; 5]> {
    Some(match p {
        Palette::Classic => [[0., 0., 0.], [130., 0., 0.], [255., 45., 0.], [255., 140., 0.], [255., 230., 120.]],
        Palette::Soul => [[0., 0., 0.], [0., 10., 120.], [0., 90., 255.], [0., 200., 255.], [200., 255., 255.]],
        Palette::Toxic => [[0., 0., 0.], [0., 70., 0.], [40., 200., 0.], [150., 255., 0.], [230., 255., 150.]],
        Palette::Cursed => [[0., 0., 0.], [60., 0., 90.], [150., 0., 255.], [255., 60., 255.], [255., 200., 255.]],
        Palette::Custom => return None,
    })
}

fn hue(h: f32) -> [f32; 3] {
    let h = h.rem_euclid(360.0);
    [5.0, 3.0, 1.0].map(|n: f32| {
        let k = (n + h / 60.0) % 6.0;
        255.0 * (1.0 - k.min(4.0 - k).clamp(0.0, 1.0))
    })
}

fn smoothstep(a: f32, b: f32, x: f32) -> f32 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn lerp3(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [0, 1, 2].map(|k| a[k] + (b[k] - a[k]) * t)
}

fn stops_of(colors: &[[u8; 3]]) -> Vec<[f32; 3]> {
    colors.iter().take(8).map(|c| rgb(*c)).collect()
}

/// Cheap integer hash → 0..1, for value noise.
fn hash2(x: i32, y: i32, seed: u32) -> f32 {
    let mut h =
        (x as u32).wrapping_mul(0x8da6_b343) ^ (y as u32).wrapping_mul(0xd816_3841) ^ seed.wrapping_mul(0xcb1a_b31f);
    h ^= h >> 13;
    h = h.wrapping_mul(0x5bd1_e995);
    h ^= h >> 15;
    (h & 0x00ff_ffff) as f32 / 16_777_215.0
}

/// Smooth 2D value noise, 0..1. Plenty for a 6×22 board.
fn vnoise(x: f32, y: f32, seed: u32) -> f32 {
    let (xi, yi) = (x.floor(), y.floor());
    let (fx, fy) = (x - xi, y - yi);
    let (u, v) = (fx * fx * (3.0 - 2.0 * fx), fy * fy * (3.0 - 2.0 * fy));
    let (x0, y0) = (xi as i32, yi as i32);
    let a = hash2(x0, y0, seed);
    let b = hash2(x0 + 1, y0, seed);
    let c = hash2(x0, y0 + 1, seed);
    let d = hash2(x0 + 1, y0 + 1, seed);
    (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v
}

/// Clamps a (row, col) hit to a matrix cell.
fn cell(pos: (f32, f32), rows: usize, cols: usize) -> (usize, usize) {
    ((pos.0.round().max(0.0) as usize).min(rows - 1), (pos.1.round().max(0.0) as usize).min(cols - 1))
}

fn rgb(c: [u8; 3]) -> [f32; 3] {
    c.map(|v| v as f32)
}

fn with_alpha(c: [f32; 3], a: f32) -> Rgba {
    [c[0], c[1], c[2], a.clamp(0.0, 1.0)]
}

// ─ Fire ──────────────────────────────────────────────────────────────────────

/// Hidden rows under the visible matrix, where the flames start.
const HIDDEN_ROWS: usize = 2;

pub struct Fire {
    rows: usize,
    cols: usize,
    height: usize,
    heat: Vec<f32>,
    rng: Rng,
    /// Recent typing speed, roughly keys per second (for typing heat).
    rate: f32,
}

impl Fire {
    pub fn new(rows: usize, cols: usize) -> Self {
        let height = rows + HIDDEN_ROWS;
        Self { rows, cols, height, heat: vec![0.0; height * cols], rng: Rng::new(), rate: 0.0 }
    }

    /// 0 when idle, 1 at about 7 keys a second.
    fn typing_boost(&mut self, keys: usize, dt: f32) -> f32 {
        // exponential moving count over ~1s, so it reads as keys per second
        self.rate = self.rate * (-dt).exp() + keys as f32;
        (self.rate / 7.0).min(1.0)
    }

    /// On a key press, fill that column with heat from the key down to the base,
    /// so a flare shoots up from where you typed.
    fn ignite(&mut self, pos: Option<(f32, f32)>) {
        let w = self.cols;
        match pos {
            Some((r, c)) => {
                let r = (r.round().max(0.0) as usize).min(self.rows - 1);
                let c = (c.round().max(0.0) as usize).min(w - 1);
                for rr in r..self.height {
                    for cc in c.saturating_sub(1)..=(c + 1).min(w - 1) {
                        let boost = if cc == c { 1.0 } else { 0.75 };
                        let i = rr * w + cc;
                        self.heat[i] = self.heat[i].max(boost);
                    }
                }
            }
            None => {
                for rr in self.height - HIDDEN_ROWS..self.height {
                    self.heat[rr * w..(rr + 1) * w].fill(1.0);
                }
            }
        }
    }

    fn step(&mut self, cooling: f32, sparks: f32) {
        let (h, w) = (self.height, self.cols);
        for c in 0..w {
            let i = (h - 1) * w + c;
            self.heat[i] = if self.rng.f() < sparks { 0.85 + self.rng.f() * 0.15 } else { self.heat[i] * 0.55 };
        }
        // top-down, so row r+1 still has last frame's values
        for r in 0..h - 1 {
            for c in 0..w {
                let drift = (self.rng.f() * 3.0) as isize - 1;
                let src = (c as isize + drift).clamp(0, w as isize - 1) as usize;
                let below = (r + 1) * w;
                let left = self.heat[below + c.saturating_sub(1)];
                let right = self.heat[below + (c + 1).min(w - 1)];
                let v = self.heat[below + src] * 0.7 + (left + right) * 0.15;
                self.heat[r * w + c] = (v - self.rng.f() * cooling).max(0.0);
            }
        }
    }

    pub fn heat_at(&self, r: usize, c: usize) -> f32 {
        self.heat[r * self.cols + c]
    }
}

// ─ State ─────────────────────────────────────────────────────────────────────

pub struct Ring {
    r: f32,
    c: f32,
    age: f32,
}

pub struct Drop {
    c: usize,
    y: f32,
    v: f32,
}

pub struct Flicker {
    level: f32,
    target: f32,
    timer: f32,
    rng: Rng,
}

pub struct Storm {
    /// Per-LED brightness of the current bolt.
    bolt: Vec<f32>,
    /// Seconds since the last strike started.
    age: f32,
    /// Seconds until the next strike.
    next: f32,
    rng: Rng,
}

pub struct Rocket {
    r: f32,
    c: f32,
    top: f32,
    color: [f32; 3],
}

pub struct Spark {
    r: f32,
    c: f32,
    vr: f32,
    vc: f32,
    life: f32,
    max: f32,
    color: [f32; 3],
}

/// Per-layer memory that carries over between frames.
pub enum State {
    Stateless,
    Fire(Fire),
    /// Per-LED intensity 0..1 (reactive, starlight, frost).
    Field(Vec<f32>, Rng),
    Rings(Vec<Ring>),
    Rain {
        drops: Vec<Drop>,
        field: Vec<f32>,
        rng: Rng,
    },
    Flicker(Flicker),
    Storm(Storm),
    /// Comet: fading trail, plus the last key and how long ago it was pressed.
    Trail {
        field: Vec<f32>,
        last: Option<(f32, f32)>,
        since: f32,
    },
    Fireworks {
        rockets: Vec<Rocket>,
        sparks: Vec<Spark>,
        rng: Rng,
    },
    /// Click charge: buttons held, charge level, release flash, how long held.
    Charge {
        held: u8,
        level: f32,
        flash: f32,
        held_for: f32,
    },
}

impl State {
    pub fn new(effect: &LayerEffect, rows: usize, cols: usize) -> Self {
        let n = rows * cols;
        match effect {
            LayerEffect::Fire { .. } => State::Fire(Fire::new(rows, cols)),
            LayerEffect::Reactive { .. } | LayerEffect::Starlight { .. } | LayerEffect::Frost { .. } => {
                State::Field(vec![0.0; n], Rng::new())
            }
            LayerEffect::Ripple { .. } | LayerEffect::Shockwave { .. } => State::Rings(Vec::new()),
            LayerEffect::Rain { .. } => State::Rain { drops: Vec::new(), field: vec![0.0; n], rng: Rng::new() },
            LayerEffect::Candle { .. } => {
                State::Flicker(Flicker { level: 0.8, target: 0.8, timer: 0.0, rng: Rng::new() })
            }
            LayerEffect::Lightning { .. } => {
                State::Storm(Storm { bolt: vec![0.0; n], age: 10.0, next: 1.5, rng: Rng::new() })
            }
            LayerEffect::Comet { .. } => State::Trail { field: vec![0.0; n], last: None, since: 0.0 },
            LayerEffect::Fireworks { .. } => {
                State::Fireworks { rockets: Vec::new(), sparks: Vec::new(), rng: Rng::new() }
            }
            LayerEffect::ClickCharge { .. } => State::Charge { held: 0, level: 0.0, flash: 0.0, held_for: 0.0 },
            _ => State::Stateless,
        }
    }

    /// Whether this state still works for `effect` on a rows×cols matrix.
    pub fn fits(&self, effect: &LayerEffect, rows: usize, cols: usize) -> bool {
        let n = rows * cols;
        match (self, effect) {
            (State::Fire(f), LayerEffect::Fire { .. }) => f.rows == rows && f.cols == cols,
            (
                State::Field(v, _),
                LayerEffect::Reactive { .. } | LayerEffect::Starlight { .. } | LayerEffect::Frost { .. },
            ) => v.len() == n,
            (State::Rings(_), LayerEffect::Ripple { .. } | LayerEffect::Shockwave { .. }) => true,
            (State::Rain { field, .. }, LayerEffect::Rain { .. }) => field.len() == n,
            (State::Flicker(_), LayerEffect::Candle { .. }) => true,
            (State::Storm(s), LayerEffect::Lightning { .. }) => s.bolt.len() == n,
            (State::Trail { field, .. }, LayerEffect::Comet { .. }) => field.len() == n,
            (State::Fireworks { .. }, LayerEffect::Fireworks { .. }) => true,
            (State::Charge { .. }, LayerEffect::ClickCharge { .. }) => true,
            (State::Stateless, e) => matches!(State::new(e, 1, 1), State::Stateless),
            _ => false,
        }
    }
}

// ─ Render ────────────────────────────────────────────────────────────────────

/// Renders one layer. Returns true if it keeps changing without input, so the
/// engine knows whether it can sleep.
pub fn render(effect: &LayerEffect, state: &mut State, ctx: &Ctx, out: &mut [Rgba]) -> bool {
    let (rows, cols) = (ctx.rows, ctx.cols);
    let t = ctx.t;

    match (effect, state) {
        (LayerEffect::Solid { color }, _) => {
            out.fill(with_alpha(rgb(*color), 1.0));
            false
        }

        (LayerEffect::Breathing { color, period_secs }, _) => {
            let k = 0.5 - 0.5 * (t / period_secs.max(0.2) * std::f32::consts::TAU).cos();
            out.fill(with_alpha(rgb(*color), k));
            true
        }

        (LayerEffect::Spectrum { period_secs }, _) => {
            out.fill(with_alpha(hue(t / period_secs.max(0.2) * 360.0), 1.0));
            true
        }

        (LayerEffect::Wave { period_secs, reverse }, _) => {
            let dir = if *reverse { 1.0 } else { -1.0 };
            for r in 0..rows {
                for c in 0..cols {
                    let h = (t / period_secs.max(0.2) + dir * c as f32 / cols.max(1) as f32) * 360.0;
                    out[r * cols + c] = with_alpha(hue(h), 1.0);
                }
            }
            true
        }

        (LayerEffect::Fire { palette, custom, cooling, sparks, react_to_keys, typing_heat }, State::Fire(fire)) => {
            let keys: Vec<&Hit> = ctx.hits.iter().filter(|h| h.source == Source::Key).collect();
            if *react_to_keys {
                for h in &keys {
                    fire.ignite(h.pos);
                }
            }
            let boost = fire.typing_boost(keys.len(), ctx.dt);
            let (cooling, sparks) = if *typing_heat {
                // embers while idle, full flames while typing fast
                (cooling * (1.6 - 0.8 * boost), sparks * (0.15 + 0.85 * boost))
            } else {
                (*cooling, *sparks)
            };
            fire.step(cooling, sparks);
            let stops = fire_stops(*palette, custom);
            for r in 0..rows {
                for c in 0..cols {
                    out[r * cols + c] = with_alpha(sample_stops(&stops, fire.heat_at(r, c)), 1.0);
                }
            }
            true
        }

        (LayerEffect::Reactive { color, fade_ms, trigger }, State::Field(field, _)) => {
            let decay = ctx.dt * 1000.0 / (*fade_ms).max(30) as f32;
            field.iter_mut().for_each(|v| *v = (*v - decay).max(0.0));
            for h in ctx.hits_for(*trigger) {
                match h.pos {
                    Some((r, c)) => {
                        let r = (r.round().max(0.0) as usize).min(rows - 1);
                        let c = (c.round().max(0.0) as usize).min(cols - 1);
                        field[r * cols + c] = 1.0;
                    }
                    None => field.fill(1.0),
                }
            }
            let col = rgb(*color);
            for (o, v) in out.iter_mut().zip(field.iter()) {
                *o = with_alpha(col, *v);
            }
            field.iter().any(|v| *v > 0.0)
        }

        (LayerEffect::Starlight { color, density, fade_ms }, State::Field(field, rng)) => {
            let decay = ctx.dt * 1000.0 / (*fade_ms).max(30) as f32;
            let spawn = density.clamp(0.0, 1.0) * ctx.dt * 1.5;
            for v in field.iter_mut() {
                *v = (*v - decay).max(0.0);
                if rng.f() < spawn {
                    *v = 1.0;
                }
            }
            let col = rgb(*color);
            for (o, v) in out.iter_mut().zip(field.iter()) {
                // ease so stars pop, then linger
                *o = with_alpha(col, v * v * (3.0 - 2.0 * v));
            }
            true
        }

        (LayerEffect::Ripple { color, speed, width, trigger }, State::Rings(rings)) => {
            for h in ctx.hits_for(*trigger) {
                let (r, c) = h.pos.unwrap_or_else(|| ctx.center());
                rings.push(Ring { r, c, age: 0.0 });
            }
            let max_r = (rows + cols) as f32;
            let width = width.max(0.3);
            for ring in rings.iter_mut() {
                ring.age += ctx.dt;
            }
            rings.retain(|ring| ring.age * speed - width < max_r * 0.75);
            rings.truncate(64);

            let col = rgb(*color);
            for r in 0..rows {
                for c in 0..cols {
                    let mut a: f32 = 0.0;
                    for ring in rings.iter() {
                        let radius = ring.age * speed;
                        // key rows are ~1.2x taller than columns are wide
                        let d = ((r as f32 - ring.r) * 1.2).hypot(c as f32 - ring.c);
                        let band = (1.0 - (d - radius).abs() / width).max(0.0);
                        let fade = (1.0 - radius / (max_r * 0.75)).max(0.0);
                        a = a.max(band * fade);
                    }
                    out[r * cols + c] = with_alpha(col, a);
                }
            }
            !rings.is_empty()
        }

        // ─ ambient ─────────────────────────────────────────────────────────
        (LayerEffect::Aurora { colors, speed }, _) => {
            let stops = stops_of(colors);
            let s = speed.clamp(0.05, 5.0);
            for r in 0..rows {
                for c in 0..cols {
                    let x = c as f32 * 0.18;
                    let y = r as f32 * 0.35;
                    // curtains that sway along the board and bend from row to row
                    let sway = vnoise(x + t * 0.15 * s, t * 0.05 * s, 1);
                    let bend = (vnoise(x * 0.8 - t * 0.1 * s, y * 0.6, 4) - 0.5) * 2.4;
                    let band = 0.5 + 0.5 * (x * 2.2 + t * 0.6 * s + 3.0 * sway + bend * y).sin();
                    // fine rays running down the curtain, drifting the other way
                    let rays = 0.6 + 0.4 * vnoise(x * 3.5 - t * 0.5 * s, y * 0.8 + t * 0.2 * s, 2);
                    let fall = 1.0 - 0.4 * r as f32 / (rows.max(2) - 1) as f32;
                    let a = smoothstep(0.35, 1.0, band) * rays * fall;
                    // noise sits near its middle, so stretch it to reach every color
                    let tint = smoothstep(0.25, 0.75, vnoise(x * 0.6 + t * 0.07 * s, y * 0.3 + 3.0, 3));
                    out[r * cols + c] = with_alpha(sample_stops(&stops, tint), a);
                }
            }
            true
        }

        (LayerEffect::Rain { color, density, speed }, State::Rain { drops, field, rng }) => {
            let speed = speed.clamp(1.0, 40.0);
            // trail about one row long whatever the speed
            let decay = ctx.dt * speed * 0.9;
            field.iter_mut().for_each(|v| *v = (*v - decay).max(0.0));

            let mut spawn = density.clamp(0.0, 1.0) * cols as f32 * ctx.dt * speed / 12.0;
            while spawn > 0.0 {
                if rng.f() < spawn.min(1.0) {
                    let c = ((rng.f() * cols as f32) as usize).min(cols - 1);
                    drops.push(Drop { c, y: -rng.f(), v: speed * (0.8 + 0.4 * rng.f()) });
                }
                spawn -= 1.0;
            }
            drops.truncate(128);

            for d in drops.iter_mut() {
                let from = d.y.max(0.0) as usize;
                d.y += d.v * ctx.dt;
                // light every row passed this frame, so fast drops don't skip
                let to = (d.y.max(0.0) as usize).min(rows);
                for r in from..to.max(from + 1).min(rows) {
                    if d.y >= 0.0 {
                        field[r * cols + d.c] = 1.0;
                    }
                }
                if d.y >= rows as f32 {
                    let r = rows - 1;
                    for cc in d.c.saturating_sub(1)..=(d.c + 1).min(cols - 1) {
                        let i = r * cols + cc;
                        field[i] = field[i].max(if cc == d.c { 1.0 } else { 0.55 });
                    }
                }
            }
            drops.retain(|d| d.y < rows as f32);

            let col = rgb(*color);
            for (o, v) in out.iter_mut().zip(field.iter()) {
                *o = with_alpha(col, v.powf(1.3));
            }
            true
        }

        (LayerEffect::Lava { colors, speed }, _) => {
            let stops = stops_of(colors);
            let s = speed.clamp(0.05, 5.0);
            let (fr, fc) = (rows as f32, cols as f32);
            // five blobs on slow, out-of-step paths
            let blobs: Vec<(f32, f32, f32)> = (0..5)
                .map(|i| {
                    let i = i as f32;
                    let x = fc * (0.5 + 0.45 * (t * s * 0.13 * (1.0 + i * 0.17) + i * 1.9).sin());
                    let y = fr * (0.5 + 0.5 * (t * s * 0.21 * (1.0 + i * 0.11) + i * 2.7).sin());
                    let rad = (1.4 + 0.5 * (i * 1.3).sin()) * (fr / 6.0).max(0.5);
                    (y, x, rad * rad)
                })
                .collect();
            for r in 0..rows {
                for c in 0..cols {
                    let field: f32 = blobs
                        .iter()
                        .map(|(y, x, rr)| {
                            rr / (((r as f32 + 0.5 - y) * 1.2).powi(2) + (c as f32 + 0.5 - x).powi(2) + 0.3)
                        })
                        .sum();
                    out[r * cols + c] = with_alpha(sample_stops(&stops, smoothstep(0.5, 1.8, field)), 1.0);
                }
            }
            true
        }

        (LayerEffect::Candle { color, flicker }, State::Flicker(f)) => {
            let amount = flicker.clamp(0.0, 1.0);
            f.timer -= ctx.dt;
            if f.timer <= 0.0 {
                // mostly small dips, now and then a deeper one
                let dip = f.rng.f();
                f.target = 1.0 - amount * 0.7 * dip * dip;
                f.timer = 0.05 + 0.15 * f.rng.f();
            }
            f.level += (f.target - f.level) * (ctx.dt * 14.0).min(1.0);
            let col = rgb(*color);
            for r in 0..rows {
                // a touch brighter toward the bottom, like the light sits low
                let low = if rows > 1 { 0.8 + 0.2 * r as f32 / (rows - 1) as f32 } else { 1.0 };
                for c in 0..cols {
                    let wobble = 1.0 - amount * 0.15 * vnoise(c as f32 * 0.5, t * 2.0, 5);
                    out[r * cols + c] = with_alpha(col, f.level * low * wobble);
                }
            }
            true
        }

        (LayerEffect::Lightning { color, sky, frequency, glow }, State::Storm(storm)) => {
            storm.next -= ctx.dt;
            if storm.next <= 0.0 {
                strike(storm, rows, cols);
                storm.age = 0.0;
                let mean = 60.0 / frequency.clamp(0.5, 60.0);
                storm.next = mean * (0.4 + 1.2 * storm.rng.f());
            }
            storm.age += ctx.dt;
            // a strike flashes twice: a sharp hit, then a softer echo
            let a = storm.age;
            let flash = (-a * 12.0).exp() + if a > 0.12 { 0.8 * (-(a - 0.12) * 9.0).exp() } else { 0.0 };
            let (bolt_col, sky_col) = (rgb(*color), rgb(*sky));
            let glow = glow.clamp(0.0, 1.0) * (0.85 + 0.15 * (t * 0.7).sin());
            for (i, o) in out.iter_mut().enumerate() {
                let k = (storm.bolt[i] * flash).max(0.25 * flash).min(1.0);
                *o = with_alpha(lerp3(sky_col, bolt_col, k), glow + (1.0 - glow) * k);
            }
            true
        }

        (LayerEffect::TimeOfDay { day, night }, _) => {
            let col = time_of_day(ctx.hour, rgb(*day), rgb(*night));
            out.fill(with_alpha(col, 1.0));
            // the engine still redraws about once a second while nothing animates,
            // which is plenty for something that moves over hours
            false
        }

        // ─ reactive ────────────────────────────────────────────────────────
        (LayerEffect::Comet { color, fade_ms }, State::Trail { field, last, since }) => {
            let decay = ctx.dt * 1000.0 / (*fade_ms).max(30) as f32;
            field.iter_mut().for_each(|v| *v = (*v - decay).max(0.0));
            *since += ctx.dt;
            for h in ctx.hits.iter().filter(|h| h.source == Source::Key) {
                let Some(pos) = h.pos else {
                    field.fill(1.0);
                    continue;
                };
                match *last {
                    // a recent previous key: streak from it, dim tail to bright head
                    Some(from) if *since < 1.5 => {
                        let dist = ((pos.0 - from.0) * 1.2).hypot(pos.1 - from.1);
                        let steps = (dist * 2.0).ceil().max(1.0) as usize;
                        for i in 0..=steps {
                            let k = i as f32 / steps as f32;
                            let (r, c) =
                                cell((from.0 + (pos.0 - from.0) * k, from.1 + (pos.1 - from.1) * k), rows, cols);
                            let v = &mut field[r * cols + c];
                            *v = v.max(0.35 + 0.65 * k);
                        }
                    }
                    _ => {
                        let (r, c) = cell(pos, rows, cols);
                        field[r * cols + c] = 1.0;
                    }
                }
                *last = Some(pos);
                *since = 0.0;
            }
            let col = rgb(*color);
            for (o, v) in out.iter_mut().zip(field.iter()) {
                *o = with_alpha(col, v.powf(1.5));
            }
            field.iter().any(|v| *v > 0.0)
        }

        (LayerEffect::Shockwave { color, speed, trigger }, State::Rings(rings)) => {
            for h in ctx.hits_for(*trigger) {
                let (r, c) = h.pos.unwrap_or_else(|| ctx.center());
                rings.push(Ring { r, c, age: 0.0 });
            }
            let speed = speed.clamp(2.0, 60.0);
            let reach = rows.max(cols) as f32 + 2.0;
            for ring in rings.iter_mut() {
                ring.age += ctx.dt;
            }
            rings.retain(|ring| ring.age * speed < reach);
            rings.truncate(64);

            let col = rgb(*color);
            for r in 0..rows {
                for c in 0..cols {
                    let mut a: f32 = 0.0;
                    for ring in rings.iter() {
                        let head = ring.age * speed;
                        // only the key's own row and column carry the wave
                        let d = if (r as f32 - ring.r).abs() < 0.5 {
                            (c as f32 - ring.c).abs()
                        } else if (c as f32 - ring.c).abs() < 0.5 {
                            (r as f32 - ring.r).abs() * 1.2
                        } else {
                            continue;
                        };
                        let front = (1.0 - (d - head).abs() / 1.2).max(0.0);
                        let wake = if d < head { 0.3 * (1.0 - (head - d) / 4.0).max(0.0) } else { 0.0 };
                        a = a.max(front.max(wake) * (1.0 - head / reach).max(0.0));
                    }
                    out[r * cols + c] = with_alpha(col, a);
                }
            }
            !rings.is_empty()
        }

        (LayerEffect::Fireworks { color, rainbow, trigger }, State::Fireworks { rockets, sparks, rng }) => {
            let pick = |rng: &mut Rng| {
                if *rainbow {
                    hue(rng.f() * 360.0)
                } else {
                    rgb(*color)
                }
            };
            for h in ctx.hits_for(*trigger) {
                let color = pick(rng);
                match h.pos {
                    // launch from the key, burst somewhere above it
                    Some((r, c)) if r >= 1.5 => {
                        let top = rng.f() * (r * 0.5);
                        rockets.push(Rocket { r, c, top, color });
                    }
                    Some((r, c)) => burst(sparks, rng, r, c, color),
                    None => {
                        let (r, c) = ctx.center();
                        burst(sparks, rng, r, c, color);
                    }
                }
            }
            rockets.truncate(16);

            let mut bursts = Vec::new();
            for rk in rockets.iter_mut() {
                rk.r -= 14.0 * ctx.dt;
                if rk.r <= rk.top {
                    bursts.push((rk.top, rk.c, rk.color));
                }
            }
            rockets.retain(|rk| rk.r > rk.top);
            for (r, c, color) in bursts {
                burst(sparks, rng, r, c, color);
            }
            for sp in sparks.iter_mut() {
                sp.vr += 9.0 * ctx.dt; // gravity
                sp.r += sp.vr * ctx.dt;
                sp.c += sp.vc * ctx.dt;
                sp.life -= ctx.dt;
            }
            sparks.retain(|sp| sp.life > 0.0);
            sparks.truncate(256);

            out.fill([0.0; 4]);
            let mut plot = |r: f32, c: f32, color: [f32; 3], a: f32| {
                let (ri, ci) = (r.round(), c.round());
                if ri >= 0.0 && ci >= 0.0 && (ri as usize) < rows && (ci as usize) < cols {
                    let o = &mut out[ri as usize * cols + ci as usize];
                    if a > o[3] {
                        *o = with_alpha(color, a);
                    }
                }
            };
            for rk in rockets.iter() {
                plot(rk.r, rk.c, lerp3(rk.color, [255.0; 3], 0.6), 1.0);
            }
            for sp in sparks.iter() {
                plot(sp.r, sp.c, sp.color, (sp.life / sp.max).powf(0.7));
            }
            !rockets.is_empty() || !sparks.is_empty()
        }

        (LayerEffect::Frost { color, freeze_secs }, State::Field(frost, _)) => {
            let grow = ctx.dt / freeze_secs.clamp(1.0, 600.0);
            frost.iter_mut().for_each(|v| *v = (*v + grow).min(1.0));
            for h in ctx.hits.iter().filter(|h| h.source == Source::Key) {
                match h.pos {
                    Some(pos) => {
                        let (r, c) = cell(pos, rows, cols);
                        // thaw the key, and part of its neighbours
                        for rr in r.saturating_sub(1)..=(r + 1).min(rows - 1) {
                            for cc in c.saturating_sub(1)..=(c + 1).min(cols - 1) {
                                let v = &mut frost[rr * cols + cc];
                                *v = if rr == r && cc == c { 0.0 } else { *v * 0.4 };
                            }
                        }
                    }
                    None => frost.fill(0.0),
                }
            }
            let col = rgb(*color);
            for r in 0..rows {
                for c in 0..cols {
                    let v = frost[r * cols + c];
                    let shimmer = 0.85 + 0.15 * vnoise(c as f32 * 0.7, r as f32 * 0.7 + t * 0.3, 9);
                    out[r * cols + c] = with_alpha(col, smoothstep(0.25, 1.0, v) * shimmer);
                }
            }
            true
        }

        (LayerEffect::ClickCharge { color, charge_ms, fade_ms }, State::Charge { held, level, flash, held_for }) => {
            // fade last frame's flash first, so a release this frame shows at full strength
            *flash = (*flash - ctx.dt * 1000.0 / (*fade_ms).max(30) as f32).max(0.0);
            for h in ctx.hits {
                match h.source {
                    Source::Click => *held = (*held + 1).min(5),
                    Source::Release => {
                        *held = held.saturating_sub(1);
                        if *held == 0 {
                            // let go: flash at least as bright as the charge got
                            *flash = level.max(0.6);
                            *level = 0.0;
                        }
                    }
                    Source::Key => {}
                }
            }
            if *held > 0 {
                *held_for += ctx.dt;
                *level = (*level + ctx.dt * 1000.0 / (*charge_ms).max(50) as f32).min(1.0);
                // never stay stuck charging if a release got lost
                if *held_for > 10.0 {
                    *held = 0;
                    *level = 0.0;
                }
            } else {
                *held_for = 0.0;
            }
            // charging ramps up gently, then speeds up near full
            out.fill(with_alpha(rgb(*color), (level.powf(1.6) * 0.85).max(*flash)));
            *held > 0 || *flash > 0.0
        }

        // state doesn't match the effect; the engine rebuilds state on config
        // change, so this lasts one frame at most
        _ => {
            out.fill([0.0; 4]);
            false
        }
    }
}

/// Draws a new jagged bolt from the top row down, with a short side branch.
fn strike(storm: &mut Storm, rows: usize, cols: usize) {
    storm.bolt.fill(0.0);
    let rng = &mut storm.rng;
    let mut c = (rng.f() * cols as f32) as isize;
    let mut branch: Option<(usize, isize, isize)> = None;
    for r in 0..rows {
        let ci = c.clamp(0, cols as isize - 1) as usize;
        storm.bolt[r * cols + ci] = 1.0;
        for side in [ci.wrapping_sub(1), ci + 1] {
            if side < cols {
                let v = &mut storm.bolt[r * cols + side];
                *v = v.max(0.3);
            }
        }
        if branch.is_none() && r + 1 < rows && rng.f() < 0.35 {
            branch = Some((r + 1, c, if rng.f() < 0.5 { -1 } else { 1 }));
        }
        c += (rng.f() * 3.0) as isize - 1;
    }
    if let Some((start, mut bc, dir)) = branch {
        for r in start..(start + 3).min(rows) {
            bc += dir;
            if (0..cols as isize).contains(&bc) {
                let v = &mut storm.bolt[r * cols + bc as usize];
                *v = v.max(0.6);
            }
        }
    }
}

/// Throws a ring of sparks out from (r, c), plus a short flash on the spot so
/// a single-LED device still sees it.
fn burst(sparks: &mut Vec<Spark>, rng: &mut Rng, r: f32, c: f32, color: [f32; 3]) {
    let n = 10;
    for k in 0..n {
        let angle = k as f32 / n as f32 * std::f32::consts::TAU + rng.f() * 0.4;
        let speed = 4.0 + 3.0 * rng.f();
        let life = 0.5 + 0.4 * rng.f();
        sparks.push(Spark { r, c, vr: angle.sin() * speed / 1.2, vc: angle.cos() * speed, life, max: life, color });
    }
    sparks.push(Spark { r, c, vr: 0.0, vc: 0.0, life: 0.3, max: 0.3, color: lerp3(color, [255.0; 3], 0.5) });
}

/// Night color after dark, day color in daylight, warm glow around sunrise and sunset.
fn time_of_day(hour: f32, day: [f32; 3], night: [f32; 3]) -> [f32; 3] {
    const DAWN: [f32; 3] = [255.0, 120.0, 80.0];
    const DUSK: [f32; 3] = [255.0, 110.0, 40.0];
    let keys: [(f32, [f32; 3]); 8] =
        [(0.0, night), (5.0, night), (6.5, DAWN), (8.0, day), (17.0, day), (19.0, DUSK), (21.0, night), (24.0, night)];
    let h = hour.rem_euclid(24.0);
    for w in keys.windows(2) {
        let ((h0, c0), (h1, c1)) = (w[0], w[1]);
        if h <= h1 {
            return lerp3(c0, c1, smoothstep(0.0, 1.0, (h - h0) / (h1 - h0)));
        }
    }
    night
}

pub fn blend(dst: [f32; 3], src: Rgba, mode: Blend, opacity: f32) -> [f32; 3] {
    let a = (src[3] * opacity).clamp(0.0, 1.0);
    if a <= 0.0 {
        return dst;
    }
    [0, 1, 2].map(|k| {
        let d = dst[k] / 255.0;
        let s = src[k] / 255.0;
        let b = match mode {
            Blend::Normal => s,
            Blend::Add => (d + s).min(1.0),
            Blend::Screen => 1.0 - (1.0 - d) * (1.0 - s),
            Blend::Multiply => d * s,
            Blend::Lighten => d.max(s),
        };
        (d + (b - d) * a) * 255.0
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx<'a>(rows: usize, cols: usize, hits: &'a [Hit]) -> Ctx<'a> {
        Ctx { t: 1.0, dt: 1.0 / 24.0, rows, cols, hits, hour: 12.0 }
    }

    fn key(r: f32, c: f32) -> Hit {
        Hit { source: Source::Key, pos: Some((r, c)) }
    }

    fn lit(out: &[Rgba]) -> usize {
        out.iter().filter(|p| p[3] > 0.05).count()
    }

    /// Every new effect, with the defaults the UI uses.
    fn new_effects() -> Vec<LayerEffect> {
        vec![
            LayerEffect::Aurora { colors: vec![[0, 255, 140], [0, 170, 255], [170, 60, 255]], speed: 1.0 },
            LayerEffect::Rain { color: [120, 180, 255], density: 0.5, speed: 12.0 },
            LayerEffect::Lava { colors: vec![[30, 0, 40], [160, 20, 60], [255, 90, 0], [255, 200, 60]], speed: 1.0 },
            LayerEffect::Candle { color: [255, 147, 41], flicker: 0.5 },
            LayerEffect::Lightning { color: [200, 220, 255], sky: [20, 30, 90], frequency: 60.0, glow: 0.3 },
            LayerEffect::TimeOfDay { day: [255, 244, 229], night: [255, 120, 30] },
            LayerEffect::Comet { color: [120, 200, 255], fade_ms: 600 },
            LayerEffect::Shockwave { color: [255, 255, 255], speed: 24.0, trigger: Trigger::Both },
            LayerEffect::Fireworks { color: [255, 200, 80], rainbow: true, trigger: Trigger::Both },
            LayerEffect::Frost { color: [170, 220, 255], freeze_secs: 2.0 },
            LayerEffect::ClickCharge { color: [255, 120, 40], charge_ms: 800, fade_ms: 400 },
        ]
    }

    #[test]
    fn new_effects_stay_in_range_on_any_size() {
        for (rows, cols) in [(6, 22), (1, 1), (3, 5)] {
            for e in new_effects() {
                let mut s = State::new(&e, rows, cols);
                assert!(s.fits(&e, rows, cols), "{e:?} state doesn't fit");
                let mut out = vec![[0.0; 4]; rows * cols];
                for f in 0..400 {
                    let hits = match f % 7 {
                        0 => vec![key((f % rows) as f32, (f * 3 % cols) as f32)],
                        3 => vec![Hit { source: Source::Click, pos: None }],
                        5 => vec![Hit { source: Source::Release, pos: None }],
                        _ => vec![],
                    };
                    let c = Ctx { t: f as f32 / 24.0, dt: 1.0 / 24.0, rows, cols, hits: &hits, hour: (f % 24) as f32 };
                    render(&e, &mut s, &c, &mut out);
                    for p in &out {
                        assert!(p.iter().all(|v| v.is_finite()), "{e:?} made a NaN");
                        assert!((0.0..=1.0).contains(&p[3]), "{e:?} alpha {}", p[3]);
                        assert!(p[..3].iter().all(|v| (-0.01..=255.01).contains(v)), "{e:?} color {p:?}");
                    }
                }
            }
        }
    }

    #[test]
    fn typing_heat_grows_with_typing() {
        let mut idle = Fire::new(6, 22);
        let mut busy = Fire::new(6, 22);
        let (mut cold, mut hot) = (0.0, 0.0);
        for f in 0..240 {
            // idle: no keys. busy: about 8 keys a second
            idle.typing_boost(0, 1.0 / 24.0);
            let b = busy.typing_boost(if f % 3 == 0 { 1 } else { 0 }, 1.0 / 24.0);
            idle.step(0.22 * 1.6, 0.6 * 0.15);
            busy.step(0.22 * (1.6 - 0.8 * b), 0.6 * (0.15 + 0.85 * b));
            if f > 120 {
                cold += (0..22).map(|c| idle.heat_at(3, c)).sum::<f32>();
                hot += (0..22).map(|c| busy.heat_at(3, c)).sum::<f32>();
            }
        }
        assert!(hot > cold * 2.0, "typing should raise the flames ({hot} vs {cold})");
    }

    #[test]
    fn comet_draws_a_streak_between_keys() {
        let e = LayerEffect::Comet { color: [255, 255, 255], fade_ms: 600 };
        let mut s = State::new(&e, 6, 22);
        let mut out = vec![[0.0; 4]; 6 * 22];
        render(&e, &mut s, &ctx(6, 22, &[key(3.0, 2.0)]), &mut out);
        render(&e, &mut s, &ctx(6, 22, &[key(3.0, 12.0)]), &mut out);
        // everything between the two keys on that row is lit, brightest at the new key
        assert!((2..=12).all(|c| out[3 * 22 + c][3] > 0.0));
        assert!(out[3 * 22 + 12][3] > out[3 * 22 + 3][3]);
        assert_eq!(out[0][3], 0.0);
    }

    #[test]
    fn shockwave_stays_on_its_row_and_column() {
        let e = LayerEffect::Shockwave { color: [255, 255, 255], speed: 24.0, trigger: Trigger::Keys };
        let mut s = State::new(&e, 6, 22);
        let mut out = vec![[0.0; 4]; 6 * 22];
        render(&e, &mut s, &ctx(6, 22, &[key(2.0, 10.0)]), &mut out);
        for _ in 0..3 {
            render(&e, &mut s, &ctx(6, 22, &[]), &mut out);
        }
        for r in 0..6 {
            for c in 0..22 {
                if r != 2 && c != 10 {
                    assert_eq!(out[r * 22 + c][3], 0.0, "lit off-axis at {r},{c}");
                }
            }
        }
        assert!(lit(&out) > 0);
        let mut frames = 0;
        while render(&e, &mut s, &ctx(6, 22, &[]), &mut out) {
            frames += 1;
            assert!(frames < 200, "shockwave never finished");
        }
    }

    #[test]
    fn fireworks_launch_burst_and_finish() {
        let e = LayerEffect::Fireworks { color: [255, 0, 0], rainbow: false, trigger: Trigger::Keys };
        let mut s = State::new(&e, 6, 22);
        let mut out = vec![[0.0; 4]; 6 * 22];
        assert!(render(&e, &mut s, &ctx(6, 22, &[key(5.0, 11.0)]), &mut out));
        let mut most = 0;
        let mut frames = 0;
        while render(&e, &mut s, &ctx(6, 22, &[]), &mut out) {
            most = most.max(lit(&out));
            frames += 1;
            assert!(frames < 200, "fireworks never finished");
        }
        assert!(most >= 4, "the burst should spread over several keys, got {most}");
    }

    #[test]
    fn frost_creeps_in_and_typing_thaws() {
        let e = LayerEffect::Frost { color: [255, 255, 255], freeze_secs: 2.0 };
        let mut s = State::new(&e, 6, 22);
        let mut out = vec![[0.0; 4]; 6 * 22];
        render(&e, &mut s, &ctx(6, 22, &[]), &mut out);
        assert_eq!(lit(&out), 0, "starts thawed");
        for _ in 0..72 {
            render(&e, &mut s, &ctx(6, 22, &[]), &mut out);
        }
        assert_eq!(lit(&out), 6 * 22, "fully frozen after freeze_secs");
        render(&e, &mut s, &ctx(6, 22, &[key(2.0, 5.0)]), &mut out);
        assert_eq!(out[2 * 22 + 5][3], 0.0);
        assert!(out[2 * 22 + 6][3] < out[2 * 22 + 9][3], "neighbours partly thawed");
    }

    #[test]
    fn click_charge_builds_while_held_and_flashes_on_release() {
        let e = LayerEffect::ClickCharge { color: [255, 255, 255], charge_ms: 500, fade_ms: 300 };
        let mut s = State::new(&e, 1, 1);
        let mut out = vec![[0.0; 4]];
        let down = [Hit { source: Source::Click, pos: None }];
        let up = [Hit { source: Source::Release, pos: None }];
        assert!(render(&e, &mut s, &ctx(1, 1, &down), &mut out));
        let first = out[0][3];
        for _ in 0..6 {
            render(&e, &mut s, &ctx(1, 1, &[]), &mut out);
        }
        assert!(out[0][3] > first, "charges while held");
        render(&e, &mut s, &ctx(1, 1, &up), &mut out);
        assert!(out[0][3] >= 0.6, "flashes on release");
        let mut frames = 0;
        while render(&e, &mut s, &ctx(1, 1, &[]), &mut out) {
            frames += 1;
            assert!(frames < 100, "flash never faded");
        }
        assert_eq!(out[0][3], 0.0);
        // a lost release doesn't leave it charging forever
        render(&e, &mut s, &ctx(1, 1, &down), &mut out);
        let mut frames = 0;
        while render(&e, &mut s, &ctx(1, 1, &[]), &mut out) {
            frames += 1;
            assert!(frames < 24 * 12, "stuck charging");
        }
    }

    #[test]
    fn keys_dont_trip_click_charge_and_releases_dont_trip_ripples() {
        let charge = LayerEffect::ClickCharge { color: [255, 255, 255], charge_ms: 500, fade_ms: 300 };
        let mut s = State::new(&charge, 1, 1);
        let mut out = vec![[0.0; 4]];
        assert!(!render(&charge, &mut s, &ctx(1, 1, &[key(0.0, 0.0)]), &mut out));
        let ripple = LayerEffect::Ripple { color: [255, 255, 255], speed: 14.0, width: 1.4, trigger: Trigger::Both };
        let mut s = State::new(&ripple, 6, 22);
        let mut out = vec![[0.0; 4]; 6 * 22];
        assert!(!render(&ripple, &mut s, &ctx(6, 22, &[Hit { source: Source::Release, pos: None }]), &mut out));
    }

    #[test]
    fn time_of_day_follows_the_clock() {
        let (day, night) = ([255.0, 255.0, 255.0], [255.0, 100.0, 0.0]);
        assert_eq!(time_of_day(12.0, day, night), day);
        assert_eq!(time_of_day(0.0, day, night), night);
        assert_eq!(time_of_day(23.5, day, night), night);
        // around sunset it's warm, neither day nor night
        let dusk = time_of_day(19.0, day, night);
        assert!(dusk != day && dusk != night);
    }

    #[test]
    fn lightning_strikes_and_settles() {
        let e = LayerEffect::Lightning { color: [255, 255, 255], sky: [0, 0, 80], frequency: 60.0, glow: 0.2 };
        let mut s = State::new(&e, 6, 22);
        let mut out = vec![[0.0; 4]; 6 * 22];
        let mut brightest: f32 = 0.0;
        for f in 0..(24 * 4) {
            let c = Ctx { t: f as f32 / 24.0, dt: 1.0 / 24.0, rows: 6, cols: 22, hits: &[], hour: 12.0 };
            render(&e, &mut s, &c, &mut out);
            brightest = brightest.max(out.iter().map(|p| p[3]).fold(0.0, f32::max));
        }
        assert!(brightest > 0.9, "a strike should land within a few seconds");
    }

    #[test]
    fn fire_is_hotter_at_bottom() {
        let mut f = Fire::new(6, 22);
        let (mut top, mut bottom) = (0.0, 0.0);
        for _ in 0..200 {
            f.step(0.22, 0.6);
            for c in 0..22 {
                top += f.heat_at(0, c);
                bottom += f.heat_at(5, c);
            }
            assert!(f.heat.iter().all(|h| (0.0..=1.0).contains(h)));
        }
        assert!(bottom > top * 2.0);
    }

    #[test]
    fn reactive_lights_pressed_key_then_fades() {
        let e = LayerEffect::Reactive { color: [255, 0, 0], fade_ms: 200, trigger: Trigger::Keys };
        let mut s = State::new(&e, 6, 22);
        let mut out = vec![[0.0; 4]; 6 * 22];
        let hit = [Hit { source: Source::Key, pos: Some((2.0, 5.0)) }];
        assert!(render(&e, &mut s, &ctx(6, 22, &hit), &mut out));
        assert_eq!(out[2 * 22 + 5][3], 1.0);
        assert_eq!(out[0][3], 0.0);
        // clicks don't trigger a keys-only layer
        let click = [Hit { source: Source::Click, pos: None }];
        let mut s2 = State::new(&e, 6, 22);
        render(&e, &mut s2, &ctx(6, 22, &click), &mut out);
        assert!(out.iter().all(|p| p[3] == 0.0));
        // fades out
        for _ in 0..10 {
            render(&e, &mut s, &ctx(6, 22, &[]), &mut out);
        }
        assert_eq!(out[2 * 22 + 5][3], 0.0);
    }

    #[test]
    fn ripple_expands_and_dies() {
        let e = LayerEffect::Ripple { color: [255, 255, 255], speed: 14.0, width: 1.4, trigger: Trigger::Both };
        let mut s = State::new(&e, 6, 22);
        let mut out = vec![[0.0; 4]; 6 * 22];
        let hit = [Hit { source: Source::Click, pos: None }];
        assert!(render(&e, &mut s, &ctx(6, 22, &hit), &mut out));
        let mut frames = 0;
        while render(&e, &mut s, &ctx(6, 22, &[]), &mut out) {
            frames += 1;
            assert!(frames < 200, "ripple never finished");
        }
    }

    #[test]
    fn blend_modes() {
        let d = [100.0, 100.0, 100.0];
        assert_eq!(blend(d, [200.0, 0.0, 0.0, 1.0], Blend::Normal, 1.0), [200.0, 0.0, 0.0]);
        assert_eq!(blend(d, [200.0, 0.0, 0.0, 0.0], Blend::Normal, 1.0), d);
        assert_eq!(blend(d, [200.0, 0.0, 0.0, 1.0], Blend::Add, 1.0)[0], 255.0);
        assert_eq!(blend(d, [255.0, 255.0, 255.0, 1.0], Blend::Multiply, 1.0), d);
        assert_eq!(blend(d, [50.0, 200.0, 0.0, 1.0], Blend::Lighten, 1.0), [100.0, 200.0, 100.0]);
    }

    #[test]
    fn palette_endpoints() {
        let classic = fire_stops(Palette::Classic, &[]);
        assert_eq!(sample_stops(&classic, 0.0), [0.0, 0.0, 0.0]);
        assert_eq!(sample_stops(&classic, 1.0), [255.0, 230.0, 120.0]);
    }

    #[test]
    fn custom_palette_any_stop_count() {
        let three = fire_stops(Palette::Custom, &[[0, 0, 0], [0, 0, 200], [255, 255, 255]]);
        assert_eq!(sample_stops(&three, 0.5), [0.0, 0.0, 200.0]);
        assert_eq!(sample_stops(&three, 0.75), [127.5, 127.5, 227.5]);
        assert_eq!(sample_stops(&three, 1.0), [255.0, 255.0, 255.0]);
    }
}
