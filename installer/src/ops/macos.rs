//! macOS: the app bundle goes in /Applications (or ~/Applications when
//! /Applications isn't writable), and "start at login" is a LaunchAgent.
//!
//! The app is unpacked from inside this installer, so it never picks up the
//! quarantine flag: only Setup itself needs the right-click > Open the first
//! time.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use super::{home, remove_dir, unpack, Features, Installed, Missing, Options, APP_NAME, IDENTIFIER};

pub const FEATURES: Features =
    Features { desktop_shortcut: false, menu_entry: None, device_access: false, choose_dir: false, tray: "menu bar" };

const BUNDLE: &str = "Chroma Lite.app";

fn launch_agent() -> PathBuf {
    home().join("Library/LaunchAgents").join(format!("{IDENTIFIER}.plist"))
}

fn writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".chroma-lite-probe-{}", std::process::id()));
    let ok = std::fs::write(&probe, b"").is_ok();
    let _ = std::fs::remove_file(probe);
    ok
}

pub fn default_dir() -> PathBuf {
    let system = PathBuf::from("/Applications");
    if writable(&system) {
        system
    } else {
        home().join("Applications")
    }
}

/// A value from the app's Info.plist (the XML kind Tauri writes).
fn plist_value(app: &Path, key: &str) -> Option<String> {
    let xml = std::fs::read_to_string(app.join("Contents/Info.plist")).ok()?;
    let after = xml.split(&format!("<key>{key}</key>")).nth(1)?;
    let start = after.find("<string>")? + "<string>".len();
    let end = after[start..].find("</string>")?;
    Some(after[start..start + end].trim().to_owned())
}

pub fn installed() -> Option<Installed> {
    [PathBuf::from("/Applications"), home().join("Applications")].into_iter().find_map(|dir| {
        let app = dir.join(BUNDLE);
        app.exists().then(|| Installed {
            version: plist_value(&app, "CFBundleShortVersionString").unwrap_or_else(|| "?".into()),
            dir,
        })
    })
}

pub fn has_desktop_shortcut() -> bool {
    false
}

pub fn has_menu_entry() -> bool {
    false
}

pub fn autostart_enabled() -> bool {
    launch_agent().exists()
}

pub fn device_access_ready() -> bool {
    true
}

pub fn missing() -> Option<Missing> {
    None
}

fn exe_in(app: &Path) -> PathBuf {
    let name = plist_value(app, "CFBundleExecutable").unwrap_or_else(|| "chroma-lite".into());
    app.join("Contents/MacOS").join(name)
}

fn running(pattern: &str) -> bool {
    Command::new("pgrep").args(["-f", pattern]).stdout(Stdio::null()).status().is_ok_and(|s| s.success())
}

/// Ask a running Chroma Lite to quit, and make sure it's gone so the bundle
/// can be replaced.
fn stop_running_app() {
    let pattern = format!("{BUNDLE}/Contents/MacOS/");
    if !running(&pattern) {
        return;
    }
    let _ = Command::new("pkill").args(["-TERM", "-f", &pattern]).status();
    let start = Instant::now();
    while running(&pattern) && start.elapsed() < Duration::from_secs(4) {
        std::thread::sleep(Duration::from_millis(100));
    }
    if running(&pattern) {
        let _ = Command::new("pkill").args(["-KILL", "-f", &pattern]).status();
        std::thread::sleep(Duration::from_millis(300));
    }
}

fn agent_plist(exe: &Path) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{IDENTIFIER}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{}</string>
    <string>--tray</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Interactive</string>
</dict>
</plist>
"#,
        exe.display()
    )
}

pub fn install(o: &Options, progress: &dyn Fn(f32, &str)) -> Result<Option<String>, String> {
    progress(0.02, "Closing Chroma Lite if it's running\u{2026}");
    stop_running_app();

    std::fs::create_dir_all(&o.dir).map_err(|e| format!("couldn't create {}: {e}", o.dir.display()))?;
    // Unpack next to the old app, then swap, so a failed unpack leaves the
    // old one working.
    let staging = o.dir.join(format!(".chroma-lite-install-{}", std::process::id()));
    progress(0.05, "Unpacking\u{2026}");
    let unpacked = unpack(&staging, &|f, what| progress(0.05 + 0.7 * f, what));
    let fresh = staging.join(BUNDLE);
    if let Err(e) = unpacked {
        let _ = remove_dir(&staging);
        return Err(e);
    }
    if !fresh.exists() {
        let _ = remove_dir(&staging);
        return Err("the installer is damaged: there's no app inside".into());
    }
    progress(0.8, "Moving it into place\u{2026}");
    let app = o.dir.join(BUNDLE);
    remove_dir(&app)?;
    std::fs::rename(&fresh, &app).map_err(|e| format!("couldn't move the app into {}: {e}", o.dir.display()))?;
    let _ = remove_dir(&staging);
    // tell Launch Services about the new version
    let _ = Command::new("touch").arg(&app).status();

    progress(0.9, "Setting up login items\u{2026}");
    let agent = launch_agent();
    if o.autostart {
        if let Some(parent) = agent.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&agent, agent_plist(&exe_in(&app)))
            .map_err(|e| format!("couldn't write {}: {e}", agent.display()))?;
    } else {
        let _ = std::fs::remove_file(&agent);
    }
    progress(1.0, "Done");
    Ok(None)
}

pub fn uninstall(dir: &Path, delete_data: bool, progress: &dyn Fn(f32, &str)) -> Result<Option<String>, String> {
    progress(0.05, "Closing Chroma Lite if it's running\u{2026}");
    stop_running_app();
    progress(0.3, "Removing the login item\u{2026}");
    let _ = std::fs::remove_file(launch_agent());
    progress(0.5, "Removing the app\u{2026}");
    let app = dir.join(BUNDLE);
    // Only ever delete something that really is the Chroma Lite bundle.
    if plist_value(&app, "CFBundleName").as_deref() == Some(APP_NAME)
        || plist_value(&app, "CFBundleIdentifier").as_deref() == Some(IDENTIFIER)
    {
        remove_dir(&app)?;
    }
    if delete_data {
        progress(0.8, "Removing your settings\u{2026}");
        let lib = home().join("Library");
        for d in ["Application Support", "Caches", "WebKit"] {
            remove_dir(&lib.join(d).join(IDENTIFIER))?;
        }
    }
    progress(1.0, "Done");
    Ok(None)
}

pub fn launch(dir: &Path) {
    let _ = Command::new("open").arg(dir.join(BUNDLE)).spawn();
}

pub fn open_link(url: &str) {
    let _ = Command::new("open").arg(url).spawn();
}

/// Windows only: the uninstaller runs from a temp copy. Nothing to do here.
pub fn relaunch_for_uninstall(_dir: &Path, _quiet: bool) -> bool {
    false
}

pub fn delete_self_later() {}
