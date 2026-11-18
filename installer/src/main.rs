//! Chroma Lite Setup: a small installer (and uninstaller) for Windows, macOS
//! and Linux, with the app baked in.
//!
//! `chroma-lite-setup`                       install, update, or uninstall
//! `chroma-lite-setup --uninstall`           remove (what Apps & features runs)
//! `chroma-lite-setup --uninstall --quiet`   remove without asking

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod keyboard;
mod ops;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use eframe::egui::{
    self, Align, Color32, CornerRadius, FontId, Layout, Pos2, Rect, RichText, Sense, Stroke, TextStyle, UiBuilder, Vec2,
};
use keyboard::{Keyboard, Mood};

// Aalto, dark scheme (the same tokens as the app).
const BG: Color32 = Color32::from_rgb(0x1a, 0x12, 0x0c); // surface
const SIDE: Color32 = Color32::from_rgb(0x23, 0x1a, 0x13); // surface-container-low
const CARD: Color32 = Color32::from_rgb(0x32, 0x28, 0x21); // surface-container-high
const CARD_HOVER: Color32 = Color32::from_rgb(0x3e, 0x33, 0x2b); // surface-container-highest
const PRIMARY: Color32 = Color32::from_rgb(0xff, 0xb5, 0x98);
const PRIMARY_HOVER: Color32 = Color32::from_rgb(0xff, 0xc8, 0xb2);
const ON_PRIMARY: Color32 = Color32::from_rgb(0x59, 0x1c, 0x00);
const TEAL: Color32 = Color32::from_rgb(0x6a, 0xd9, 0xc1); // tertiary
const CREAM: Color32 = Color32::from_rgb(0xf1, 0xdf, 0xd4); // on-surface
const SOFT: Color32 = Color32::from_rgb(0xe2, 0xbf, 0xaf); // on-surface-variant
const MUTED: Color32 = Color32::from_rgb(0xa9, 0x8a, 0x7c); // outline
const ERROR: Color32 = Color32::from_rgb(0xff, 0xb4, 0xab);

const SIZE: Vec2 = Vec2::new(680.0, 480.0);
const SIDE_W: f32 = 256.0;

fn main() -> eframe::Result {
    let args: Vec<String> = std::env::args().collect();
    let has = |flag: &str| args.iter().any(|a| a == flag);
    let after = |flag: &str| args.iter().position(|a| a == flag).and_then(|i| args.get(i + 1)).cloned();

    let mode = if has("--uninstall") {
        let dir = after("--dir")
            .map(PathBuf::from)
            .or_else(|| ops::installed().map(|i| i.dir))
            .or_else(|| std::env::current_exe().ok().and_then(|p| p.parent().map(PathBuf::from)))
            .unwrap_or_else(ops::default_dir);
        if !has("--relaunched") && ops::relaunch_for_uninstall(&dir, has("--quiet")) {
            return Ok(());
        }
        if has("--quiet") {
            let _ = ops::uninstall(&dir, false, &|_, _| {});
            if has("--relaunched") {
                ops::delete_self_later();
            }
            return Ok(());
        }
        Mode::Uninstall { dir, temp_copy: has("--relaunched") }
    } else {
        Mode::Install
    };

    let icon = image::load_from_memory(include_bytes!("../../src-tauri/icons/128x128.png"))
        .ok()
        .map(|i| i.to_rgba8())
        .map(|i| egui::IconData { width: i.width(), height: i.height(), rgba: i.into_raw() });
    let mut viewport = egui::ViewportBuilder::default()
        .with_title(match mode {
            Mode::Install => "Chroma Lite Setup",
            Mode::Uninstall { .. } => "Uninstall Chroma Lite",
        })
        .with_app_id("chroma-lite-setup")
        .with_inner_size(SIZE)
        .with_resizable(false)
        .with_maximize_button(false);
    if let Some(icon) = icon {
        viewport = viewport.with_icon(icon);
    }
    let options = eframe::NativeOptions { viewport, centered: true, ..Default::default() };
    eframe::run_native("Chroma Lite Setup", options, Box::new(|cc| Ok(Box::new(Setup::new(cc, mode)))))
}

