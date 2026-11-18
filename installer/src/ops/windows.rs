//! Windows: unpack the app, make shortcuts, register it (Apps & features,
//! start at login), and undo all of it. Per-user, so no admin prompt: the app
//! goes in `%LOCALAPPDATA%\Programs\Chroma Lite`, the registry entries in HKCU.
//!
//! Earlier versions shipped a Tauri NSIS installer. If one of those is still
//! installed, it's removed quietly first (settings are kept) so there aren't
//! two copies fighting over the devices.

use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::ERROR_SUCCESS;
use windows_sys::Win32::System::Com::CoTaskMemFree;
use windows_sys::Win32::System::Registry::{
    RegDeleteKeyValueW, RegDeleteKeyW, RegDeleteTreeW, RegGetValueW, RegSetKeyValueW, HKEY, HKEY_CURRENT_USER,
    HKEY_LOCAL_MACHINE, REG_DWORD, REG_SZ, RRF_RT_REG_SZ,
};
use windows_sys::Win32::UI::Shell::{FOLDERID_Desktop, SHGetKnownFolderPath, ShellExecuteW};
use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use super::{remove_dir, unpack, Features, Installed, Missing, Options, APP_NAME, IDENTIFIER, VERSION};

pub const FEATURES: Features = Features {
    desktop_shortcut: true,
    menu_entry: Some("Add to the Start menu"),
    device_access: false,
    choose_dir: true,
    tray: "tray",
};

const APP_EXE: &str = "chroma-lite.exe";
const UNINSTALLER: &str = "Uninstall Chroma Lite.exe";
const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\ChromaLite";
/// Where the old Tauri NSIS installer registered itself.
const OLD_NSIS_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Chroma Lite";
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_VALUE: &str = "Chroma Lite";
/// WebView2's Evergreen runtime, as Edge Update registers it.
const WEBVIEW2: &str = r"Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
const WEBVIEW2_DOWNLOAD: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn from_wide_ptr(p: *const u16) -> String {
    if p.is_null() {
        return String::new();
    }
    let mut n = 0;
    // SAFETY: p is a NUL-terminated string from the shell
    unsafe {
        while *p.add(n) != 0 {
            n += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(p, n))
    }
}

// ── Registry ────────────────────────────────────────────────────────────────

fn reg_get_in(root: HKEY, key: &str, name: &str) -> Option<String> {
    let (k, n) = (wide(key), wide(name));
    let mut buf = vec![0u16; 2048];
    let mut size = (buf.len() * 2) as u32;
    // SAFETY: buf is as big as size says
    let r = unsafe {
        RegGetValueW(root, k.as_ptr(), n.as_ptr(), RRF_RT_REG_SZ, null_mut(), buf.as_mut_ptr().cast(), &mut size)
    };
    (r == ERROR_SUCCESS).then(|| {
        let len = (size as usize / 2).saturating_sub(1).min(buf.len());
        String::from_utf16_lossy(&buf[..len])
    })
}

fn reg_get(key: &str, name: &str) -> Option<String> {
    reg_get_in(HKEY_CURRENT_USER, key, name)
}

fn reg_set(key: &str, name: &str, value: &str) -> Result<(), String> {
    let (k, n, v) = (wide(key), wide(name), wide(value));
    // SAFETY: v is a NUL-terminated UTF-16 string, sized in bytes
    let r = unsafe {
        RegSetKeyValueW(HKEY_CURRENT_USER, k.as_ptr(), n.as_ptr(), REG_SZ, v.as_ptr().cast(), (v.len() * 2) as u32)
    };
    if r == ERROR_SUCCESS {
        Ok(())
    } else {
        Err(format!("couldn't write {key}\\{name} (error {r})"))
    }
}

fn reg_set_dword(key: &str, name: &str, value: u32) {
    let (k, n) = (wide(key), wide(name));
    // SAFETY: a 4-byte DWORD
    unsafe { RegSetKeyValueW(HKEY_CURRENT_USER, k.as_ptr(), n.as_ptr(), REG_DWORD, (&value as *const u32).cast(), 4) };
}

