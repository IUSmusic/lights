/**
 * @module models/physics
 *
 * Provides textual descriptions and LaTeX formulas for the currently
 * implemented physical models.  The UI calls this function to update the
 * explanatory panel when the user changes parameters.  Separating the
 * summary logic from the UI makes it easy to extend or replace the models
 * without touching the rendering code.
 */

/**
 * Return a summary of the selected model including a short title and two
 * mathematical expressions in LaTeX.  For the electrical model we show the
 * modulation equation and the approximate sound pressure expression.  For
 * the photoacoustic model we show the modulation equation and the first‑order
 * thermal differential equation.
 *
 * @param {import('../presets/index.js').Params} params Parameters describing
 *  the current state.  Only `mode` is inspected.
 * @returns {{title: string, formula1: string, formula2: string}} Summary
 *  information.
 */
export function physicsSummary(params) {
  if (params.mode === 'photoacoustic') {
    return {
      title: 'Photoacoustic',
      // Incident light intensity modulation
      formula1: 'I(t) = I_0\,[1 + m\,s(t)]',
      // First‑order thermal filter followed by differentiation
      formula2: '\n\tau\,\frac{\mathrm{d}T}{\mathrm{d}t} = I(t) - T,\quad p(t) \propto \frac{\mathrm{d}T}{\mathrm{d}t}',
    };
  }
  return {
    title: 'Electrical / hum',
    // Amplitude modulation of current
    formula1: 'I(t) = I_0\,[1 + m\,s(t)]',
    // Approximate sound pressure combining dry and resonant components
    formula2: '\n p(t) \approx x_\text{dry}(t) + H_\text{res}\{x_\text{dry}(t)\} + A_\text{whine}\,\sin(2\pi f_\text{whine}\,t)',
  };
}