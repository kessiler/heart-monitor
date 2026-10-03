//! Lightweight experimental remote photoplethysmography from a selected video ROI.
//!
//! This is an independent educational adaptation, not the full MIT Eulerian
//! video magnification algorithm and not a medical device. Motion, illumination,
//! compression, skin characteristics and harmonics can create periodic artifacts.
//! `quality` describes periodicity only; it is not confidence in a person's pulse.

use std::collections::VecDeque;
use std::f64::consts::TAU;

const WINDOW_SECONDS: f64 = 12.0;
const MIN_SECONDS: f64 = 8.0;
const MAX_GAP_SECONDS: f64 = 0.5;
const MAX_SAMPLES: usize = 4096;
const MIN_BPM: f64 = 42.0;
const MAX_BPM: f64 = 180.0;
const BPM_STEP: f64 = 0.5;

#[derive(Debug, Default)]
pub struct Analysis {
    pub bpm: Option<f64>,
    pub quality: f64,
    pub duration: f64,
    pub sample_rate: f64,
    pub signal: Vec<f64>,
    pub spectrum: Vec<(f64, f64)>,
}

#[derive(Clone, Copy)]
struct Sample {
    timestamp: f64,
    green: f64,
}

#[derive(Default)]
pub struct PulseAnalyzer {
    samples: VecDeque<Sample>,
}

impl PulseAnalyzer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn reset(&mut self) {
        self.samples.clear();
    }

    /// Accepts the original ROI mean green value (0..255) and real timestamp.
    /// Invalid/duplicate samples leave the window untouched. Seek backwards or
    /// a long pause starts a new window, preventing interpolation across gaps.
    pub fn push(&mut self, timestamp: f64, green: f64) -> bool {
        if !timestamp.is_finite()
            || timestamp < 0.0
            || !green.is_finite()
            || !(0.0..=255.0).contains(&green)
        {
            return false;
        }
        if let Some(previous) = self.samples.back() {
            let delta = timestamp - previous.timestamp;
            if delta == 0.0 {
                return false;
            }
            if !(0.0..=MAX_GAP_SECONDS).contains(&delta) {
                self.reset();
            }
        }
        self.samples.push_back(Sample { timestamp, green });
        while self.samples.len() > MAX_SAMPLES
            || self
                .samples
                .front()
                .is_some_and(|first| timestamp - first.timestamp > WINDOW_SECONDS)
        {
            self.samples.pop_front();
        }
        true
    }

    /// Resamples onto a uniform timeline, detrends, applies a Hann window and
    /// scans 42..180 bpm. At least eight seconds and eight samples per second
    /// are required. A sinusoidal fit and cycle agreement reject broadband noise.
    pub fn analyze(&self) -> Analysis {
        let mut result = Analysis::default();
        let Some(first) = self.samples.front() else {
            return result;
        };
        let Some(last) = self.samples.back() else {
            return result;
        };
        result.duration = last.timestamp - first.timestamp;
        if self.samples.len() < 2 || result.duration <= 0.0 {
            return result;
        }

        let samples: Vec<_> = self.samples.iter().copied().collect();
        let mut intervals: Vec<_> = samples
            .windows(2)
            .map(|pair| pair[1].timestamp - pair[0].timestamp)
            .collect();
        intervals.sort_by(f64::total_cmp);
        let median_interval = intervals[intervals.len() / 2];
        // Effective cadence counts every accepted sample over the real window;
        // a cluster of fast samples cannot hide long unobserved intervals.
        result.sample_rate = (samples.len() - 1) as f64 / result.duration;
        if !result.sample_rate.is_finite() {
            result.sample_rate = 0.0;
            return result;
        }
        if result.sample_rate < 8.0
            || intervals
                .last()
                .is_some_and(|&longest| longest > 3.0 * median_interval)
        {
            return result;
        }
        // Bound spectral work even if callers supply unusually fast frames.
        let count = (result.duration * result.sample_rate.min(120.0)).floor() as usize + 1;
        if count < 3 {
            return result;
        }
        let interval = result.duration / (count - 1) as f64;
        let mut signal = resample(&samples, count, interval);
        detrend(&mut signal);
        let variance = signal.iter().map(|value| value * value).sum::<f64>() / count as f64;
        let amplitude = signal
            .iter()
            .fold(0.0_f64, |max, value| max.max(value.abs()));
        if amplitude < 0.0001 || variance < 1e-8 {
            result.signal = vec![0.0; count];
            return result;
        }
        result.signal = signal.iter().map(|value| value / amplitude).collect();
        if result.duration < MIN_SECONDS {
            return result;
        }

        let weighted: Vec<_> = signal
            .iter()
            .enumerate()
            .map(|(index, value)| {
                value * 0.5 * (1.0 - (TAU * index as f64 / (count - 1) as f64).cos())
            })
            .collect();
        let weight_sum = (count - 1) as f64 / 2.0;
        let mut powers = Vec::with_capacity(277);
        for index in 0..=((MAX_BPM - MIN_BPM) / BPM_STEP) as usize {
            let bpm = MIN_BPM + index as f64 * BPM_STEP;
            powers.push((bpm, spectral_power(&weighted, bpm / 60.0, interval)));
        }
        let peak_index = powers
            .iter()
            .enumerate()
            .max_by(|a, b| a.1 .1.total_cmp(&b.1 .1))
            .map_or(0, |(index, _)| index);
        let (peak_bpm, peak_power) = powers[peak_index];
        if peak_power <= 0.0 {
            return result;
        }
        result.spectrum = powers
            .iter()
            .map(|&(bpm, power)| (bpm, power / peak_power))
            .collect();

        let total_power: f64 = powers.iter().map(|&(_, power)| power).sum();
        let main_lobe_bpm = 75.0 / result.duration;
        let peak_band_power: f64 = powers
            .iter()
            .filter(|&&(bpm, _)| (bpm - peak_bpm).abs() <= main_lobe_bpm)
            .map(|&(_, power)| power)
            .sum();
        let concentration = (peak_band_power / total_power).clamp(0.0, 1.0);
        // Hann-corrected fitted sinusoid energy versus all detrended variation.
        // This also rejects a strong slow lighting fluctuation leaking into band.
        let explained = (2.0 * peak_power / (weight_sum * weight_sum * variance)).clamp(0.0, 1.0);
        let cycle_samples = (60.0 / peak_bpm / interval).round() as usize;
        let agreement = cycle_agreement(&signal, cycle_samples).clamp(0.0, 1.0);
        result.quality = (concentration * explained * agreement)
            .cbrt()
            .clamp(0.0, 1.0);
        // Boundary maxima are unresolved peaks: do not imply a rate clipped to
        // the search range. Quality gating is heuristic, not clinical validation.
        if peak_index >= 2
            && peak_index + 2 < powers.len()
            && concentration >= 0.55
            && explained >= 0.5
            && agreement >= 0.55
            && result.quality >= 0.65
        {
            result.bpm = Some(peak_bpm);
        }
        result
    }
}

