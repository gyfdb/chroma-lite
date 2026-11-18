//! What the installer actually does. The shared parts live here; each OS has
//! its own file for where things go and how they get registered.
//!
//! Everything is per-user where it can be: no admin prompt on Windows, and on
//! Linux only the optional device rule asks for a password.

use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

// One backend per OS. The check features compile another OS's backend on
// Linux, for type-checking only.
#[cfg(any(windows, feature = "win-check"))]
#[path = "windows.rs"]
mod platform;

#[cfg(all(not(any(windows, feature = "win-check")), any(target_os = "macos", feature = "mac-check")))]
#[path = "macos.rs"]
mod platform;

#[cfg(all(not(any(windows, feature = "win-check", feature = "mac-check")), not(target_os = "macos")))]
#[path = "linux.rs"]
mod platform;

pub use platform::*;

/// The app's version, from src-tauri/Cargo.toml (see build.rs).
pub const VERSION: &str = env!("CHROMA_VERSION");
pub const APP_NAME: &str = "Chroma Lite";
/// The app's Tauri identifier: its settings live in a folder named after it.
pub const IDENTIFIER: &str = "com.barkafterbark.chromalite";
#[allow(dead_code)] // only Windows uses it, in Apps & features
pub const SITE: &str = "https://chroma.typicalpuppyboy.com";

/// The app, zipped, baked in at build time (see build.rs).
static PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/payload.zip"));

pub fn has_payload() -> bool {
    !PAYLOAD.is_empty()
}

#[derive(Clone, Debug)]
pub struct Options {
    pub dir: PathBuf,
    pub desktop_shortcut: bool,
    /// Start menu on Windows, the app menu on Linux.
    pub menu_entry: bool,
    pub autostart: bool,
    /// Linux: install the udev rule so the app can open the devices.
    pub device_access: bool,
}

pub struct Installed {
    pub dir: PathBuf,
    pub version: String,
}

/// Something the app needs that this computer doesn't have. Not a blocker:
/// the install still goes ahead, the page just says so.
pub struct Missing {
    pub message: String,
    pub link: Option<&'static str>,
}

/// Which options make sense on this OS, and what they're called.
pub struct Features {
    pub desktop_shortcut: bool,
    pub menu_entry: Option<&'static str>,
    pub device_access: bool,
    pub choose_dir: bool,
    /// Where the app lives once it's running: "tray" or "menu bar".
    pub tray: &'static str,
}

/// The options to start from: what's installed now, or sensible defaults.
pub fn default_options(existing: Option<&Installed>) -> Options {
    Options {
        dir: existing.map_or_else(default_dir, |e| e.dir.clone()),
        // an update keeps whatever shortcuts are there now
        desktop_shortcut: FEATURES.desktop_shortcut && (existing.is_none() || has_desktop_shortcut()),
        menu_entry: FEATURES.menu_entry.is_some() && (existing.is_none() || has_menu_entry()),
        autostart: existing.is_none() || autostart_enabled(),
        device_access: FEATURES.device_access && !device_access_ready(),
    }
}

/// Unpack the payload into `dest`, keeping Unix permissions and symlinks
/// (the macOS app bundle needs both). `progress(fraction, what)` as it goes.
/// Returns the bytes written.
pub(crate) fn unpack(dest: &Path, progress: &dyn Fn(f32, &str)) -> Result<u64, String> {
    std::fs::create_dir_all(dest).map_err(|e| format!("couldn't create {}: {e}", dest.display()))?;
    let mut zip = zip::ZipArchive::new(Cursor::new(PAYLOAD)).map_err(|e| format!("the installer is damaged: {e}"))?;
    let total = zip.len().max(1);
    let mut bytes = 0u64;
    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = f.enclosed_name() else { continue };
        let out = dest.join(&rel);
        if f.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut data = Vec::with_capacity(f.size() as usize);
        f.read_to_end(&mut data).map_err(|e| e.to_string())?;
        let mode = f.unix_mode();
        write_entry(&out, &data, mode)?;
        bytes += data.len() as u64;
        progress((i + 1) as f32 / total as f32, &format!("Unpacking {}", rel.display()));
    }
    Ok(bytes)
}

#[cfg(unix)]
fn write_entry(out: &Path, data: &[u8], mode: Option<u32>) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    const S_IFMT: u32 = 0o170000;
    const S_IFLNK: u32 = 0o120000;
    let _ = std::fs::remove_file(out);
    if mode.is_some_and(|m| m & S_IFMT == S_IFLNK) {
        let target = String::from_utf8_lossy(data).to_string();
        return std::os::unix::fs::symlink(&target, out).map_err(|e| format!("couldn't link {}: {e}", out.display()));
    }
    std::fs::write(out, data).map_err(|e| format!("couldn't write {}: {e}", out.display()))?;
    if let Some(m) = mode {
        let _ = std::fs::set_permissions(out, std::fs::Permissions::from_mode(m & 0o7777));
    }
    Ok(())
}

#[cfg(not(unix))]
fn write_entry(out: &Path, data: &[u8], _mode: Option<u32>) -> Result<(), String> {
    std::fs::write(out, data).map_err(|e| format!("couldn't write {}: {e}", out.display()))
}

/// Remove a folder if it's there; a missing one isn't an error.
pub(crate) fn remove_dir(dir: &Path) -> Result<(), String> {
    match std::fs::remove_dir_all(dir) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("couldn't remove {}: {e}", dir.display())),
    }
}

/// The user's home folder.
#[allow(dead_code)]
pub(crate) fn home() -> PathBuf {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from).unwrap_or_default()
}