fn reg_delete_value(key: &str, name: &str) {
    let (k, n) = (wide(key), wide(name));
    // SAFETY: plain strings
    unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, k.as_ptr(), n.as_ptr()) };
}

fn reg_delete_key(key: &str) {
    // Never with an empty path: that would mean all of HKEY_CURRENT_USER.
    assert!(!key.is_empty());
    let k = wide(key);
    // SAFETY: plain strings
    unsafe {
        RegDeleteTreeW(HKEY_CURRENT_USER, k.as_ptr());
        RegDeleteKeyW(HKEY_CURRENT_USER, k.as_ptr());
    }
}

// ── Where things go ─────────────────────────────────────────────────────────

pub fn default_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join("Programs").join(APP_NAME)
}

fn start_menu_link() -> Option<PathBuf> {
    std::env::var_os("APPDATA")
        .map(|a| PathBuf::from(a).join(r"Microsoft\Windows\Start Menu\Programs").join(format!("{APP_NAME}.lnk")))
}

fn desktop_link() -> Option<PathBuf> {
    let mut p = null_mut();
    // SAFETY: the shell allocates p; we free it with CoTaskMemFree
    unsafe {
        if SHGetKnownFolderPath(&FOLDERID_Desktop, 0, null_mut(), &mut p) != 0 {
            return None;
        }
        let dir = from_wide_ptr(p);
        CoTaskMemFree(p as *const _);
        Some(PathBuf::from(dir).join(format!("{APP_NAME}.lnk")))
    }
}

/// The app's settings (Tauri's app_config_dir) and its WebView2 data.
fn data_dirs() -> Vec<PathBuf> {
    ["APPDATA", "LOCALAPPDATA"].iter().filter_map(std::env::var_os).map(|d| PathBuf::from(d).join(IDENTIFIER)).collect()
}

pub fn installed() -> Option<Installed> {
    let dir = PathBuf::from(reg_get(UNINSTALL_KEY, "InstallLocation")?);
    dir.join(APP_EXE)
        .exists()
        .then(|| Installed { dir, version: reg_get(UNINSTALL_KEY, "DisplayVersion").unwrap_or_else(|| "?".into()) })
}

pub fn has_desktop_shortcut() -> bool {
    desktop_link().is_some_and(|l| l.exists())
}

pub fn has_menu_entry() -> bool {
    start_menu_link().is_some_and(|l| l.exists())
}

pub fn autostart_enabled() -> bool {
    reg_get(RUN_KEY, RUN_VALUE).is_some()
}

pub fn device_access_ready() -> bool {
    true
}

/// Chroma Lite's window is a WebView2. It ships with Windows 11 and recent
/// Windows 10, but not always.
pub fn missing() -> Option<Missing> {
    let has = |root: HKEY, key: &str| reg_get_in(root, key, "pv").is_some_and(|v| !v.is_empty() && v != "0.0.0.0");
    let found = has(HKEY_LOCAL_MACHINE, &format!(r"SOFTWARE\WOW6432Node\{WEBVIEW2}"))
        || has(HKEY_LOCAL_MACHINE, &format!(r"SOFTWARE\{WEBVIEW2}"))
        || has(HKEY_CURRENT_USER, &format!(r"Software\{WEBVIEW2}"));
    (!found).then(|| Missing {
        message: "Chroma Lite needs Microsoft's WebView2 runtime, which this PC doesn't seem to have. Get it first, then open Chroma Lite.".into(),
        link: Some(WEBVIEW2_DOWNLOAD),
    })
}

// ── The running app ─────────────────────────────────────────────────────────

/// A command that doesn't flash a console window.
fn hidden(cmd: &str) -> std::process::Command {
    #[cfg_attr(not(windows), allow(unused_mut))]
    let mut c = std::process::Command::new(cmd);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        c.creation_flags(CREATE_NO_WINDOW);
    }
    c
}

