//! Global key and click events, for reactive layers.
//!
//! On Windows this uses low-level hooks (WH_KEYBOARD_LL / WH_MOUSE_LL) on their
//! own thread. They're only installed while an enabled, streamed layer needs
//! them, and removed otherwise (including while the lights are idle), so most
//! of the time nothing is hooked. The mouse hook especially is never left in
//! "just in case", since it runs on every mouse movement.
//!
//! Which key was pressed never leaves this module. Keys get turned straight
//! into a (row, col) LED position.

// only produced by the windows hook
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum InputEvent {
    /// A key with a known position on the keyboard matrix.
    Key { row: u8, col: u8 },
    /// A key with no known position (still counts for mice and whole-device hits).
    OtherKey,
    Click,
}

pub const NEED_KEYS: u32 = 1;
pub const NEED_CLICKS: u32 = 2;

/// Full-size ANSI layout on Razer's 6×22 matrix (column 0 is the macro keys).
/// `extended` tells the nav cluster and numpad Enter apart from the numpad.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn keymap(vk: u32, extended: bool) -> Option<(u8, u8)> {
    const ROW2_LETTERS: [u32; 10] = [0x51, 0x57, 0x45, 0x52, 0x54, 0x59, 0x55, 0x49, 0x4F, 0x50]; // QWERTYUIOP
    const ROW3_LETTERS: [u32; 9] = [0x41, 0x53, 0x44, 0x46, 0x47, 0x48, 0x4A, 0x4B, 0x4C]; // ASDFGHJKL
    const ROW4_LETTERS: [u32; 7] = [0x5A, 0x58, 0x43, 0x56, 0x42, 0x4E, 0x4D]; // ZXCVBNM

    if let Some(i) = ROW2_LETTERS.iter().position(|&k| k == vk) {
        return Some((2, 2 + i as u8));
    }
    if let Some(i) = ROW3_LETTERS.iter().position(|&k| k == vk) {
        return Some((3, 2 + i as u8));
    }
    if let Some(i) = ROW4_LETTERS.iter().position(|&k| k == vk) {
        return Some((4, 3 + i as u8));
    }

    Some(match (vk, extended) {
        // row 0
        (0x1B, _) => (0, 1),
        (0x70..=0x7B, _) => (0, 3 + (vk - 0x70) as u8), // F1..F12
        (0x2C, _) => (0, 15),                           // Print Screen
        (0x91, _) => (0, 16),                           // Scroll Lock
        (0x13, _) => (0, 17),                           // Pause
        // row 1
        (0xC0, _) => (1, 1),                          // `
        (0x31..=0x39, _) => (1, 2 + (vk - 0x31) as u8), // 1..9
        (0x30, _) => (1, 11),                         // 0
        (0xBD, _) => (1, 12),                         // -
        (0xBB, _) => (1, 13),                         // =
        (0x08, _) => (1, 14),                         // Backspace
        (0x2D, true) => (1, 15),                      // Insert
        (0x24, true) => (1, 16),                      // Home
        (0x21, true) => (1, 17),                      // Page Up
        (0x90, _) => (1, 18),                         // Num Lock
        (0x6F, _) => (1, 19),                         // Num /
        (0x6A, _) => (1, 20),                         // Num *
        (0x6D, _) => (1, 21),                         // Num -
        // row 2
        (0x09, _) => (2, 1),       // Tab
        (0xDB, _) => (2, 12),      // [
        (0xDD, _) => (2, 13),      // ]
        (0xDC, _) => (2, 14),      // \
        (0x2E, true) => (2, 15),   // Delete
        (0x23, true) => (2, 16),   // End
        (0x22, true) => (2, 17),   // Page Down
        (0x67, _) | (0x24, false) => (2, 18), // Num 7 / Home
        (0x68, _) | (0x26, false) => (2, 19), // Num 8 / Up
        (0x69, _) | (0x21, false) => (2, 20), // Num 9 / PgUp
        (0x6B, _) => (2, 21),      // Num +
        // row 3
        (0x14, _) => (3, 1),       // Caps Lock
        (0xBA, _) => (3, 11),      // ;
        (0xDE, _) => (3, 12),      // '
        (0x0D, false) => (3, 14),  // Enter
        (0x64, _) | (0x25, false) => (3, 18), // Num 4 / Left
        (0x65, _) | (0x0C, _) => (3, 19),     // Num 5 / Clear
        (0x66, _) | (0x27, false) => (3, 20), // Num 6 / Right
        // row 4
        (0xA0, _) | (0x10, _) => (4, 1), // Left Shift
        (0xBC, _) => (4, 10),      // ,
        (0xBE, _) => (4, 11),      // .
        (0xBF, _) => (4, 12),      // /
        (0xA1, _) => (4, 14),      // Right Shift
        (0x26, true) => (4, 16),   // Up
        (0x61, _) | (0x23, false) => (4, 18), // Num 1 / End
        (0x62, _) | (0x28, false) => (4, 19), // Num 2 / Down
        (0x63, _) | (0x22, false) => (4, 20), // Num 3 / PgDn
        (0x0D, true) => (4, 21),   // Num Enter
        // row 5
        (0xA2, _) | (0x11, _) => (5, 1), // Left Ctrl
        (0x5B, _) => (5, 2),       // Left Win
        (0xA4, _) | (0x12, _) => (5, 3), // Left Alt
        (0x20, _) => (5, 7),       // Space
        (0xA5, _) => (5, 11),      // Right Alt
        (0x5C, _) => (5, 12),      // Right Win / Fn position
        (0x5D, _) => (5, 13),      // Menu
        (0xA3, _) => (5, 14),      // Right Ctrl
        (0x25, true) => (5, 15),   // Left
        (0x28, true) => (5, 16),   // Down
        (0x27, true) => (5, 17),   // Right
        (0x60, _) | (0x2D, false) => (5, 19), // Num 0 / Ins
        (0x6E, _) | (0x2E, false) => (5, 20), // Num . / Del
        _ => return None,
    })
}