enum Mode {
    Install,
    Uninstall { dir: PathBuf, temp_copy: bool },
}

/// The install or uninstall, run on a worker thread; it reports progress
/// through the callback. Ok carries an optional note for the last page.
type Work = Box<dyn FnOnce(&dyn Fn(f32, &str)) -> Result<Option<String>, String> + Send>;

#[derive(Clone, PartialEq)]
enum Job {
    Idle,
    Running {
        frac: f32,
        what: String,
    },
    /// Finished, maybe with a note (something optional didn't work).
    Done(Option<String>),
    Failed(String),
}

struct Setup {
    mode: Mode,
    opts: ops::Options,
    existing: Option<ops::Installed>,
    missing: Option<ops::Missing>,
    show_options: bool,
    delete_data: bool,
    launch_after: bool,
    job: Arc<Mutex<Job>>,
    keyboard: Keyboard,
    last_t: f64,
}

impl Setup {
    fn new(cc: &eframe::CreationContext<'_>, mode: Mode) -> Self {
        style(&cc.egui_ctx);
        let existing = ops::installed();
        let opts = ops::default_options(existing.as_ref());
        Self {
            mode,
            opts,
            existing,
            missing: ops::missing(),
            show_options: false,
            delete_data: false,
            launch_after: true,
            job: Arc::new(Mutex::new(Job::Idle)),
            keyboard: Keyboard::new(),
            last_t: 0.0,
        }
    }

    fn job(&self) -> Job {
        self.job.lock().unwrap().clone()
    }

    fn start(&self, ctx: &egui::Context) {
        let job = self.job.clone();
        let ctx = ctx.clone();
        *job.lock().unwrap() = Job::Running { frac: 0.0, what: "Starting\u{2026}".into() };
        let work: Work = match &self.mode {
            Mode::Install => {
                let o = self.opts.clone();
                Box::new(move |p| ops::install(&o, p))
            }
            Mode::Uninstall { dir, .. } => {
                let (dir, data) = (dir.clone(), self.delete_data);
                Box::new(move |p| ops::uninstall(&dir, data, p))
            }
        };
        std::thread::spawn(move || {
            let report = |frac: f32, what: &str| {
                *job.lock().unwrap() = Job::Running { frac, what: what.to_owned() };
                ctx.request_repaint();
            };
            let result = work(&report);
            // Linger a moment so the bar is seen to finish.
            std::thread::sleep(std::time::Duration::from_millis(350));
            *job.lock().unwrap() = match result {
                Ok(note) => Job::Done(note),
                Err(e) => Job::Failed(e),
            };
            ctx.request_repaint();
        });
    }

    fn finish(&self, ctx: &egui::Context) {
        if matches!(self.mode, Mode::Install) && self.launch_after {
            ops::launch(&self.opts.dir);
        }
        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
    }

    fn mood(&self, job: &Job) -> Mood {
        match (&self.mode, job) {
            (_, Job::Failed(_)) => Mood::Hurt,
            (Mode::Uninstall { .. }, _) => Mood::Fading,
            (Mode::Install, Job::Running { .. }) => Mood::Busy,
            (Mode::Install, _) => Mood::Calm,
        }
    }
}

impl eframe::App for Setup {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        let job = self.job();
        let full = ui.max_rect();
        let painter = ui.painter().clone();
        painter.rect_filled(full, 0.0, BG);

        // Left: the keyboard and mouse, lit by the fire effect.
        let side = Rect::from_min_max(full.min, Pos2::new(full.min.x + SIDE_W, full.max.y));
        painter.rect_filled(side, 0.0, SIDE);
        let t = ctx.input(|i| i.time);
        let dt = (t - self.last_t).clamp(0.0, 0.1) as f32;
        self.last_t = t;
        let mood = self.mood(&job);
        self.keyboard.update(dt, mood);
        self.keyboard.paint(&painter, side.center(), mood);
        painter.text(
            Pos2::new(side.center().x, side.max.y - 22.0),
            egui::Align2::CENTER_CENTER,
            format!("v{}", ops::VERSION),
            FontId::proportional(12.0),
            MUTED,
        );
        ctx.request_repaint(); // keep the fire going

