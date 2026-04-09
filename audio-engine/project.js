/**
 * @module audio-engine/project
 *
 * Advanced rendering utilities for the Distant Lights "project" view.  A
 * project is broader than a single preset: it can include multi-model layer
 * mixing, LFO automation, sequencing over time, MIDI export targets and OSC-
 * style automation bundles.  The browser demo keeps the JavaScript version as a
 * playful, interactive front end, while the Python port remains the high-
 * precision research implementation.
 */

import { waveSample } from '../models/waveforms.js';
import { makeBandPassCoefficients } from '../models/filters.js';
import { mixSignals } from '../models/layering.js';
import { CONTROL_CONFIG, SAMPLE_RATE } from '../presets/index.js';

/** Map numeric parameter keys to their legal UI ranges so automation can clamp safely. */
const PARAM_RANGES = Object.fromEntries(
  CONTROL_CONFIG.filter((item) => item.type === 'range').map((item) => [item.key, { min: item.min, max: item.max }]),
);

/** Clamp a number to the inclusive range [min, max]. */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Convert an LFO waveform name into a periodic control signal in the range [-1, 1]. */
function automationWaveSample(timeSeconds, rateHz, waveform, phaseDegrees = 0) {
  const phase = (((timeSeconds * rateHz) + (phaseDegrees / 360)) % 1 + 1) % 1;
  switch (waveform) {
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5);
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'saw':
      return 2 * phase - 1;
    case 'inv-saw':
      return 1 - 2 * phase;
    default:
      return Math.sin(2 * Math.PI * phase);
  }
}

/**
 * Evaluate automation lanes at a given time and return a fresh parameter object.
 * Each lane can target any numeric parameter exposed by the control panel.
 *
 * @param {Object} params Base parameter object.
 * @param {number} timeSeconds Absolute time in seconds.
 * @param {Array<Object>} automationLanes Lane definitions.
 * @returns {Object} Effective parameter object for the current instant.
 */
export function evaluateAutomatedParams(params, timeSeconds, automationLanes = []) {
  const out = { ...params };
  automationLanes.forEach((lane) => {
    if (!lane || !lane.enabled || !(lane.target in out)) return;
    const range = PARAM_RANGES[lane.target] || { min: out[lane.target] - Math.abs(out[lane.target] || 1), max: out[lane.target] + Math.abs(out[lane.target] || 1) };
    const lfo = automationWaveSample(timeSeconds, lane.rateHz || 0, lane.waveform || 'sine', lane.phaseDegrees || 0);
    if (lane.mode === 'multiply') {
      out[lane.target] *= 1 + lfo * (lane.depth || 0);
    } else {
      const span = (range.max - range.min) * (lane.depth || 0);
      out[lane.target] += lfo * span;
    }
    out[lane.target] = clamp(out[lane.target], range.min, range.max);
  });
  return out;
}

/**
 * Generate a single model layer with time-varying automation, temperature drift
 * and simple stochastic terms.  This extends the basic synth used by the demo.
 *
 * @param {Object} baseParams Base synthesis parameters.
 * @param {number} seconds Duration in seconds.
 * @param {number} [sampleRate=SAMPLE_RATE] Sampling rate in hertz.
 * @param {'electrical'|'photoacoustic'|'sonification'} forcedModel Layer type.
 * @param {Array<Object>} [automationLanes=[]] Time-varying automation lanes.
 * @returns {Float32Array} Synthesised mono audio buffer.
 */
export function synthesizeAutomatedLayer(baseParams, seconds, sampleRate = SAMPLE_RATE, forcedModel = 'electrical', automationLanes = []) {
  const total = Math.floor(seconds * sampleRate);
  const out = new Float32Array(total);
  let thermal = 0;
  let prevThermal = 0;
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0;
  let seed = 1337;
  let brown = 0;
  let peak = 1e-6;
  let coeffs = makeBandPassCoefficients(sampleRate, baseParams.resonanceHz, baseParams.resonanceQ);

  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate;
    const params = evaluateAutomatedParams(baseParams, t, automationLanes);
    const tempNorm = ((params.temperatureC ?? 22) - 22) / 40;
    const driftRate = params.temperatureDrift ?? 0;

    // Slowly recompute resonator coefficients so resonance can drift with the
    // automation and temperature without making the render prohibitively costly.
    if (i % 16 === 0) {
      const drift = Math.sin(2 * Math.PI * Math.max(0, driftRate) * t);
      const resonanceHz = Math.max(20, params.resonanceHz * (1 + 0.025 * tempNorm + 0.015 * drift));
      const resonanceQ = Math.max(0.2, params.resonanceQ * (1 - 0.06 * Math.abs(tempNorm)));
      coeffs = makeBandPassCoefficients(sampleRate, resonanceHz, resonanceQ);
    }

    const rawWave = waveSample(t, params.baseFreq, params.waveform, params.duty);
    const light = clamp(0.5 + 0.5 * params.depth * rawWave, 0, 1);
    let dry = 0;

    if (forcedModel === 'sonification') {
      const carrier = Math.sin(2 * Math.PI * params.carrierFreq * t);
      dry = (light - 0.5) * carrier * 2;
    } else if (forcedModel === 'photoacoustic') {
      const thermalCutoff = Math.max(0.1, params.thermalCutoff * (1 - 0.08 * tempNorm));
      const alpha = 1 - Math.exp((-2 * Math.PI * thermalCutoff) / sampleRate);
      thermal += alpha * (light - thermal);
      dry = (thermal - prevThermal) * sampleRate * 0.01;
      prevThermal = thermal;
    } else {
      // Lightweight magnetostriction-inspired nonlinearity: the magnitude of the
      // strain is closer to |B|^n than to a purely linear current term.
      const centred = light - 0.5;
      const magnetostrictionForce = Math.sign(centred) * Math.pow(Math.abs(centred) * 2, 1.65) * 0.5;
      dry = 0.6 * centred + 0.4 * magnetostrictionForce;
    }

    const whineFreq = Math.max(0, params.whineFreq * (1 + 0.006 * tempNorm));
    if (whineFreq > 0 && params.whineLevel > 0) {
      dry += params.whineLevel * Math.sin(2 * Math.PI * whineFreq * t);
    }

    // Reproducible white + brownish noise blend for a less sterile sound.
    if (params.noiseLevel > 0) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      const white = (seed / 0xffffffff) * 2 - 1;
      brown = 0.995 * brown + 0.045 * white;
      const temperatureNoiseGain = 1 + 0.2 * Math.abs(tempNorm);
      dry += params.noiseLevel * temperatureNoiseGain * (0.72 * white + 0.28 * brown);
    }

    // Dynamic biquad band-pass, direct-form I.
    const wet = coeffs.b0 * dry + coeffs.b1 * x1 + coeffs.b2 * x2 - coeffs.a1 * y1 - coeffs.a2 * y2;
    x2 = x1; x1 = dry; y2 = y1; y1 = wet;
    const mix = clamp(params.resonanceMix, 0, 1);
    const sample = ((1 - mix) * dry + mix * wet) * params.gain;
    out[i] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }

  const normalise = Math.min(1, 0.95 / peak);
  for (let i = 0; i < total; i += 1) {
    out[i] = clamp(out[i] * normalise, -1, 1);
  }
  return out;
}