fn resample(samples: &[Sample], count: usize, interval: f64) -> Vec<f64> {
    let mut cursor = 0;
    (0..count)
        .map(|index| {
            let timestamp = samples[0].timestamp + index as f64 * interval;
            while cursor + 2 < samples.len() && samples[cursor + 1].timestamp < timestamp {
                cursor += 1;
            }
            let a = samples[cursor];
            let b = samples[cursor + 1];
            let fraction =
                ((timestamp - a.timestamp) / (b.timestamp - a.timestamp)).clamp(0.0, 1.0);
            a.green + fraction * (b.green - a.green)
        })
        .collect()
}

fn detrend(signal: &mut [f64]) {
    let mean = signal.iter().sum::<f64>() / signal.len() as f64;
    let midpoint = (signal.len() - 1) as f64 / 2.0;
    let mut covariance = 0.0;
    let mut time_variance = 0.0;
    for (index, &value) in signal.iter().enumerate() {
        let centered_time = index as f64 - midpoint;
        covariance += centered_time * (value - mean);
        time_variance += centered_time * centered_time;
    }
    let slope = covariance / time_variance;
    for (index, value) in signal.iter_mut().enumerate() {
        *value -= mean + slope * (index as f64 - midpoint);
    }
}

fn spectral_power(signal: &[f64], frequency: f64, interval: f64) -> f64 {
    // Trigonometric recurrence avoids sin/cos calls per sample in WebAssembly.
    let angle = TAU * frequency * interval;
    let (step_sin, step_cos) = angle.sin_cos();
    let (mut sin, mut cos) = (0.0, 1.0);
    let (mut real, mut imaginary) = (0.0, 0.0);
    for &value in signal {
        real += value * cos;
        imaginary += value * sin;
        (sin, cos) = (
            sin * step_cos + cos * step_sin,
            cos * step_cos - sin * step_sin,
        );
    }
    real * real + imaginary * imaginary
}