#[cfg(windows)]
pub use win::{set_needs, spawn};

#[cfg(not(windows))]
pub fn spawn(_sink: impl Fn(InputEvent) + Send + Sync + 'static) {}
#[cfg(not(windows))]
pub fn set_needs(_flags: u32) {}

#[cfg(windows)]
mod win {
    use super::{keymap, InputEvent, NEED_CLICKS, NEED_KEYS};
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicPtr, AtomicU32, Ordering::SeqCst};
    use std::sync::{Mutex, OnceLock};
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, PeekMessageW, PostThreadMessageW, SetWindowsHookExW,
        UnhookWindowsHookEx, KBDLLHOOKSTRUCT, LLKHF_EXTENDED, MSG, PM_NOREMOVE, WH_KEYBOARD_LL,
        WH_MOUSE_LL, WM_APP, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_RBUTTONDOWN,
        WM_SYSKEYDOWN, WM_SYSKEYUP, WM_XBUTTONDOWN,
    };

    type Sink = Box<dyn Fn(InputEvent) + Send + Sync>;
    static SINK: OnceLock<Sink> = OnceLock::new();
    static WANTED: AtomicU32 = AtomicU32::new(0);
    static THREAD_ID: AtomicU32 = AtomicU32::new(0);
    static KB_HOOK: AtomicPtr<core::ffi::c_void> = AtomicPtr::new(null_mut());
    static MOUSE_HOOK: AtomicPtr<core::ffi::c_void> = AtomicPtr::new(null_mut());
    /// Keys being held, so auto-repeat doesn't trigger a reaction 30 times a second.
    static HELD: Mutex<Vec<u32>> = Mutex::new(Vec::new());

    const WM_RECONCILE: u32 = WM_APP + 1;

    fn emit(ev: InputEvent) {
        if let Some(sink) = SINK.get() {
            sink(ev);
        }
    }

    unsafe extern "system" fn keyboard_proc(code: i32, w: WPARAM, l: LPARAM) -> LRESULT {
        if code >= 0 {
            let k = &*(l as *const KBDLLHOOKSTRUCT);
            let msg = w as u32;
            let mut fresh_press = false;
            if let Ok(mut held) = HELD.lock() {
                if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
                    if !held.contains(&k.vkCode) {
                        held.push(k.vkCode);
                        fresh_press = true;
                    }
                } else if msg == WM_KEYUP || msg == WM_SYSKEYUP {
                    held.retain(|&v| v != k.vkCode);
                }
            }
            if fresh_press {
                let extended = k.flags & LLKHF_EXTENDED != 0;
                emit(match keymap(k.vkCode, extended) {
                    Some((row, col)) => InputEvent::Key { row, col },
                    None => InputEvent::OtherKey,
                });
            }
        }
        CallNextHookEx(null_mut(), code, w, l)
    }

    unsafe extern "system" fn mouse_proc(code: i32, w: WPARAM, l: LPARAM) -> LRESULT {
        if code >= 0 {
            let msg = w as u32;
            if msg == WM_LBUTTONDOWN || msg == WM_RBUTTONDOWN || msg == WM_MBUTTONDOWN || msg == WM_XBUTTONDOWN {
                emit(InputEvent::Click);
            }
        }
        CallNextHookEx(null_mut(), code, w, l)
    }

    /// Installs or removes hooks to match WANTED. Runs on the hook thread.
    unsafe fn reconcile() {
        let want = WANTED.load(SeqCst);
        let hmod = GetModuleHandleW(std::ptr::null());

        let kb = KB_HOOK.load(SeqCst);
        if want & NEED_KEYS != 0 && kb.is_null() {
            KB_HOOK.store(SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), hmod, 0), SeqCst);
        } else if want & NEED_KEYS == 0 && !kb.is_null() {
            UnhookWindowsHookEx(kb);
            KB_HOOK.store(null_mut(), SeqCst);
            if let Ok(mut held) = HELD.lock() {
                held.clear();
            }
        }

        let ms = MOUSE_HOOK.load(SeqCst);
        if want & NEED_CLICKS != 0 && ms.is_null() {
            MOUSE_HOOK.store(SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), hmod, 0), SeqCst);
        } else if want & NEED_CLICKS == 0 && !ms.is_null() {
            UnhookWindowsHookEx(ms);
            MOUSE_HOOK.store(null_mut(), SeqCst);
        }
    }

    pub fn spawn(sink: impl Fn(InputEvent) + Send + Sync + 'static) {
        if SINK.set(Box::new(sink)).is_err() {
            return;
        }
        let _ = std::thread::Builder::new().name("input-hooks".into()).spawn(|| unsafe {
            let mut msg: MSG = std::mem::zeroed();
            // make the message queue before publishing the thread id, so
            // PostThreadMessageW can't race ahead of it
            PeekMessageW(&mut msg, null_mut(), 0, 0, PM_NOREMOVE);
            THREAD_ID.store(GetCurrentThreadId(), SeqCst);
            reconcile();
            // low-level hooks get delivered through this message loop
            while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
                if msg.message == WM_RECONCILE {
                    reconcile();
                }
            }
        });
    }

    /// Called by the engine whenever what it needs changes.
    pub fn set_needs(flags: u32) {
        if WANTED.swap(flags, SeqCst) == flags {
            return;
        }
        let tid = THREAD_ID.load(SeqCst);
        if tid != 0 {
            unsafe {
                PostThreadMessageW(tid, WM_RECONCILE, 0, 0);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keymap_basics() {
        assert_eq!(keymap(0x1B, false), Some((0, 1))); // Esc
        assert_eq!(keymap(0x41, false), Some((3, 2))); // A
        assert_eq!(keymap(0x20, false), Some((5, 7))); // Space
        assert_eq!(keymap(0x0D, false), Some((3, 14))); // Enter
        assert_eq!(keymap(0x0D, true), Some((4, 21))); // Num Enter
        assert_eq!(keymap(0x26, true), Some((4, 16))); // Up arrow
        assert_eq!(keymap(0x26, false), Some((2, 19))); // Num 8 with NumLock off
        assert_eq!(keymap(0xFF, false), None);
    }

    #[test]
    fn keymap_has_no_collisions() {
        let mut seen = std::collections::HashMap::new();
        for vk in 0..=0xFFu32 {
            for ext in [false, true] {
                if let Some(pos) = keymap(vk, ext) {
                    if let Some(prev) = seen.insert(pos, (vk, ext)) {
                        // generic vs left/right variants and numpad dual-use share keys on purpose
                        let same_key = matches!(
                            (prev.0, vk),
                            (0x10, 0xA0) | (0xA0, 0x10) | (0x11, 0xA2) | (0xA2, 0x11) | (0x12, 0xA4) | (0xA4, 0x12)
                        ) || prev.1 != ext
                            || (0x60..=0x6E).contains(&vk)
                            || (0x60..=0x6E).contains(&prev.0)
                            || vk == 0x0C
                            || prev.0 == 0x0C;
                        assert!(same_key, "{pos:?} mapped by vk {:#x} and {:#x}", prev.0, vk);
                    }
                    assert!(pos.0 < 6 && pos.1 < 22);
                }
            }
        }
    }
}
