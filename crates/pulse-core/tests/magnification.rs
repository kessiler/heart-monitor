use pulse_core::ColorMagnifier;

fn frame(green: u8) -> Vec<u8> {
    [120, green, 100, 255].repeat(32 * 16)
}

#[test]
fn zero_gain_returns_the_exact_original_pixels() {
    let mut magnifier = ColorMagnifier::new();
    for n in 0..20 {
        let input = frame(120 + n % 10);
        assert_eq!(
            magnifier.process(&input, 32, 16, n as f64 / 30.0, 0.0),
            input
        );
    }
}

#[test]
fn magnifies_temporal_color_changes_and_preserves_alpha() {
    let mut magnifier = ColorMagnifier::new();
    let original = frame(120);
    assert_eq!(magnifier.process(&original, 32, 16, 0.0, 20.0), original);
    let changed = frame(124);
    let output = magnifier.process(&changed, 32, 16, 1.0 / 30.0, 20.0);
    assert_eq!(output.len(), changed.len());
    assert!(output[1] > changed[1]);
    assert_eq!(output[0], changed[0]);
    assert_eq!(output[3], changed[3]);
}

#[test]
fn reset_resize_and_gaps_warm_up_from_current_frame() {
    let mut magnifier = ColorMagnifier::new();
    magnifier.process(&frame(120), 32, 16, 0.0, 20.0);
    magnifier.process(&frame(124), 32, 16, 0.03, 20.0);
    magnifier.reset();
    let input = frame(130);
    assert_eq!(magnifier.process(&input, 32, 16, 1.0, 20.0), input);
    let small = [120, 130, 100, 200];
    assert_eq!(magnifier.process(&small, 1, 1, 1.03, 20.0), small);
    assert_eq!(magnifier.process(&small, 1, 1, 5.0, 20.0), small);
    assert_eq!(magnifier.process(&small, 1, 1, 0.0, 20.0), small);
}

#[test]
fn malformed_frames_are_rejected_without_dimension_based_allocation() {
    let mut magnifier = ColorMagnifier::new();
    for (width, height) in [(0, 2), (2, 0), (u32::MAX, u32::MAX), (2, 2), (8192, 8192)] {
        assert!(magnifier
            .process(&[1, 2, 3, 255], width, height, 0.0, 20.0)
            .is_empty());
    }
    assert!(magnifier
        .process(&[1, 2, 3, 255], 1, 1, f64::NAN, 20.0)
        .is_empty());
    assert!(magnifier
        .process(&[1, 2, 3, 255], 1, 1, 0.0, f64::INFINITY)
        .is_empty());
}

#[test]
fn temporal_magnification_remains_local_to_reduced_spatial_cells() {
    let mut magnifier = ColorMagnifier::new();
    let original = [120, 128, 100, 230].repeat(16 * 8);
    magnifier.process(&original, 16, 8, 0.0, 80.0);
    let mut changed = original;
    for y in 0..8 {
        for x in 0..8 {
            changed[(y * 16 + x) * 4 + 1] = 132;
        }
    }
    let output = magnifier.process(&changed, 16, 8, 0.03, 80.0);
    assert!(output[1] > changed[1]);
    assert_eq!(output[8 * 4 + 1], changed[8 * 4 + 1]);
    assert!(output
        .as_chunks::<4>()
        .0
        .iter()
        .all(|pixel| pixel[3] == 230));
}

#[test]
fn amplification_saturates_instead_of_wrapping_pixel_values() {
    let mut magnifier = ColorMagnifier::new();
    magnifier.process(&[0, 128, 255, 200], 1, 1, 0.0, 1000.0);
    assert_eq!(
        magnifier.process(&[255, 128, 0, 200], 1, 1, 0.03, 1000.0),
        [255, 128, 0, 200]
    );
}
