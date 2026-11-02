use serde::{Deserialize, Serialize};
use std::{fs, io, path::Path};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// Master switch. Off means everything goes dark.
    pub enabled: bool,
    /// Lights go dark after this long without input. 0 means never.
    pub idle_timeout_secs: u64,
    /// Frame rate for streamed lighting, 0.1 to 60.
    pub fps: f32,
    pub devices: Vec<DeviceCfg>,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Keyboard,
    Mouse,
    Other,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCfg {
    pub name: String,
    pub pid: u16,
    pub transaction_id: u8,
    pub kind: Kind,
    /// LED matrix size, for streamed frames.
    pub rows: u8,
    pub cols: u8,
    /// LED zone ids, for on-device effects and brightness.
    pub leds: Vec<u8>,
    pub brightness: u8,
    /// If the stack is just one simple layer, let the device run it (0% CPU)
    /// instead of streaming it.
    pub prefer_hardware: bool,
    /// Top layer first.
    pub layers: Vec<Layer>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Layer {
    pub id: String,
    pub enabled: bool,
    pub opacity: f32,
    pub blend: Blend,
    pub effect: LayerEffect,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Blend {
    Normal,
    Add,
    Screen,
    Multiply,
    Lighten,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Trigger {
    Keys,
    Clicks,
    Both,
}

impl Trigger {
    pub fn keys(self) -> bool {
        matches!(self, Trigger::Keys | Trigger::Both)
    }
    pub fn clicks(self) -> bool {
        matches!(self, Trigger::Clicks | Trigger::Both)
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Palette {
    Classic,
    Soul,
    Toxic,
    Cursed,
    /// Uses the layer's own `custom` stops.
    Custom,
}

/// Default custom stops, same as Classic. Coolest → hottest.
pub fn default_custom_stops() -> Vec<[u8; 3]> {
    vec![[0, 0, 0], [130, 0, 0], [255, 45, 0], [255, 140, 0], [255, 230, 120]]
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum LayerEffect {
    Fire {
        palette: Palette,
        /// Stops for `Palette::Custom`, coolest → hottest (2 to 8 of them).
        #[serde(default = "default_custom_stops")]
        custom: Vec<[u8; 3]>,
        cooling: f32,
        sparks: f32,
        react_to_keys: bool,
    },
    Solid { color: [u8; 3] },
    Breathing { color: [u8; 3], period_secs: f32 },
    Spectrum { period_secs: f32 },
    Wave { period_secs: f32, reverse: bool },
    Reactive { color: [u8; 3], fade_ms: u32, trigger: Trigger },
    Ripple { color: [u8; 3], speed: f32, width: f32, trigger: Trigger },
    Starlight { color: [u8; 3], density: f32, fade_ms: u32 },
}

impl LayerEffect {
    /// (needs keyboard events, needs click events)
    pub fn input_needs(&self) -> (bool, bool) {
        match self {
            LayerEffect::Fire { react_to_keys, .. } => (*react_to_keys, false),
            LayerEffect::Reactive { trigger, .. } | LayerEffect::Ripple { trigger, .. } => {
                (trigger.keys(), trigger.clicks())
            }
            _ => (false, false),
        }
    }

    fn hardware_capable(&self) -> bool {
        matches!(
            self,
            LayerEffect::Solid { .. }
                | LayerEffect::Breathing { .. }
                | LayerEffect::Spectrum { .. }
                | LayerEffect::Wave { .. }
        )
    }
}

/// How a device's stack actually gets driven.
#[derive(Clone, Debug, PartialEq)]
pub enum Plan {
    /// Nothing is enabled, lights off.
    Off,
    /// One simple layer the device can animate on its own.
    Device(LayerEffect),
    /// Composite it here and stream the frames.
    Stream,
}

impl DeviceCfg {
    pub fn active_layers(&self) -> impl DoubleEndedIterator<Item = &Layer> {
        self.layers.iter().filter(|l| l.enabled && l.opacity > 0.0)
    }

    pub fn plan(&self) -> Plan {
        let active: Vec<&Layer> = self.active_layers().collect();
        match active.as_slice() {
            [] => Plan::Off,
            [only]
                if self.prefer_hardware
                    && only.opacity >= 0.99
                    && only.blend != Blend::Multiply
                    && only.effect.hardware_capable() =>
            {
                Plan::Device(only.effect.clone())
            }
            _ => Plan::Stream,
        }
    }

    /// (keyboard, mouse) hooks this device's streamed layers need.
    pub fn input_needs(&self) -> (bool, bool) {
        if self.plan() != Plan::Stream {
            return (false, false);
        }
        self.active_layers()
            .map(|l| l.effect.input_needs())
            .fold((false, false), |a, b| (a.0 | b.0, a.1 | b.1))
    }
}

fn layer(id: &str, blend: Blend, opacity: f32, effect: LayerEffect) -> Layer {
    Layer { id: id.into(), enabled: true, opacity, blend, effect }
}

impl Default for Config {
    fn default() -> Self {
        let fire = || LayerEffect::Fire {
            palette: Palette::Classic,
            custom: default_custom_stops(),
            cooling: 0.22,
            sparks: 0.6,
            react_to_keys: true,
        };
        Self {
            enabled: true,
            idle_timeout_secs: 300,
            fps: 24.0,
            devices: vec![
                DeviceCfg {
                    name: "BlackWidow V4 X".into(),
                    pid: 0x0293, // double check with "Scan for devices"
                    transaction_id: 0x1F,
                    kind: Kind::Keyboard,
                    rows: 6,
                    cols: 22,
                    leds: vec![0x05],
                    brightness: 255,
                    prefer_hardware: true,
                    layers: vec![
                        layer(
                            "kb-ripple",
                            Blend::Screen,
                            0.8,
                            LayerEffect::Ripple { color: [255, 210, 120], speed: 14.0, width: 1.4, trigger: Trigger::Keys },
                        ),
                        layer("kb-fire", Blend::Normal, 1.0, fire()),
                    ],
                },
                DeviceCfg {
                    name: "Cobra".into(),
                    pid: 0x00A3, // double check with "Scan for devices"
                    transaction_id: 0x1F,
                    kind: Kind::Mouse,
                    rows: 1,
                    cols: 1,
                    leds: vec![0x00],
                    brightness: 255,
                    prefer_hardware: true,
                    layers: vec![
                        layer(
                            "m-click",
                            Blend::Add,
                            1.0,
                            LayerEffect::Reactive { color: [255, 200, 80], fade_ms: 350, trigger: Trigger::Clicks },
                        ),
                        layer("m-fire", Blend::Normal, 1.0, fire()),
                    ],
                },
            ],
        }
    }
}

pub fn load(path: &Path) -> Config {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(path: &Path, cfg: &Config) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_string_pretty(cfg).map_err(io::Error::other)?;
    fs::write(path, json)
}
