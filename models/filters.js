/**
 * @module models/filters
 *
 * Implements simple digital filter utilities used by the synthesiser.  The
 * current implementation provides a second‑order resonant band‑pass filter
 * approximating resonances in fixtures or enclosures.  It is implemented
 * directly from the bilinear transform formulas for a biquad filter.
 */

/**
 * Clamp a value to the inclusive range [`min`, `max`].  Used to ensure that
 * parameters stay within stable ranges for the filter design.
 *
 * @param {number} value The input value to clamp.
 * @param {number} min   Minimum allowed value.
 * @param {number} max   Maximum allowed value.
 * @returns {number} The clamped value.
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Compute normalised biquad coefficients for a second‑order band‑pass filter.
 * The design uses a constant skirt gain (peak gain of one) and is based on
 * standard RBJ audio EQ formulas.  The filter’s natural frequency and quality
 * factor determine its centre frequency and bandwidth.  Internally the
 * coefficients are normalised by `a0` so that `a0` is 1.
 *
 * @param {number} sampleRate Sampling rate in hertz.
 * @param {number} f0         Centre frequency of the filter in hertz.
 * @param {number} q          Quality factor (dimensionless).  Values less than
 *  0.2 produce a very broad filter; values above 30 are rarely useful.
 * @returns {Object} An object containing the filter coefficients b0, b1, b2,
 *  a1 and a2 suitable for use in a direct‑form II implementation.
 */
export function makeBandPassCoefficients(sampleRate, f0, q) {
  // Constrain the parameters to stable ranges.  The highest usable frequency
  // must be less than Nyquist (sampleRate/2).  A guard band of 100 Hz is
  // maintained to prevent extreme behaviour near Nyquist.
  const safeF0 = clamp(f0, 20, sampleRate / 2 - 100);
  const safeQ = clamp(q, 0.2, 30);
  const w0 = (2 * Math.PI * safeF0) / sampleRate;
  const alpha = Math.sin(w0) / (2 * safeQ);
  const cosw0 = Math.cos(w0);
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha;
  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

/**
 * Apply a second‑order band‑pass filter to a Float32Array of samples.  The
 * filter is implemented as a direct‑form II transposed structure which is
 * numerically stable for audio use.  No denormal avoidance is necessary for
 * typical audio content.  See [RBJ Audio EQ Cookbook] for derivation.
 *
 * @param {Float32Array} samples   Input time‑domain samples to process.
 * @param {number} sampleRate      Sampling rate in hertz.
 * @param {number} f0              Centre frequency of the filter in hertz.
 * @param {number} q               Quality factor.
 * @returns {Float32Array} New Float32Array containing the filtered samples.
 */
export function applyBandPass(samples, sampleRate, f0, q) {
  const c = makeBandPassCoefficients(sampleRate, f0, q);
  const out = new Float32Array(samples.length);
  // State variables for the transposed direct‑form II implementation
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x0 = samples[i];
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    out[i] = y0;
    // Shift the delayed samples for next iteration
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}