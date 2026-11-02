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
}

impl Ctx<'_> {
    fn center(&self) -> (f32, f32) {
        ((self.rows as f32 - 1.0) / 2.0, (self.cols as f32 - 1.0) / 2.0)
    }
    fn hits_for(&self, trigger: Trigger) -> impl Iterator<Item = &Hit> {
        self.hits.iter().filter(move |h| match h.source {
            Source::Key => trigger.keys(),
            Source::Click => trigger.clicks(),
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
}

impl Fire {
    pub fn new(rows: usize, cols: usize) -> Self {
        let height = rows + HIDDEN_ROWS;
        Self { rows, cols, height, heat: vec![0.0; height * cols], rng: Rng::new() }
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

/// Per-layer memory that carries over between frames.
pub enum State {
    Stateless,
    Fire(Fire),
    /// Per-LED intensity 0..1 (reactive, starlight).
    Field(Vec<f32>, Rng),
    Rings(Vec<Ring>),
}

impl State {
    pub fn new(effect: &LayerEffect, rows: usize, cols: usize) -> Self {
        match effect {
            LayerEffect::Fire { .. } => State::Fire(Fire::new(rows, cols)),
            LayerEffect::Reactive { .. } | LayerEffect::Starlight { .. } => {
                State::Field(vec![0.0; rows * cols], Rng::new())
            }
            LayerEffect::Ripple { .. } => State::Rings(Vec::new()),
            _ => State::Stateless,
        }
    }

    /// Whether this state still works for `effect` on a rows×cols matrix.
    pub fn fits(&self, effect: &LayerEffect, rows: usize, cols: usize) -> bool {
        match (self, effect) {
            (State::Fire(f), LayerEffect::Fire { .. }) => f.rows == rows && f.cols == cols,
            (State::Field(v, _), LayerEffect::Reactive { .. } | LayerEffect::Starlight { .. }) => {
                v.len() == rows * cols
            }
            (State::Rings(_), LayerEffect::Ripple { .. }) => true,
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

        (LayerEffect::Fire { palette, custom, cooling, sparks, react_to_keys }, State::Fire(fire)) => {
            if *react_to_keys {
                for h in ctx.hits.iter().filter(|h| h.source == Source::Key) {
                    fire.ignite(h.pos);
                }
            }
            fire.step(*cooling, *sparks);
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

        // state doesn't match the effect; the engine rebuilds state on config
        // change, so this lasts one frame at most
        _ => {
            out.fill([0.0; 4]);
            false
        }
    }
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
        Ctx { t: 1.0, dt: 1.0 / 24.0, rows, cols, hits }
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
