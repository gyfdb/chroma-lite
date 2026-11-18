//! Bakes the app into the installer.
//!
//! Set `CHROMA_PAYLOAD` to a zip of the app to make a real installer; the
//! Release workflow does this. What's in the zip depends on the OS:
//!
//! - Windows: `chroma-lite.exe`
//! - macOS:   `Chroma Lite.app/...`
//! - Linux:   `chroma-lite`
//!
//! Without it the installer still builds, but says it has nothing to install.

use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-env-changed=CHROMA_PAYLOAD");
    println!("cargo:rerun-if-changed=../src-tauri/Cargo.toml");
    println!("cargo:rerun-if-changed=../src-tauri/icons/icon.ico");
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("payload.zip");
    match std::env::var("CHROMA_PAYLOAD") {
        Ok(p) if !p.is_empty() => {
            println!("cargo:rerun-if-changed={p}");
            std::fs::copy(&p, &out).unwrap_or_else(|e| panic!("CHROMA_PAYLOAD={p}: {e}"));
        }
        _ => std::fs::write(&out, []).unwrap(),
    }

    // The app's version, from the app's own Cargo.toml: the one place it lives.
    let manifest = std::fs::read_to_string("../src-tauri/Cargo.toml").unwrap_or_default();
    let version = manifest
        .split("[package]")
        .nth(1)
        .and_then(|pkg| pkg.lines().find_map(|l| l.trim().strip_prefix("version = ")))
        .map(|v| v.trim_matches('"').to_owned())
        .expect("couldn't read the version from ../src-tauri/Cargo.toml");
    println!("cargo:rustc-env=CHROMA_VERSION={version}");

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("../src-tauri/icons/icon.ico");
        res.set("FileDescription", "Chroma Lite Setup");
        res.set("ProductName", "Chroma Lite");
        res.set("ProductVersion", &version);
        res.set("FileVersion", &version);
        // Per-user install: never ask for admin. Crisp on high-DPI screens.
        res.set_manifest(
            r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security>
  </trustInfo>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>
    </windowsSettings>
  </application>
</assembly>"#,
        );
        if let Err(e) = res.compile() {
            println!("cargo:warning=couldn't embed the installer icon/manifest: {e}");
        }
    }
}
