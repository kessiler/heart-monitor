use pulse_core::PulseAnalyzer;
use std::f64::consts::TAU;

fn pulse(rate: f64, bpm: f64, duration: f64, jitter: bool, noisy: bool) -> PulseAnalyzer {
    let mut analyzer = PulseAnalyzer::new();
    let mut time = 0.0;
    let mut seed = 41_u64;
    while time <= duration {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        let noise = ((seed >> 32) as u32 as f64 / u32::MAX as f64 - 0.5) * 0.6;
        let green = 128.0
            + 2.0 * (TAU * bpm / 60.0 * time).sin()
            + if noisy { noise + 0.35 * time } else { 0.0 };
        assert!(analyzer.push(time, green));
        time +=
            (1.0 + if jitter {
                0.17 * (time * 13.0).sin()
            } else {
                0.0
            }) / rate;
    }
    analyzer
}

#[test]
fn recovers_72_bpm_at_30_and_15_fps() {
    for rate in [30.0, 15.0] {
        let result = pulse(rate, 72.0, 12.0, false, false).analyze();
        let estimate = result
            .bpm
            .expect("periodic signal should yield an estimate");
        assert!((estimate - 72.0).abs() < 1.0, "{estimate}");
        assert!(result.quality > 0.7, "{}", result.quality);
        assert!((result.sample_rate - rate).abs() < 0.5);
        assert!(result.duration > 11.8 && result.duration <= 12.0);
        assert!(!result.signal.is_empty());
        assert!(result
            .signal
            .iter()
            .all(|v| v.is_finite() && v.abs() <= 1.0));
        let peak = result
            .spectrum
            .iter()
            .max_by(|a, b| a.1.total_cmp(&b.1))
            .unwrap();
        assert!((peak.0 - 72.0).abs() < 1.0);
    }
}

#[test]
fn uses_actual_jittered_timestamps_and_removes_slow_trend() {
    let result = pulse(30.0, 72.0, 13.0, true, true).analyze();
    assert!((result.bpm.unwrap() - 72.0).abs() < 1.5);
    assert!(result.quality > 0.65);
    assert!(result.duration <= 12.0);
}

#[test]
fn distinguishes_distinct_periodic_rates() {
    for bpm in [48.0, 96.0, 144.0, 174.0] {
        let result = pulse(30.0, bpm, 12.0, false, false).analyze();
        assert!((result.bpm.unwrap() - bpm).abs() < 1.0, "{bpm}: {result:?}");
    }
}

#[test]
fn does_not_report_constant_or_short_samples() {
    let short = pulse(30.0, 72.0, 3.0, false, false).analyze();
    assert!(short.bpm.is_none());
    assert!(short.duration > 2.8);
    let mut flat = PulseAnalyzer::new();
    for n in 0..361 {
        assert!(flat.push(n as f64 / 30.0, 130.0));
    }
    let result = flat.analyze();
    assert!(result.bpm.is_none());
    assert_eq!(result.quality, 0.0);
    assert!(result.signal.iter().all(|v| v.is_finite()));
}

#[test]
fn does_not_report_seeded_white_noise_as_a_pulse() {
    for initial_seed in [1_u64, 7, 91, 1701, 54321] {
        let mut analyzer = PulseAnalyzer::new();
        let mut seed = initial_seed;
        for n in 0..361 {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            let green = 128.0 + 12.0 * ((seed >> 32) as u32 as f64 / u32::MAX as f64 - 0.5);
            assert!(analyzer.push(n as f64 / 30.0, green));
        }
        let result = analyzer.analyze();
        assert!(result.bpm.is_none(), "seed {initial_seed}: {result:?}");
        assert!(result.quality < 0.65);
    }
}

#[test]
fn regression_gap_and_reset_discard_previous_window() {
    let mut analyzer = pulse(30.0, 72.0, 12.0, false, false);
    assert!(analyzer.analyze().bpm.is_some());
    assert!(analyzer.push(14.0, 128.0));
    assert_eq!(analyzer.analyze().duration, 0.0);
    assert!(analyzer.analyze().bpm.is_none());
    assert!(analyzer.push(0.0, 128.0));
    assert_eq!(analyzer.analyze().duration, 0.0);
    analyzer.reset();
    assert_eq!(analyzer.analyze().duration, 0.0);
    assert!(analyzer.analyze().signal.is_empty());
}

#[test]
fn invalid_and_duplicate_samples_do_not_corrupt_a_valid_window() {
    let mut analyzer = pulse(30.0, 72.0, 12.0, false, false);
    assert!(analyzer.push(12.05, 128.0));
    let before = analyzer.analyze();
    for (time, green) in [
        (f64::NAN, 128.0),
        (f64::INFINITY, 128.0),
        (-1.0, 128.0),
        (12.1, f64::NAN),
        (12.1, -2.0),
        (12.1, 256.0),
    ] {
        assert!(!analyzer.push(time, green));
    }
    assert!(!analyzer.push(12.05, 128.0));
    let after = analyzer.analyze();
    assert_eq!(before.duration, after.duration);
    assert_eq!(before.bpm, after.bpm);
}

