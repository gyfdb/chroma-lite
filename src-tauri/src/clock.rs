//! Local time of day, for the time-of-day effect.

/// Hours since local midnight, 0..24.
#[cfg(windows)]
pub fn local_hours() -> f32 {
    use windows_sys::Win32::{Foundation::SYSTEMTIME, System::SystemInformation::GetLocalTime};
    // SAFETY: GetLocalTime only writes the struct we hand it
    let mut st: SYSTEMTIME = unsafe { std::mem::zeroed() };
    unsafe { GetLocalTime(&mut st) };
    st.wHour as f32 + st.wMinute as f32 / 60.0 + st.wSecond as f32 / 3600.0
}

/// Hours since local midnight, 0..24.
#[cfg(not(windows))]
pub fn local_hours() -> f32 {
    use chrono::Timelike;
    let now = chrono::Local::now();
    now.hour() as f32 + now.minute() as f32 / 60.0 + now.second() as f32 / 3600.0
}