/// Close a running Chroma Lite so its exe can be replaced. Closing its window
/// only hides it to the tray, so this ends the process; its settings are
/// saved as you change them, so nothing is lost.
fn stop_running_app(dir: &Path) -> bool {
    let _ = hidden("taskkill").args(["/F", "/IM", APP_EXE]).output();
    let exe = dir.join(APP_EXE);
    let start = Instant::now();
    loop {
        // free once it can be opened for writing (or isn't there yet)
        if !exe.exists() || std::fs::OpenOptions::new().write(true).open(&exe).is_ok() {
            return true;
        }
        if start.elapsed() > Duration::from_secs(8) {
            return false;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

/// Quietly remove a copy installed by the old NSIS installer, keeping its
/// settings. True if there was one.
fn remove_old_nsis_install() -> bool {
    let Some(cmd) = reg_get(OLD_NSIS_KEY, "QuietUninstallString")
        .or_else(|| reg_get(OLD_NSIS_KEY, "UninstallString").map(|s| format!("{s} /S")))
    else {
        return false;
    };
    let _ = hidden("cmd").args(["/C", &cmd]).status();
    // NSIS uninstallers copy themselves to %TEMP% and return early: wait for
    // its entry to go away
    let start = Instant::now();
    while reg_get(OLD_NSIS_KEY, "DisplayName").is_some() && start.elapsed() < Duration::from_secs(20) {
        std::thread::sleep(Duration::from_millis(250));
    }
    true
}

pub fn launch(dir: &Path) {
    let exe = dir.join(APP_EXE);
    let (op, file, cwd) = (wide("open"), wide(&exe.to_string_lossy()), wide(&dir.to_string_lossy()));
    // SAFETY: plain strings
    unsafe { ShellExecuteW(null_mut(), op.as_ptr(), file.as_ptr(), null(), cwd.as_ptr(), SW_SHOWNORMAL) };
}

pub fn open_link(url: &str) {
    let (op, file) = (wide("open"), wide(url));
    // SAFETY: plain strings
    unsafe { ShellExecuteW(null_mut(), op.as_ptr(), file.as_ptr(), null(), null(), SW_SHOWNORMAL) };
}

// ── Install ─────────────────────────────────────────────────────────────────

pub fn install(o: &Options, progress: &dyn Fn(f32, &str)) -> Result<Option<String>, String> {
    progress(0.02, "Closing Chroma Lite if it's running\u{2026}");
    if !stop_running_app(&o.dir) {
        return Err("Chroma Lite is still running. Quit it from the tray icon and try again.".into());
    }
    if reg_get(OLD_NSIS_KEY, "DisplayName").is_some() {
        progress(0.04, "Removing the older version\u{2026}");
        remove_old_nsis_install();
    }

    progress(0.08, "Unpacking\u{2026}");
    let bytes = unpack(&o.dir, &|f, what| progress(0.08 + 0.5 * f, what))?;
    let exe = o.dir.join(APP_EXE);
    if !exe.exists() {
        return Err("the installer is damaged: there's no app inside".into());
    }

    progress(0.7, "Setting up the uninstaller\u{2026}");
    let me = std::env::current_exe().map_err(|e| e.to_string())?;
    let uninstaller = o.dir.join(UNINSTALLER);
    if me != uninstaller {
        std::fs::copy(&me, &uninstaller).map_err(|e| format!("couldn't copy the uninstaller: {e}"))?;
    }
    let dir_s = o.dir.to_string_lossy().to_string();
    reg_set(UNINSTALL_KEY, "DisplayName", APP_NAME)?;
    reg_set(UNINSTALL_KEY, "DisplayVersion", VERSION)?;
    reg_set(UNINSTALL_KEY, "Publisher", "idontlikegits")?;
    reg_set(UNINSTALL_KEY, "URLInfoAbout", super::SITE)?;
    reg_set(UNINSTALL_KEY, "InstallLocation", &dir_s)?;
    reg_set(UNINSTALL_KEY, "DisplayIcon", &exe.to_string_lossy())?;
    reg_set(UNINSTALL_KEY, "UninstallString", &format!("\"{}\" --uninstall", uninstaller.display()))?;
    reg_set(UNINSTALL_KEY, "QuietUninstallString", &format!("\"{}\" --uninstall --quiet", uninstaller.display()))?;
    reg_set_dword(UNINSTALL_KEY, "NoModify", 1);
    reg_set_dword(UNINSTALL_KEY, "NoRepair", 1);
    reg_set_dword(UNINSTALL_KEY, "EstimatedSize", (bytes / 1024) as u32);

    progress(0.85, "Making shortcuts\u{2026}");
    for (want, path) in [(o.menu_entry, start_menu_link()), (o.desktop_shortcut, desktop_link())] {
        let Some(path) = path else { continue };
        if want {
            make_shortcut(&path, &exe, &o.dir)?;
        } else {
            let _ = std::fs::remove_file(&path);
        }
    }

    if o.autostart {
        reg_set(RUN_KEY, RUN_VALUE, &format!("\"{}\" --tray", exe.display()))?;
    } else {
        reg_delete_value(RUN_KEY, RUN_VALUE);
    }
    progress(1.0, "Done");
    Ok(None)
}

#[cfg(windows)]
fn make_shortcut(link: &Path, exe: &Path, dir: &Path) -> Result<(), String> {
    if let Some(parent) = link.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let mut sl = mslnk::ShellLink::new(exe).map_err(|e| format!("couldn't make a shortcut: {e}"))?;
    sl.set_working_dir(Some(dir.to_string_lossy().to_string()));
    sl.set_icon_location(Some(exe.to_string_lossy().to_string()));
    sl.set_name(Some("Lighting for Razer gear, without Synapse".into()));
    sl.create_lnk(link).map_err(|e| format!("couldn't save {}: {e}", link.display()))
}

#[cfg(not(windows))]
fn make_shortcut(_link: &Path, _exe: &Path, _dir: &Path) -> Result<(), String> {
    Err("shortcuts are Windows-only".into())
}

// ── Uninstall ───────────────────────────────────────────────────────────────

pub fn uninstall(dir: &Path, delete_data: bool, progress: &dyn Fn(f32, &str)) -> Result<Option<String>, String> {
    progress(0.05, "Closing Chroma Lite if it's running\u{2026}");
    if !stop_running_app(dir) {
        return Err("Chroma Lite is still running. Quit it from the tray icon and try again.".into());
    }
    progress(0.3, "Removing shortcuts\u{2026}");
    for link in [start_menu_link(), desktop_link()].into_iter().flatten() {
        let _ = std::fs::remove_file(link);
    }
    reg_delete_value(RUN_KEY, RUN_VALUE);
    progress(0.5, "Removing files\u{2026}");
    // Only ever delete a folder that really is a Chroma Lite install.
    if dir.join(APP_EXE).exists() {
        remove_dir(dir)?;
    }
    if delete_data {
        progress(0.8, "Removing your settings\u{2026}");
        for d in data_dirs() {
            remove_dir(&d)?;
        }
    }
    reg_delete_key(UNINSTALL_KEY);
    progress(1.0, "Done");
    Ok(None)
}

/// Uninstalling from inside the install folder (what Apps & features does)
/// can't delete the running exe, so hop to a temp copy first. True if it did.
pub fn relaunch_for_uninstall(dir: &Path, quiet: bool) -> bool {
    let Ok(me) = std::env::current_exe() else { return false };
    if !me.starts_with(dir) {
        return false;
    }
    let tmp = std::env::temp_dir().join(format!("chroma-lite-uninstall-{}.exe", std::process::id()));
    if std::fs::copy(&me, &tmp).is_err() {
        return false;
    }
    let mut cmd = std::process::Command::new(&tmp);
    cmd.args(["--uninstall", "--relaunched", "--dir"]).arg(dir);
    if quiet {
        cmd.arg("--quiet");
    }
    cmd.spawn().is_ok()
}

/// The temp copy can't delete itself while it runs; once it exits, a hidden
/// `cmd` does.
pub fn delete_self_later() {
    if let Ok(me) = std::env::current_exe() {
        let cmd = format!("ping -n 3 127.0.0.1 >nul & del /f /q \"{}\"", me.display());
        let _ = hidden("cmd").args(["/c", &cmd]).spawn();
    }
}