#[test]
fn rolling_window_stays_bounded_after_a_long_session() {
    let result = pulse(30.0, 72.0, 120.0, true, false).analyze();
    assert!(result.duration <= 12.0);
    assert!((result.bpm.unwrap() - 72.0).abs() < 1.5);
    assert!(result.signal.len() <= 1441);
}

#[test]
fn extreme_timestamps_never_produce_nonfinite_public_values() {
    let mut analyzer = PulseAnalyzer::new();
    assert!(analyzer.push(0.0, 128.0));
    assert!(analyzer.push(1e-310, 129.0));
    let result = analyzer.analyze();
    assert!(result.sample_rate.is_finite());
    assert!(result.quality.is_finite());
    assert!(result.duration.is_finite());
    assert!(result.bpm.is_none());
}

#[test]
fn refuses_slow_sampling_and_out_of_band_lighting_changes() {
    assert!(pulse(5.0, 72.0, 12.0, false, false).analyze().bpm.is_none());
    for frequency in [0.1, 0.25, 0.5, 3.5, 5.0] {
        let mut analyzer = PulseAnalyzer::new();
        for n in 0..361 {
            let time = n as f64 / 30.0;
            assert!(analyzer.push(time, 128.0 + 5.0 * (TAU * frequency * time).sin()));
        }
        assert!(
            analyzer.analyze().bpm.is_none(),
            "lighting/artifact at {frequency} Hz"
        );
    }
}

#[test]
fn does_not_report_noise_over_multiple_rates_and_windows() {
    for rate in [15.0, 30.0, 60.0] {
        for duration in [8.0, 12.0] {
            for initial_seed in 0..30_u64 {
                let mut analyzer = PulseAnalyzer::new();
                let mut seed = initial_seed;
                for n in 0..=(rate * duration) as usize {
                    seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                    let green = 128.0 + 12.0 * ((seed >> 32) as u32 as f64 / u32::MAX as f64 - 0.5);
                    assert!(analyzer.push(n as f64 / rate, green));
                }
                assert!(
                    analyzer.analyze().bpm.is_none(),
                    "{rate} Hz, {duration}s, seed {initial_seed}"
                );
            }
        }
    }
}

fn burst_signal(samples_per_burst: usize) -> PulseAnalyzer {
    let mut analyzer = PulseAnalyzer::new();
    for group in 0..25 {
        for offset in 0..samples_per_burst {
            let time = group as f64 / 2.0 + offset as f64 * 0.001;
            assert!(analyzer.push(time, 128.0 + 2.0 * (TAU * 1.2 * time).sin()));
        }
    }
    analyzer
}

#[test]
fn sparse_bursts_cannot_masquerade_as_a_high_frame_rate() {
    let result = burst_signal(3).analyze();
    assert!(result.bpm.is_none(), "aliased estimate: {:?}", result.bpm);
    assert!((result.sample_rate - 6.0).abs() < 0.1);
}

#[test]
fn rejects_bursty_samples_even_when_average_cadence_exceeds_eight_fps() {
    let result = burst_signal(5).analyze();
    assert!(result.bpm.is_none(), "aliased estimate: {:?}", result.bpm);
    assert_eq!(result.quality, 0.0);
}

#[test]
fn high_cadence_out_of_band_variation_does_not_alias_into_pulse_band() {
    let mut analyzer = PulseAnalyzer::new();
    for n in 0..=2880 {
        let time = n as f64 / 240.0;
        assert!(analyzer.push(time, 128.0 + 2.0 * (TAU * 118.8 * time).sin()));
    }
    let result = analyzer.analyze();
    assert!(
        result.bpm.is_none(),
        "118.8 Hz sampled at 240 Hz must not produce {:?} BPM (quality {})",
        result.bpm,
        result.quality
    );
}

#[test]
fn high_cadence_real_pulses_survive_uniform_and_jittered_timestamps() {
    for rate in [120.0, 240.0] {
        for bpm in [48.0, 72.0, 120.0, 174.0] {
            for jitter in [false, true] {
                let result = pulse(rate, bpm, 12.0, jitter, false).analyze();
                let estimate = result.bpm.expect("in-band pulse should remain measurable");
                assert!(
                    (estimate - bpm).abs() < 1.0,
                    "{rate} Hz, jitter {jitter}: expected {bpm} BPM, got {estimate} BPM"
                );
                assert!(result.quality > 0.7);
                assert!(result.duration <= 12.0);
                assert!(result.signal.len() <= 4096);
            }
        }
    }
}

#[test]
fn high_cadence_resampling_stays_bounded_by_the_stored_window() {
    let result = pulse(480.0, 72.0, 20.0, false, false).analyze();
    assert!(result.signal.len() <= 4096);
    assert!((result.bpm.unwrap() - 72.0).abs() < 1.0);
    assert!(result.duration >= 8.0 && result.duration <= 12.0);
}
