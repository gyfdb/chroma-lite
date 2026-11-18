//! Linux: everything goes in the home folder, freedesktop style.
//!
//! - the app:        ~/.local/share/chroma-lite/chroma-lite (+ VERSION)
//! - on the PATH:    ~/.local/bin/chroma-lite (a symlink)
//! - app menu:       ~/.local/share/applications/chroma-lite.desktop
//! - icon:           ~/.local/share/icons/hicolor/128x128/apps/chroma-lite.png
//! - at login:       ~/.config/autostart/chroma-lite.desktop
//! - device access:  /etc/udev/rules.d/70-chroma-lite.rules, via pkexec
//!
//! The udev rule is the only part that needs a password. Without it the app
//! can't open the devices unless it runs as root.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use super::{home, remove_dir, unpack, Features, Installed, Missing, Options, APP_NAME, IDENTIFIER, VERSION};

pub const FEATURES: Features = Features {
    desktop_shortcut: true,
    menu_entry: Some("Add to the app menu"),
    device_access: true,
    choose_dir: true,
    tray: "tray",
};

const BIN: &str = "chroma-lite";
const RULE_NAME: &str = "70-chroma-lite.rules";
const RULE: &[u8] = include_bytes!("../../../src-tauri/linux/70-chroma-lite.rules");
const ICON: &[u8] = include_bytes!("../../../src-tauri/icons/128x128.png");

fn data_home() -> PathBuf {
    std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".local/share"))
}

fn config_home() -> PathBuf {
    std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".config"))
}

fn cache_home() -> PathBuf {
    std::env::var_os("XDG_CACHE_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".cache"))
}

pub fn default_dir() -> PathBuf {
    data_home().join("chroma-lite")
}

fn menu_file() -> PathBuf {
    data_home().join("applications/chroma-lite.desktop")
}

fn autostart_file() -> PathBuf {
    config_home().join("autostart/chroma-lite.desktop")
}

fn icon_file() -> PathBuf {
    data_home().join("icons/hicolor/128x128/apps/chroma-lite.png")
}

fn path_link() -> PathBuf {
    home().join(".local/bin").join(BIN)
}

/// The desktop folder, as the user's desktop names it (it isn't always ~/Desktop).
fn desktop_file() -> Option<PathBuf> {
    let dir = Command::new("xdg-user-dir")
        .arg("DESKTOP")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| PathBuf::from(String::from_utf8_lossy(&o.stdout).trim()))
        .filter(|p| p.is_dir() && *p != home())
        .or_else(|| Some(home().join("Desktop")).filter(|p| p.is_dir()))?;
    Some(dir.join("chroma-lite.desktop"))
}

/// Where the udev rule can be: the installer puts it in /etc; the .deb/.rpm
/// packages use /usr/lib.
fn rule_paths() -> [PathBuf; 2] {
    [PathBuf::from("/etc/udev/rules.d").join(RULE_NAME), PathBuf::from("/usr/lib/udev/rules.d").join(RULE_NAME)]
}

pub fn device_access_ready() -> bool {
    rule_paths().iter().any(|p| p.exists())
}

pub fn installed() -> Option<Installed> {
    let dir = default_dir();
    dir.join(BIN).exists().then(|| Installed {
        version: std::fs::read_to_string(dir.join("VERSION"))
            .map(|v| v.trim().to_owned())
            .unwrap_or_else(|_| "?".into()),
        dir,
    })
}

pub fn has_desktop_shortcut() -> bool {
    desktop_file().is_some_and(|f| f.exists())
}

pub fn has_menu_entry() -> bool {
    menu_file().exists()
}

pub fn autostart_enabled() -> bool {
    autostart_file().exists()
}

/// WebKitGTK is the one system library the app can't start without.
pub fn missing() -> Option<Missing> {
    let have = |lib: &str| {
        Command::new("ldconfig").arg("-p").output().is_ok_and(|o| String::from_utf8_lossy(&o.stdout).contains(lib))
            || ["/usr/lib", "/usr/lib64", "/usr/lib/x86_64-linux-gnu", "/lib/x86_64-linux-gnu"]
                .iter()
                .any(|d| Path::new(d).join(lib).exists())
    };
    if have("libwebkit2gtk-4.1.so.0") {
        return None;
    }
    Some(Missing {
        message: "Chroma Lite needs WebKitGTK 4.1, which isn't installed. On Debian or Ubuntu: \
                  sudo apt install libwebkit2gtk-4.1-0 libayatana-appindicator3-1. \
                  On Fedora: sudo dnf install webkit2gtk4.1 libayatana-appindicator-gtk3."
            .into(),
        link: None,
    })
}

fn running() -> bool {
    Command::new("pgrep").args(["-x", BIN]).stdout(Stdio::null()).status().is_ok_and(|s| s.success())
}

/// Ask a running Chroma Lite to quit (SIGTERM), and make sure it's gone
/// (SIGKILL after 4 s) so its files can be replaced.
fn stop_running_app() {
    if !running() {
        return;
    }
    let _ = Command::new("pkill").args(["-TERM", "-x", BIN]).status();
    let start = Instant::now();
    while running() && start.elapsed() < Duration::from_secs(4) {
        std::thread::sleep(Duration::from_millis(100));
    }
    if running() {
        let _ = Command::new("pkill").args(["-KILL", "-x", BIN]).status();
        std::thread::sleep(Duration::from_millis(300));
    }
}

fn write(path: &Path, data: &[u8], mode: u32) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("couldn't create {}: {e}", parent.display()))?;
    }
    std::fs::write(path, data).map_err(|e| format!("couldn't write {}: {e}", path.display()))?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode)).map_err(|e| e.to_string())
}

