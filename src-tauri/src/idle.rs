//! How long it's been since any keyboard or mouse input, system-wide.

#[cfg(windows)]
pub fn idle_secs() -> u64 {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    let mut lii = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    // SAFETY: lii is a valid LASTINPUTINFO with cbSize set
    unsafe {
        if GetLastInputInfo(&mut lii) == 0 {
            return 0;
        }
        (GetTickCount().wrapping_sub(lii.dwTime) / 1000) as u64
    }
}

#[cfg(not(windows))]
pub fn idle_secs() -> u64 {
    // TODO: linux idle (ext-idle-notify / XScreenSaver), never idles for now
    0
}