fn cycle_agreement(signal: &[f64], lag: usize) -> f64 {
    if lag == 0 || lag >= signal.len() {
        return 0.0;
    }
    let (mut product, mut first_energy, mut second_energy) = (0.0, 0.0, 0.0);
    for index in lag..signal.len() {
        let first = signal[index - lag];
        let second = signal[index];
        product += first * second;
        first_energy += first * first;
        second_energy += second * second;
    }
    let denominator = (first_energy * second_energy).sqrt();
    if denominator > 1e-12 {
        product / denominator
    } else {
        0.0
    }
}

const MAX_PIXELS: usize = 1920 * 1080;

#[derive(Default)]
pub struct ColorMagnifier {
    width: u32,
    height: u32,
    timestamp: Option<f64>,
    slow: Vec<[f64; 3]>,
    fast: Vec<[f64; 3]>,
}

impl ColorMagnifier {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn reset(&mut self) {
        self.timestamp = None;
        self.slow.clear();
        self.fast.clear();
    }

    /// A reduced spatial grid and difference of temporal IIR lowpass filters.
    /// Gain affects only displayed RGB; callers must measure original frames.
    /// Invalid data returns an empty vector; first/seek/gap frames pass unchanged.
    pub fn process(
        &mut self,
        rgba: &[u8],
        width: u32,
        height: u32,
        timestamp: f64,
        gain: f64,
    ) -> Vec<u8> {
        let Some(pixels) = (width as usize).checked_mul(height as usize) else {
            return Vec::new();
        };
        if pixels == 0
            || pixels > MAX_PIXELS
            || pixels.checked_mul(4) != Some(rgba.len())
            || !timestamp.is_finite()
            || timestamp < 0.0
            || !gain.is_finite()
        {
            return Vec::new();
        }
        let grid_width = width.div_ceil(8).min(64) as usize;
        let grid_height = height.div_ceil(8).min(64) as usize;
        let cells = grid_width * grid_height;
        let mut reduced = vec![[0.0; 3]; cells];
        let mut counts = vec![0_u32; cells];
        for (index, pixel) in rgba.as_chunks::<4>().0.iter().enumerate() {
            let x = index % width as usize;
            let y = index / width as usize;
            let cell =
                y * grid_height / height as usize * grid_width + x * grid_width / width as usize;
            for channel in 0..3 {
                reduced[cell][channel] += pixel[channel] as f64;
            }
            counts[cell] += 1;
        }
        for (cell, values) in reduced.iter_mut().enumerate() {
            for value in values {
                *value /= counts[cell] as f64;
            }
        }
        let delta = self.timestamp.map_or(0.0, |previous| timestamp - previous);
        if self.width != width
            || self.height != height
            || self.slow.len() != cells
            || self.timestamp.is_none()
            || !(0.0..=MAX_GAP_SECONDS).contains(&delta)
            || delta == 0.0
        {
            self.width = width;
            self.height = height;
            self.timestamp = Some(timestamp);
            self.slow = reduced.clone();
            self.fast = reduced;
            return rgba.to_vec();
        }
        self.timestamp = Some(timestamp);
        let slow_alpha = 1.0 - (-TAU * 0.7 * delta).exp();
        let fast_alpha = 1.0 - (-TAU * 3.0 * delta).exp();
        for (cell, values) in reduced.iter().enumerate() {
            for (channel, &value) in values.iter().enumerate() {
                self.slow[cell][channel] += slow_alpha * (value - self.slow[cell][channel]);
                self.fast[cell][channel] += fast_alpha * (value - self.fast[cell][channel]);
            }
        }
        let mut output = rgba.to_vec();
        let gain = gain.clamp(0.0, 100.0);
        if gain == 0.0 {
            return output;
        }
        for (index, pixel) in output.as_chunks_mut::<4>().0.iter_mut().enumerate() {
            let x = index % width as usize;
            let y = index / width as usize;
            let cell =
                y * grid_height / height as usize * grid_width + x * grid_width / width as usize;
            for (channel, value) in pixel.iter_mut().take(3).enumerate() {
                let band = self.fast[cell][channel] - self.slow[cell][channel];
                *value = (*value as f64 + gain * band).round().clamp(0.0, 255.0) as u8;
            }
        }
        output
    }
}
