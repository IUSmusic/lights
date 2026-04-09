/**
 * @module models/physics
 *
 * Human-readable physics summaries for the browser UI.  The README still keeps
 * the full LaTeX derivations; here we prioritise legibility on mobile browsers
 * and exported PDFs.
 */

/** Return a model title and two readable equations/relationships. */
export function physicsSummary(params) {
  if (params.mode === 'photoacoustic') {
    return {
      title: 'Photoacoustic',
      formula1: 'I(t) = I0 · [1 + m · s(t)]',
      formula2: 'τ · dT/dt = I(t) − T, and pressure p(t) follows dT/dt.',
    };
  }
  return {
    title: 'Electrical / hum',
    formula1: 'I(t) = I0 · [1 + m · s(t)]',
    formula2: 'p(t) ≈ dry(t) + Hres{dry(t)} + Awhine · sin(2π fwhine t).',
  };
}
