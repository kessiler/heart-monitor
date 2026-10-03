use pulse_wasm::{Analyzer, Magnifier};
use std::f64::consts::TAU;

#[test]
fn estimate_has_the_locked_browser_shape_for_empty_and_ready_windows() {
    let mut analyzer = Analyzer::new();
    assert_eq!(analyzer.estimate(), vec![0.0, 0.0, 0.0, 0.0]);
    for n in 0..361 {
        let time = n as f64 / 30.0;
        assert!(analyzer.push(time, 128.0 + 2.0 * (TAU * 1.2 * time).sin()));
    }
    let estimate = analyzer.estimate();
    assert_eq!(estimate.len(), 4);
    assert!((estimate[0] - 72.0).abs() < 1.0);
    assert!(estimate[1] > 0.7 && estimate[1] <= 1.0);
    assert_eq!(estimate[2], 12.0);
    assert!((estimate[3] - 30.0).abs() < 0.5);
    assert!(!analyzer.signal().is_empty());
    let spectrum = analyzer.spectrum();
    assert_eq!(spectrum.len() % 2, 0);
    assert!(spectrum
        .as_chunks::<2>()
        .0
        .iter()
        .all(|pair| pair[0] >= 42.0 && pair[0] <= 180.0 && pair[1] >= 0.0 && pair[1] <= 1.0));
    analyzer.reset();
    assert_eq!(analyzer.estimate(), vec![0.0, 0.0, 0.0, 0.0]);
    assert!(analyzer.signal().is_empty());
    assert!(analyzer.spectrum().is_empty());
}

#[test]
fn bridge_rejects_invalid_inputs_and_serializes_missing_pulse_as_zero() {
    let mut analyzer = Analyzer::new();
    assert!(!analyzer.push(f64::NAN, 128.0));
    assert!(!analyzer.push(0.0, 1000.0));
    for n in 0..361 {
        assert!(analyzer.push(n as f64 / 30.0, 128.0));
    }
    assert_eq!(analyzer.estimate()[0], 0.0);
    assert!(analyzer.estimate().iter().all(|value| value.is_finite()));
    let mut magnifier = Magnifier::new();
    assert!(magnifier
        .process(&[0; 4], u32::MAX, u32::MAX, 0.0, 80.0)
        .is_empty());
    let original = [120, 124, 100, 230];
    assert_eq!(magnifier.process(&original, 1, 1, 0.0, 0.0), original);
    magnifier.reset();
    assert_eq!(magnifier.process(&original, 1, 1, 0.0, 80.0), original);
}

#[test]
fn new_samples_refresh_all_cached_browser_outputs() {
    let mut analyzer = Analyzer::new();
    analyzer.estimate();
    assert!(analyzer.push(0.0, 128.0));
    assert!(analyzer.push(0.1, 129.0));
    assert_eq!(analyzer.estimate()[2], 0.1);
    assert!(analyzer.push(0.2, 127.0));
    assert_eq!(analyzer.estimate()[2], 0.2);
    assert!(!analyzer.signal().is_empty());
    assert!(!analyzer.push(0.2, 127.0));
    assert_eq!(analyzer.estimate()[2], 0.2);
    assert!(analyzer.push(3.0, 128.0));
    assert_eq!(analyzer.estimate()[2], 0.0);
    assert!(analyzer.signal().is_empty());
}