        // Right: the words and buttons.
        let content =
            Rect::from_min_max(Pos2::new(side.max.x + 34.0, full.min.y + 30.0), full.max - Vec2::new(30.0, 26.0));
        ui.scope_builder(UiBuilder::new().max_rect(content), |ui| match (&self.mode, job) {
            (Mode::Install, Job::Idle) => self.install_page(ui),
            (Mode::Uninstall { dir, .. }, Job::Idle) => {
                let dir = dir.clone();
                self.uninstall_page(ui, &dir)
            }
            (_, Job::Running { frac, what }) => working_page(ui, &self.mode, frac, &what),
            (_, Job::Done(note)) => self.done_page(ui, note.as_deref()),
            (_, Job::Failed(e)) => self.failed_page(ui, &e),
        });
    }

    fn on_exit(&mut self, _gl: Option<&eframe::glow::Context>) {
        if let Mode::Uninstall { temp_copy: true, .. } = self.mode {
            ops::delete_self_later();
        }
    }
}

impl Setup {
    fn install_page(&mut self, ui: &mut egui::Ui) {
        let ctx = ui.ctx().clone();
        let f = &ops::FEATURES;
        title(ui, "Chroma Lite", "Lighting for Razer gear, without Synapse.");
        ui.add_space(14.0);
        let blurb = match &self.existing {
            Some(e) if e.version == ops::VERSION => {
                format!("Chroma Lite {} is already installed. You can reinstall it to repair it.", e.version)
            }
            Some(e) => format!("Chroma Lite {} is installed. This updates it to {}. Your layers and settings stay.", e.version, ops::VERSION),
            None => "Fire, aurora, ripples and more on your keyboard and mouse, lights off when you're away, and next to no CPU.".into(),
        };
        ui.label(RichText::new(blurb).color(SOFT));
        if let Some(m) = &self.missing {
            ui.add_space(10.0);
            ui.label(RichText::new(&m.message).color(ERROR).small());
            if let Some(url) = m.link {
                if ui
                    .add(egui::Label::new(RichText::new("Get it \u{2192}").color(TEAL)).sense(Sense::click()))
                    .on_hover_cursor(egui::CursorIcon::PointingHand)
                    .clicked()
                {
                    ops::open_link(url);
                }
            }
        }
        ui.add_space(14.0);

        toggle(ui, &mut self.opts.autostart, "Start Chroma Lite when I log in");
        if f.desktop_shortcut {
            toggle(ui, &mut self.opts.desktop_shortcut, "Put a shortcut on my desktop");
        }
        if f.device_access && !ops::device_access_ready() {
            toggle(ui, &mut self.opts.device_access, "Let it reach Razer devices (asks for your password)");
        }
        if f.menu_entry.is_some() || f.choose_dir {
            ui.add_space(6.0);
            let more = if self.show_options { "\u{2212} Fewer options" } else { "+ More options" };
            if ui
                .add(egui::Label::new(RichText::new(more).color(MUTED)).sense(Sense::click()))
                .on_hover_cursor(egui::CursorIcon::PointingHand)
                .clicked()
            {
                self.show_options = !self.show_options;
            }
        }
        if self.show_options {
            ui.add_space(4.0);
            if let Some(label) = f.menu_entry {
                toggle(ui, &mut self.opts.menu_entry, label);
            }
            if f.choose_dir {
                ui.horizontal(|ui| {
                    ui.label(RichText::new("Install to").color(MUTED));
                    let mut s = self.opts.dir.display().to_string();
                    if ui.add(egui::TextEdit::singleline(&mut s).desired_width(f32::INFINITY)).changed() {
                        self.opts.dir = PathBuf::from(s);
                    }
                });
            }
        }

        ui.with_layout(Layout::bottom_up(Align::Max), |ui| {
            if !ops::has_payload() {
                ui.label(
                    RichText::new("This is a development build of the installer with no app inside.")
                        .color(ERROR)
                        .small(),
                );
                return;
            }
            ui.horizontal(|ui| {
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    let label = if self.existing.is_some() { "Update" } else { "Install" };
                    if big_button(ui, label).clicked() {
                        self.start(&ctx);
                    }
                    if let Some(e) = &self.existing {
                        if quiet_button(ui, "Uninstall").clicked() {
                            self.mode = Mode::Uninstall { dir: e.dir.clone(), temp_copy: false };
                        }
                    }
                });
            });
        });
    }

    fn uninstall_page(&mut self, ui: &mut egui::Ui, dir: &std::path::Path) {
        let ctx = ui.ctx().clone();
        title(ui, "Uninstall Chroma Lite?", "It'll stop running your lights.");
        ui.add_space(14.0);
        ui.label(RichText::new(format!("This removes Chroma Lite from\n{}", dir.display())).color(SOFT));
        ui.add_space(14.0);
        toggle(ui, &mut self.delete_data, "Also forget my layers and settings");
        ui.with_layout(Layout::bottom_up(Align::Max), |ui| {
            ui.horizontal(|ui| {
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if big_button(ui, "Uninstall").clicked() {
                        self.start(&ctx);
                    }
                    if quiet_button(ui, "Keep it").clicked() {
                        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                    }
                });
            });
        });
    }

    fn done_page(&mut self, ui: &mut egui::Ui, note: Option<&str>) {
        let ctx = ui.ctx().clone();
        match self.mode {
            Mode::Install => {
                title(ui, "All set", "Chroma Lite is installed.");
                ui.add_space(14.0);
                let tray = ops::FEATURES.tray;
                ui.label(
                    RichText::new(format!(
                        "It lives in your {tray}: click its icon to open the settings, right-click it to quit.\n\n\
                         Close Razer Synapse first if it's running. The two fight over the lights."
                    ))
                    .color(SOFT),
                );
                if let Some(n) = note {
                    ui.add_space(10.0);
                    ui.label(RichText::new(n).color(ERROR).small());
                }
                ui.add_space(14.0);
                toggle(ui, &mut self.launch_after, "Open Chroma Lite now");
            }
            Mode::Uninstall { .. } => {
                title(ui, "Chroma Lite is gone.", "Thanks for trying it.");
                if let Some(n) = note {
                    ui.add_space(14.0);
                    ui.label(RichText::new(n).color(ERROR).small());
                }
            }
        }
        ui.with_layout(Layout::bottom_up(Align::Max), |ui| {
            if big_button(ui, "Finish").clicked() {
                self.finish(&ctx);
            }
        });
    }

    fn failed_page(&mut self, ui: &mut egui::Ui, err: &str) {
        let ctx = ui.ctx().clone();
        title(ui, "That didn't work", "Nothing's been left half done.");
        ui.add_space(14.0);
        ui.label(RichText::new(err).color(ERROR));
        ui.with_layout(Layout::bottom_up(Align::Max), |ui| {
            ui.horizontal(|ui| {
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if big_button(ui, "Try again").clicked() {
                        self.start(&ctx);
                    }
                    if quiet_button(ui, "Close").clicked() {
                        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                    }
                });
            });
        });
    }
}

