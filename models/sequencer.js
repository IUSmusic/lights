/**
 * @module models/sequencer
 *
 * Experimental sequencing support for Distant Lights.  A sequence consists
 * of multiple events where each event specifies a set of synthesis
 * parameters and a start time (in seconds) within a global timeline.  The
 * sequence can be rendered into a single buffer by synthesising each event
 * and mixing it into the result.  Future work could extend this to support
 * automation curves and per‑parameter envelopes.
 */

import { synthesize } from '../audio-engine/synth.js';
import { SAMPLE_RATE } from '../presets/index.js';

/**
 * Represents a single light/audio event in the sequence.
 * @typedef {Object} SequenceEvent
 * @property {number} start    Start time of the event in seconds.
 * @property {number} duration Duration of the event in seconds.
 * @property {import('../presets/index.js').Params} params Synthesis parameters.
 */

/**
 * Render a collection of sequence events into a single audio buffer.  Each
 * event is synthesised independently and added into the result at its start
 * position.  If events overlap they will be summed.  All events are
 * synthesised using the global sample rate defined in presets.
 *
 * @param {SequenceEvent[]} events Array of events to render.
 * @returns {Float32Array} Mixed audio buffer containing all events.
 */
export function renderSequence(events) {
  if (!events.length) return new Float32Array(0);
  // Determine total duration
  let maxTime = 0;
  events.forEach((ev) => {
    maxTime = Math.max(maxTime, ev.start + ev.duration);
  });
  const totalSamples = Math.ceil(maxTime * SAMPLE_RATE);
  const out = new Float32Array(totalSamples);
  // Mix each event
  events.forEach((ev) => {
    const samples = synthesize(ev.params, ev.duration, SAMPLE_RATE);
    const startSample = Math.floor(ev.start * SAMPLE_RATE);
    for (let i = 0; i < samples.length; i += 1) {
      const idx = startSample + i;
      if (idx < out.length) out[idx] += samples[i];
    }
  });
  // Normalise to avoid clipping if events overlap
  let peak = 1e-6;
  for (let i = 0; i < out.length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  const norm = Math.min(1, 0.95 / peak);
  for (let i = 0; i < out.length; i += 1) out[i] = Math.max(-1, Math.min(1, out[i] * norm));
  return out;
}