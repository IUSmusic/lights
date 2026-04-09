/**
 * @module models/layering
 *
 * Utilities for mixing multiple audio signals.  This module can be used to
 * combine electrical hum, photoacoustic response and sonified signals into
 * a single output.  Simple linear mixing is provided; more sophisticated
 * approaches (e.g. perceptual loudness matching) could be added later.
 */

/**
 * Linearly mix an array of Float32Array signals.  All signals must be the
 * same length.  The returned array is normalised to avoid clipping if
 * multiple signals sum to a value greater than one.
 *
 * @param {Float32Array[]} signals List of signals to mix.
 * @returns {Float32Array} Mixed and normalised signal.
 */
export function mixSignals(signals) {
  if (!signals.length) return new Float32Array(0);
  const length = signals[0].length;
  const out = new Float32Array(length);
  // Sum signals sample by sample
  signals.forEach((sig) => {
    if (sig.length !== length) throw new Error('All signals must be the same length');
    for (let i = 0; i < length; i += 1) out[i] += sig[i];
  });
  // Normalise to prevent clipping
  let peak = 1e-6;
  for (let i = 0; i < length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  const norm = Math.min(1, 0.95 / peak);
  for (let i = 0; i < length; i += 1) out[i] = Math.max(-1, Math.min(1, out[i] * norm));
  return out;
}