fn desktop_entry(exe: &Path, extra_args: &str) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName={APP_NAME}\nComment=Lighting for Razer gear, without Synapse\n\
         Exec=\"{}\"{extra_args}\nIcon=chroma-lite\nTerminal=false\nCategories=Utility;Settings;HardwareSettings;\n\
         StartupNotify=false\n",
        exe.display()
    )
}

/// Run a shell snippet as root through pkexec (a password prompt). False if
/// pkexec isn't there, or the user said no.
fn as_root(script: &str) -> bool {
    Command::new("pkexec").args(["sh", "-c", script]).status().is_ok_and(|s| s.success())
}

pub fn install(o: &Options, progress: &dyn Fn(f32, &str)) -> Result<Option<String>, String> {
    progress(0.02, "Closing Chroma Lite if it's running\u{2026}");
    stop_running_app();

    progress(0.05, "Unpacking\u{2026}");
    unpack(&o.dir, &|f, what| progress(0.05 + 0.5 * f, what))?;
    let exe = o.dir.join(BIN);
    if !exe.exists() {
        return Err("the installer is damaged: there's no app inside".into());
    }
    write(&o.dir.join("VERSION"), VERSION.as_bytes(), 0o644)?;

    progress(0.6, "Adding the icon\u{2026}");
    write(&icon_file(), ICON, 0o644)?;
    let link = path_link();
    if let Some(parent) = link.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::remove_file(&link);
    let _ = std::os::unix::fs::symlink(&exe, &link);

    progress(0.7, "Making shortcuts\u{2026}");
    let entry = desktop_entry(&exe, "");
    if o.menu_entry {
        write(&menu_file(), entry.as_bytes(), 0o644)?;
    } else {
        let _ = std::fs::remove_file(menu_file());
    }
    if let Some(desk) = desktop_file() {
        if o.desktop_shortcut {
            write(&desk, entry.as_bytes(), 0o755)?;
            // GNOME won't launch a desktop file until it's marked trusted
            let _ = Command::new("gio")
                .args(["set", &desk.to_string_lossy(), "metadata::trusted", "true"])
                .stderr(Stdio::null())
                .status();
        } else {
            let _ = std::fs::remove_file(&desk);
        }
    }
    if o.autostart {
        write(&autostart_file(), desktop_entry(&exe, " --tray").as_bytes(), 0o644)?;
    } else {
        let _ = std::fs::remove_file(autostart_file());
    }
    let _ =
        Command::new("update-desktop-database").arg(data_home().join("applications")).stderr(Stdio::null()).status();

    let mut note = None;
    if o.device_access && !device_access_ready() {
        progress(0.85, "Asking for your password to allow device access\u{2026}");
        let tmp = std::env::temp_dir().join(format!("chroma-lite-{}.rules", std::process::id()));
        write(&tmp, RULE, 0o644)?;
        let script = format!(
            "install -m 644 '{}' /etc/udev/rules.d/{RULE_NAME} && udevadm control --reload-rules && udevadm trigger --subsystem-match=hidraw",
            tmp.display()
        );
        let ok = as_root(&script);
        let _ = std::fs::remove_file(&tmp);
        if !ok {
            note = Some(
                "Device access wasn't set up, so Chroma Lite can't reach your devices yet. \
                 Run Setup again and allow it, or copy the rule from the README."
                    .into(),
            );
        }
    }
    progress(1.0, "Done");
    Ok(note)
}

pub fn uninstall(dir: &Path, delete_data: bool, progress: &dyn Fn(f32, &str)) -> Result<Option<String>, String> {
    progress(0.05, "Closing Chroma Lite if it's running\u{2026}");
    stop_running_app();
    progress(0.3, "Removing shortcuts\u{2026}");
    for f in [menu_file(), autostart_file(), icon_file()].into_iter().chain(desktop_file()) {
        let _ = std::fs::remove_file(f);
    }
    // only our own symlink, never someone else's chroma-lite on the PATH
    let link = path_link();
    if std::fs::read_link(&link).is_ok_and(|t| t.starts_with(dir)) {
        let _ = std::fs::remove_file(link);
    }
    progress(0.5, "Removing files\u{2026}");
    // Only ever delete a folder that really is a Chroma Lite install.
    if dir.join(BIN).exists() && dir.join("VERSION").exists() {
        remove_dir(dir)?;
    }
    if delete_data {
        progress(0.7, "Removing your settings\u{2026}");
        for d in [config_home(), data_home(), cache_home()] {
            remove_dir(&d.join(IDENTIFIER))?;
        }
    }
    let mut note = None;
    let ours = PathBuf::from("/etc/udev/rules.d").join(RULE_NAME);
    if ours.exists() {
        progress(0.85, "Asking for your password to remove the device rule\u{2026}");
        if !as_root(&format!("rm -f '{}' && udevadm control --reload-rules", ours.display())) {
            note = Some(format!("The device rule is still in {}. You can delete it yourself.", ours.display()));
        }
    }
    progress(1.0, "Done");
    Ok(note)
}

pub fn launch(dir: &Path) {
    let _ = Command::new(dir.join(BIN))
        .current_dir(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

pub fn open_link(url: &str) {
    let _ = Command::new("xdg-open").arg(url).spawn();
}

/// Windows only: the uninstaller runs from a temp copy. Nothing to do here.
pub fn relaunch_for_uninstall(_dir: &Path, _quiet: bool) -> bool {
    false
}

pub fn delete_self_later() {}
