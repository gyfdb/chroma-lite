//! The little keyboard and mouse on the left of the installer, running a
//! fire effect that follows what Setup is doing: a calm flame while it
//! waits, roaring while it works, embers while it uninstalls.

use eframe::egui::{Color32, CornerRadius, Painter, Pos2, Rect, Vec2};

const ROWS: usize = 6;
const COLS: usize = 22;
/// Two rows under the keyboard where the fire is fed, like in the app.
const HIDDEN: usize = 2;
const STEP: f32 = 1.0 / 30.0;

const PANEL: Color32 = Color32::from_rgb(0x15, 0x0c, 0x07);
const LED_OFF: Color32 = Color32::from_rgb(0x3e, 0x33, 0x2b);

#[derive(Clone, Copy, PartialEq)]
pub enum Mood {
    /// Waiting for a click: a steady campfire.
    Calm,
    /// Installing: roaring.
    Busy,
    /// Uninstalling, or uninstalled: dying down to embers.
    Fading,
    /// Something went wrong: low and red.
    Hurt,
}

pub struct Keyboard {
    heat: Vec<f32>,
    acc: f32,
    rng: fastrand::Rng,
}

impl Keyboard {
    pub fn new() -> Self {
        let mut k = Self { heat: vec![0.0; (ROWS + HIDDEN) * COLS], acc: 0.0, rng: fastrand::Rng::with_seed(7) };
        // warm it up so it opens already burning
        for _ in 0..60 {
            k.step(Mood::Calm);
        }
        k
    }

    fn at(&self, r: usize, c: usize) -> f32 {
        self.heat[r * COLS + c]
    }

    /// Advance by `dt` seconds, in fixed steps so the speed doesn't depend on
    /// the frame rate.
    pub fn update(&mut self, dt: f32, mood: Mood) {
        self.acc = (self.acc + dt).min(0.25);
        while self.acc >= STEP {
            self.acc -= STEP;
            self.step(mood);
        }
    }

    fn step(&mut self, mood: Mood) {
        let (sparks, cooling) = match mood {
            Mood::Calm => (0.6, 0.095),
            Mood::Busy => (0.95, 0.075),
            Mood::Fading => (0.18, 0.16),
            Mood::Hurt => (0.3, 0.14),
        };
        let h = ROWS + HIDDEN;
        // feed the hidden rows
        for r in ROWS..h {
            for c in 0..COLS {
                let i = r * COLS + c;
                self.heat[i] = if self.rng.f32() < sparks { 0.75 + 0.25 * self.rng.f32() } else { self.heat[i] * 0.55 };
            }
        }
        // heat rises: each cell takes the average of the cells under it, minus a bit
        for r in 0..ROWS {
            for c in 0..COLS {
                let l = c.saturating_sub(1);
                let rr = (c + 1).min(COLS - 1);
                let below =
                    (self.at(r + 1, l) + self.at(r + 1, c) + self.at(r + 1, rr) + self.at((r + 2).min(h - 1), c)) / 4.0;
                let v = below - cooling * (0.4 + self.rng.f32());
                self.heat[r * COLS + c] = v.max(0.0) * 1.04;
            }
        }
    }

    pub fn paint(&self, p: &Painter, centre: Pos2, mood: Mood) {
        let key = 8.0;
        let gap = 1.6;
        let pitch = key + gap;
        let board = Vec2::new(COLS as f32 * pitch - gap, ROWS as f32 * pitch - gap);
        let pad = 10.0;
        let panel = Rect::from_center_size(centre - Vec2::new(0.0, 14.0), board + Vec2::splat(pad * 2.0));
        p.rect_filled(panel.translate(Vec2::new(0.0, 4.0)), 12.0, Color32::from_black_alpha(70));
        p.rect_filled(panel, 12.0, PANEL);
        let origin = panel.min + Vec2::splat(pad);
        let mut glow = [0.0f32; 3];
        for r in 0..ROWS {
            for c in 0..COLS {
                let color = heat_color(self.at(r, c), mood);
                for (g, v) in glow.iter_mut().zip([color.r(), color.g(), color.b()]) {
                    *g += v as f32;
                }
                let min = origin + Vec2::new(c as f32 * pitch, r as f32 * pitch);
                p.rect_filled(Rect::from_min_size(min, Vec2::splat(key)), CornerRadius::same(2), lit(color));
            }
        }

        // the mouse, glowing the board's average colour
        let n = (ROWS * COLS) as f32;
        let avg = Color32::from_rgb(
            (glow[0] / n * 1.6).min(255.0) as u8,
            (glow[1] / n * 1.6).min(255.0) as u8,
            (glow[2] / n * 1.6).min(255.0) as u8,
        );
        let mouse = Rect::from_center_size(Pos2::new(centre.x, panel.max.y + 46.0), Vec2::new(30.0, 46.0));
        p.rect_filled(mouse.translate(Vec2::new(0.0, 3.0)), 15.0, Color32::from_black_alpha(70));
        p.rect_filled(mouse, 15.0, PANEL);
        p.rect_filled(
            Rect::from_center_size(mouse.center() + Vec2::new(0.0, 8.0), Vec2::new(12.0, 12.0)),
            6.0,
            lit(avg),
        );
        p.line_segment(
            [Pos2::new(mouse.center().x, mouse.min.y + 4.0), Pos2::new(mouse.center().x, mouse.min.y + 16.0)],
            (1.2, LED_OFF),
        );
    }
}

/// An LED: its colour, or the dark unlit key when it's barely on.
fn lit(c: Color32) -> Color32 {
    let lum = (c.r() as f32 * 0.3 + c.g() as f32 * 0.59 + c.b() as f32 * 0.11) / 255.0;
    let t = (lum * 2.2).min(1.0);
    let mix = |a: u8, b: u8| (a as f32 + (b as f32 - a as f32) * t) as u8;
    Color32::from_rgb(mix(LED_OFF.r(), c.r()), mix(LED_OFF.g(), c.g()), mix(LED_OFF.b(), c.b()))
}

/// Chroma Lite's "classic" fire palette; a deep red one when something failed.
fn heat_color(h: f32, mood: Mood) -> Color32 {
    let stops: &[[f32; 3]] = match mood {
        Mood::Hurt => &[[0.0, 0.0, 0.0], [90.0, 0.0, 0.0], [200.0, 20.0, 10.0], [255.0, 70.0, 40.0]],
        _ => &[[0.0, 0.0, 0.0], [130.0, 0.0, 0.0], [255.0, 45.0, 0.0], [255.0, 140.0, 0.0], [255.0, 230.0, 120.0]],
    };
    let x = h.clamp(0.0, 1.0) * (stops.len() - 1) as f32;
    let i = (x as usize).min(stops.len() - 2);
    let f = x - i as f32;
    let (a, b) = (stops[i], stops[i + 1]);
    let c = |k: usize| (a[k] + (b[k] - a[k]) * f) as u8;
    Color32::from_rgb(c(0), c(1), c(2))
}