fn working_page(ui: &mut egui::Ui, mode: &Mode, frac: f32, what: &str) {
    match mode {
        Mode::Install => title(ui, "Installing\u{2026}", "This only takes a moment."),
        Mode::Uninstall { .. } => title(ui, "Uninstalling\u{2026}", "This only takes a moment."),
    }
    ui.add_space(40.0);
    ui.add(egui::ProgressBar::new(frac).fill(PRIMARY).corner_radius(6).desired_height(12.0));
    ui.add_space(8.0);
    ui.label(RichText::new(what).color(MUTED).small());
}

fn title(ui: &mut egui::Ui, big: &str, small: &str) {
    ui.label(RichText::new(big).size(30.0).strong().color(CREAM));
    ui.label(RichText::new(small).size(15.0).color(TEAL));
}

fn big_button(ui: &mut egui::Ui, text: &str) -> egui::Response {
    pill_button(ui, text, Vec2::new(150.0, 44.0), PRIMARY, PRIMARY_HOVER, ON_PRIMARY, true)
}

fn quiet_button(ui: &mut egui::Ui, text: &str) -> egui::Response {
    pill_button(ui, text, Vec2::new(120.0, 44.0), CARD, CARD_HOVER, CREAM, false)
}

/// A fully rounded button with its label centred (egui's own buttons follow
/// the surrounding layout's alignment).
fn pill_button(
    ui: &mut egui::Ui,
    text: &str,
    size: Vec2,
    fill: Color32,
    hover: Color32,
    ink: Color32,
    bold: bool,
) -> egui::Response {
    let (rect, resp) = ui.allocate_exact_size(size, Sense::click());
    let resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);
    let p = ui.painter();
    p.rect_filled(rect, size.y / 2.0, if resp.hovered() { hover } else { fill });
    let font = FontId::proportional(if bold { 16.0 } else { 15.0 });
    let galley = ui.painter().layout_no_wrap(text.to_owned(), font, ink);
    let at = rect.center() - galley.size() / 2.0;
    if bold {
        // fake bold: a second pass a hair to the right
        ui.painter().galley(at + Vec2::new(0.6, 0.0), galley.clone(), ink);
    }
    ui.painter().galley(at, galley, ink);
    resp
}

