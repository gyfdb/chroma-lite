//! The parts of the Razer HID protocol this app uses: the same 90-byte
//! feature report that Synapse, OpenRazer and OpenRGB send.
//!
//! Layout (90 bytes, sent behind a 0x00 HID report ID):
//!   [0]     status            0x00 = new command, 0x02 = success in replies
//!   [1]     transaction id    device-specific; newer gear is usually 0x1F
//!   [2..4]  remaining packets (big endian, 0 for us)
//!   [4]     protocol type     0x00
//!   [5]     data size         number of argument bytes used
//!   [6]     command class
//!   [7]     command id
//!   [8..88] arguments         80 bytes
//!   [88]    crc               XOR of bytes 2..88
//!   [89]    reserved

use hidapi::{HidApi, HidDevice};
use std::{fmt, thread, time::Duration};

pub const RAZER_VID: u16 = 0x1532;
const REPORT_LEN: usize = 90;

/// Saves to the device's onboard memory, so it sticks after the app closes.
const VARSTORE: u8 = 0x01;
/// Applies without saving. Used for idle on/off so the flash isn't rewritten constantly.
const NOSTORE: u8 = 0x00;

#[derive(Debug)]
pub enum Error {
    Hid(hidapi::HidError),
    Status(u8),
    ShortReply(usize),
}

impl Error {
    /// True when the device itself is gone, not just turning down one command.
    pub fn is_transport(&self) -> bool {
        matches!(self, Error::Hid(_) | Error::ShortReply(_))
    }
}

impl From<hidapi::HidError> for Error {
    fn from(e: hidapi::HidError) -> Self {
        Error::Hid(e)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Hid(e) => write!(f, "HID error: {e}"),
            Error::Status(s) => write!(
                f,
                "device replied 0x{s:02X} ({})",
                match s {
                    0x01 => "busy",
                    0x03 => "failure",
                    0x04 => "timeout",
                    0x05 => "not supported by this device",
                    _ => "unknown",
                }
            ),
            Error::ShortReply(n) => write!(f, "reply too short ({n} bytes)"),
        }
    }
}

fn build(tid: u8, class: u8, id: u8, args: &[u8]) -> [u8; REPORT_LEN + 1] {
    assert!(args.len() <= 80, "Razer reports carry at most 80 argument bytes");
    let mut out = [0u8; REPORT_LEN + 1]; // out[0] is the HID report id (0x00)
    let buf = &mut out[1..];
    buf[1] = tid;
    buf[5] = args.len() as u8;
    buf[6] = class;
    buf[7] = id;
    buf[8..8 + args.len()].copy_from_slice(args);
    buf[88] = buf[2..88].iter().fold(0, |acc, b| acc ^ b);
    out
}

pub struct Razer {
    dev: HidDevice,
    pub tid: u8,
}

impl Razer {
    /// Sends a command and waits for the device to confirm it.
    fn transact(&self, class: u8, id: u8, args: &[u8]) -> Result<[u8; REPORT_LEN], Error> {
        self.dev.send_feature_report(&build(self.tid, class, id, args))?;
        thread::sleep(Duration::from_millis(10));

        let mut inp = [0u8; REPORT_LEN + 1];
        let n = self.dev.get_feature_report(&mut inp)?;
        if n < REPORT_LEN {
            return Err(Error::ShortReply(n));
        }
        let mut reply = [0u8; REPORT_LEN];
        reply.copy_from_slice(&inp[1..]);
        match reply[0] {
            0x02 => Ok(reply),
            s => Err(Error::Status(s)),
        }
    }

    /// Sends without waiting for a reply, used for animation frames.
    // skipping the reply read takes each packet from ~10ms down to ~1ms
    fn send(&self, class: u8, id: u8, args: &[u8]) -> Result<(), Error> {
        self.dev.send_feature_report(&build(self.tid, class, id, args))?;
        thread::sleep(Duration::from_millis(1));
        Ok(())
    }

    pub fn firmware(&self) -> Result<(u8, u8), Error> {
        let r = self.transact(0x00, 0x81, &[0, 0])?;
        Ok((r[8], r[9]))
    }

    // ─ On-device effects ; the device animates these itself, 0% CPU ──────────

    pub fn set_static(&self, led: u8, [r, g, b]: [u8; 3]) -> Result<(), Error> {
        self.transact(0x0F, 0x02, &[VARSTORE, led, 0x01, 0x00, 0x00, 0x01, r, g, b])
            .map(drop)
    }

    pub fn set_breathing(&self, led: u8, [r, g, b]: [u8; 3]) -> Result<(), Error> {
        self.transact(0x0F, 0x02, &[VARSTORE, led, 0x02, 0x01, 0x00, 0x01, r, g, b])
            .map(drop)
    }

    pub fn set_spectrum(&self, led: u8) -> Result<(), Error> {
        self.transact(0x0F, 0x02, &[VARSTORE, led, 0x03, 0x00, 0x00, 0x00])
            .map(drop)
    }

    /// direction: 1 is left → right, 2 is right → left
    pub fn set_wave(&self, led: u8, direction: u8) -> Result<(), Error> {
        self.transact(0x0F, 0x02, &[VARSTORE, led, 0x04, direction, 0x28, 0x00])
            .map(drop)
    }

    pub fn set_brightness(&self, led: u8, level: u8, persist: bool) -> Result<(), Error> {
        let store = if persist { VARSTORE } else { NOSTORE };
        self.transact(0x0F, 0x04, &[store, led, level]).map(drop)
    }

    // ─ Custom frames ; we draw every pixel, the device just shows it ─────────

    /// Uploads one row of the LED matrix (25 LEDs max per packet).
    pub fn custom_row(&self, row: u8, rgb: &[u8]) -> Result<(), Error> {
        let leds = (rgb.len() / 3).min(25);
        if leds == 0 {
            return Ok(());
        }
        let mut args = [0u8; 80];
        args[2] = row;
        args[3] = 0; // start col
        args[4] = (leds - 1) as u8; // end col
        args[5..5 + leds * 3].copy_from_slice(&rgb[..leds * 3]);
        self.send(0x0F, 0x03, &args[..5 + leds * 3])
    }

    /// Puts the device in custom-frame mode, which also presents the frame.
    pub fn show_custom(&self) -> Result<(), Error> {
        let mut args = [0u8; 12];
        args[0] = NOSTORE;
        args[1] = 0x00; // all leds
        args[2] = 0x08; // custom frame
        self.send(0x0F, 0x02, &args)
    }
}

/// Tries every HID interface the device has; only the control one answers
/// the firmware query, so that's how we find it.
pub fn open(api: &HidApi, pid: u16, tid: u8) -> Option<(Razer, (u8, u8))> {
    for info in api
        .device_list()
        .filter(|d| d.vendor_id() == RAZER_VID && d.product_id() == pid)
    {
        let Ok(dev) = info.open_device(api) else { continue };
        let razer = Razer { dev, tid };
        if let Ok(fw) = razer.firmware() {
            return Some((razer, fw));
        }
    }
    None
}

pub const TIDS_TO_TRY: [u8; 3] = [0x1F, 0x3F, 0xFF];
