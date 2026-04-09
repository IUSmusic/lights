/**
 * @module models/waveforms
 *
 * Defines basic waveform generators used by the synthesis engine.  A waveform
 * generator takes a time value and returns a sample value between −1 and 1.
 */

/**
 * Evaluate a periodic waveform at time `t` with the given frequency and duty
 * cycle.  The duty cycle only applies to PWM waveforms; for other shapes it
 * is ignored.  All waveforms are periodic with period 1/`freq` seconds.
 *
 * Supported waveforms:
 * - `sine`: a classic sine wave
 * - `square`: outputs +1 for the first half of the period and −1 for the second
 * - `triangle`: a linear ramp up and down between −1 and +1
 * - `pwm`: a pulse‑width modulation waveform with high level during the
 *   fraction `duty` of the period and low level for the remainder
 * - `abs-sine`: the absolute value of a sine wave, scaled to range [−1, 1].
 *
 * @param {number} t         Absolute time in seconds.
 * @param {number} freq      Frequency of the waveform in hertz.
 * @param {'sine'|'square'|'triangle'|'pwm'|'abs-sine'} waveform – type of waveform.
 * @param {number} duty      Duty cycle for PWM (0–1).  Ignored for other types.
 * @returns {number} Sample value in the range −1 to 1.
 */
export function waveSample(t, freq, waveform, duty = 0.5) {
  const phase = (t * freq) % 1;
  const s = Math.sin(2 * Math.PI * freq * t);
  switch (waveform) {
    case "sine":
      return s;
    case "square":
      return s >= 0 ? 1 : -1;
    case "triangle":
      // Triangle ranges from −1 to +1 over one period
      return 1 - 4 * Math.abs(phase - 0.5);
    case "pwm":
      return phase < duty ? 1 : -1;
    case "abs-sine":
      // Double the absolute sine to span [0, 2], then shift to [−1, 1]
      return Math.abs(s) * 2 - 1;
    default:
      return s;
  }
}