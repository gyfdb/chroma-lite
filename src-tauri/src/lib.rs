mod config;
mod engine;
mod idle;
mod input;
mod layers;
mod razer;

use config::Config;
use engine::{Frame, Shared, Status};
use serde::Serialize;
use std::{sync::Arc, time::Duration};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder,
};

type Engine<'a> = State<'a, Arc<Shared>>;

#[tauri::command]
fn get_config(engine: Engine<'_>) -> Config {
    engine.config.lock().unwrap().clone()
}

#[tauri::command]
fn set_config(engine: Engine<'_>, config: Config) -> Result<(), String> {
    config::save(&engine.path, &config).map_err(|e| e.to_string())?;
    engine.update(config);
    Ok(())
}

#[tauri::command]
fn get_status(engine: Engine<'_>) -> Status {
    engine.status.lock().unwrap().clone()
}

#[tauri::command]
fn get_preview(engine: Engine<'_>, index: usize) -> Option<Frame> {
    engine.want_preview();
    engine.previews.lock().unwrap().get(index).cloned().flatten()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Found {
    pid: u16,
    product: String,
    transaction_id: Option<u8>,
    firmware: Option<String>,
}

/// Lists every Razer device and checks which transaction id it answers to.
#[tauri::command]
async fn scan_devices() -> Result<Vec<Found>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let api = hidapi::HidApi::new().map_err(|e| e.to_string())?;
        let mut out: Vec<Found> = Vec::new();
        for d in api.device_list().filter(|d| d.vendor_id() == razer::RAZER_VID) {
            if out.iter().any(|f| f.pid == d.product_id()) {
                continue;
            }
            let probe = razer::TIDS_TO_TRY
                .iter()
                .find_map(|&tid| razer::open(&api, d.product_id(), tid).map(|(_, fw)| (tid, fw)));
            out.push(Found {
                pid: d.product_id(),
                product: d.product_string().unwrap_or("Razer device").to_string(),
                transaction_id: probe.map(|p| p.0),
                firmware: probe.map(|(_, (a, b))| format!("v{a}.{b}")),
            });
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The settings window is created on demand and destroyed on close, so the
/// webview doesn't stay in memory while the app is in the tray.
fn open_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("Chroma Lite")
        .inner_size(1180.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .build();
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = app.path().app_config_dir()?.join("config.json");
            let shared = Arc::new(Shared::new(config::load(&path), path));
            engine::spawn(shared.clone());
            let sink = shared.clone();
            input::spawn(move |ev| sink.push_input(ev));
            app.manage(shared);

            let open = MenuItem::with_id(app, "open", "Open settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;

            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("Chroma Lite")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => open_settings(app),
                    "quit" => {
                        app.state::<Arc<Shared>>().shutdown(Duration::from_secs(1));
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        open_settings(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            // --tray starts hidden, for launching at login
            if !std::env::args().any(|a| a == "--tray") {
                open_settings(app.handle());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_config,
            get_status,
            get_preview,
            scan_devices
        ])
        .build(tauri::generate_context!())
        .expect("error while building Chroma Lite")
        .run(|_app, event| {
            // closing the last window keeps the app running in the tray
            if let RunEvent::ExitRequested { api, code: None, .. } = event {
                api.prevent_exit();
            }
        });
}