/**
 * Render the currently selected project as a layered single event.
 *
 * @param {Object} params Base parameter object.
 * @param {number} seconds Duration in seconds.
 * @param {number} [sampleRate=SAMPLE_RATE] Sampling rate in hertz.
 * @param {Array<Object>} [automationLanes=[]] LFO automation lanes.
 * @param {Object} [layerSettings={}] Layer toggles and gains.
 * @returns {Float32Array} Mixed audio signal.
 */
export function synthesizeProjectPreview(params, seconds, sampleRate = SAMPLE_RATE, automationLanes = [], layerSettings = {}) {
  const signals = [];
  const electricalGain = layerSettings.electricalEnabled === false ? 0 : (layerSettings.electricalGain ?? params.electricalLayerGain ?? 1);
  const photoGain = layerSettings.photoacousticEnabled ? (layerSettings.photoacousticGain ?? params.photoacousticLayerGain ?? 1) : (params.photoacousticLayerGain ?? 0);
  const sonifyGain = layerSettings.sonificationEnabled ? (layerSettings.sonificationGain ?? params.sonificationLayerGain ?? 1) : (params.sonificationLayerGain ?? 0);

  if (electricalGain > 0) {
    const electrical = synthesizeAutomatedLayer({ ...params, mode: 'electrical', lowFreqSonify: false, gain: params.gain * electricalGain }, seconds, sampleRate, 'electrical', automationLanes);
    signals.push(electrical);
  }
  if (photoGain > 0) {
    const photo = synthesizeAutomatedLayer({ ...params, mode: 'photoacoustic', lowFreqSonify: false, gain: params.gain * photoGain }, seconds, sampleRate, 'photoacoustic', automationLanes);
    signals.push(photo);
  }
  if (sonifyGain > 0) {
    const sonified = synthesizeAutomatedLayer({ ...params, lowFreqSonify: true, gain: params.gain * sonifyGain }, seconds, sampleRate, 'sonification', automationLanes);
    signals.push(sonified);
  }
  if (!signals.length) {
    return synthesizeAutomatedLayer(params, seconds, sampleRate, 'electrical', automationLanes);
  }
  return mixSignals(signals);
}

/**
 * Render a sequence of events into one buffer.  Each event can capture its own
 * parameter snapshot, layer settings and automation lanes.
 *
 * @param {Array<Object>} events Sequence events.
 * @param {number} [sampleRate=SAMPLE_RATE] Sampling rate in hertz.
 * @returns {Float32Array} Entire rendered timeline.
 */
export function renderProjectSequence(events, sampleRate = SAMPLE_RATE) {
  if (!events.length) return new Float32Array(0);
  let totalSeconds = 0;
  events.forEach((event) => {
    totalSeconds = Math.max(totalSeconds, event.start + event.duration);
  });
  const totalSamples = Math.ceil(totalSeconds * sampleRate);
  const out = new Float32Array(totalSamples);
  events.forEach((event) => {
    const rendered = synthesizeProjectPreview(event.params, event.duration, sampleRate, event.automationLanes || [], event.layerSettings || {});
    const start = Math.floor(event.start * sampleRate);
    for (let i = 0; i < rendered.length; i += 1) {
      const idx = start + i;
      if (idx < out.length) out[idx] += rendered[i];
    }
  });
  let peak = 1e-6;
  for (let i = 0; i < out.length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  const normalise = Math.min(1, 0.95 / peak);
  for (let i = 0; i < out.length; i += 1) out[i] = clamp(out[i] * normalise, -1, 1);
  return out;
}
