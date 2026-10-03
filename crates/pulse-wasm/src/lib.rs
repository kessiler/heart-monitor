//! Typed-array browser adapter over the same independently testable Rust core.

use pulse_core::{Analysis, ColorMagnifier, PulseAnalyzer};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[derive(Default)]
pub struct Analyzer {
    inner: PulseAnalyzer,
    cached: Option<Analysis>,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl Analyzer {
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn reset(&mut self) {
        self.inner.reset();
        self.cached = None;
    }

    pub fn push(&mut self, timestamp: f64, green: f64) -> bool {
        let accepted = self.inner.push(timestamp, green);
        if accepted {
            self.cached = None;
        }
        accepted
    }

    /// [bpm-or-zero, signal-periodicity (0..1), window-seconds, input-Hz].
    pub fn estimate(&mut self) -> Vec<f64> {
        let analysis = self.analysis();
        vec![
            analysis.bpm.unwrap_or(0.0),
            analysis.quality,
            analysis.duration,
            analysis.sample_rate,
        ]
    }

    /// Detrended uniformly resampled display values, normalized to -1..1.
    pub fn signal(&mut self) -> Vec<f64> {
        self.analysis().signal.clone()
    }

    /// Interleaved [frequency-bpm, normalized-power, ...].
    pub fn spectrum(&mut self) -> Vec<f64> {
        self.analysis()
            .spectrum
            .iter()
            .flat_map(|&(bpm, power)| [bpm, power])
            .collect()
    }
}

impl Analyzer {
    fn analysis(&mut self) -> &Analysis {
        self.cached.get_or_insert_with(|| self.inner.analyze())
    }
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[derive(Default)]
pub struct Magnifier {
    inner: ColorMagnifier,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl Magnifier {
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn reset(&mut self) {
        self.inner.reset();
    }

    pub fn process(
        &mut self,
        rgba: &[u8],
        width: u32,
        height: u32,
        timestamp: f64,
        gain: f64,
    ) -> Vec<u8> {
        self.inner.process(rgba, width, height, timestamp, gain)
    }
}