/// A switch row, Material style.
fn toggle(ui: &mut egui::Ui, on: &mut bool, label: &str) {
    ui.horizontal(|ui| {
        let (rect, resp) = ui.allocate_exact_size(Vec2::new(40.0, 24.0), Sense::click());
        let resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);
        if resp.clicked() {
            *on = !*on;
        }
        let k = ui.ctx().animate_bool_responsive(resp.id, *on);
        let p = ui.painter();
        if *on {
            p.rect_filled(rect, 12.0, PRIMARY);
        } else {
            p.rect_filled(rect, 12.0, if resp.hovered() { CARD_HOVER } else { CARD });
            p.rect_stroke(rect, 12.0, Stroke::new(1.5, MUTED), egui::StrokeKind::Inside);
        }
        let x = egui::lerp(rect.left() + 12.0..=rect.right() - 12.0, k);
        let (r, c) = if *on { (8.0, ON_PRIMARY) } else { (6.0, MUTED) };
        p.circle_filled(Pos2::new(x, rect.center().y), r, c);
        let text = ui.add(egui::Label::new(RichText::new(label).color(CREAM).size(15.0)).sense(Sense::click()));
        if text.clicked() {
            *on = !*on;
        }
    });
    ui.add_space(4.0);
}

fn style(ctx: &egui::Context) {
    ctx.set_theme(egui::Theme::Dark);
    ctx.all_styles_mut(|s| {
        s.text_styles.insert(TextStyle::Body, FontId::proportional(15.0));
        s.text_styles.insert(TextStyle::Button, FontId::proportional(15.0));
        s.text_styles.insert(TextStyle::Small, FontId::proportional(12.5));
        s.spacing.item_spacing = Vec2::new(8.0, 6.0);
        let v = &mut s.visuals;
        v.panel_fill = BG;
        v.window_fill = BG;
        v.extreme_bg_color = CARD;
        v.override_text_color = Some(CREAM);
        v.selection.bg_fill = PRIMARY;
        v.selection.stroke = Stroke::new(1.0, CREAM);
        for w in [&mut v.widgets.inactive, &mut v.widgets.hovered, &mut v.widgets.active] {
            w.corner_radius = CornerRadius::same(8);
            w.bg_stroke = Stroke::NONE;
        }
        v.widgets.inactive.weak_bg_fill = CARD;
        v.widgets.hovered.weak_bg_fill = CARD_HOVER;
        v.widgets.active.weak_bg_fill = CARD_HOVER;
    });
}
