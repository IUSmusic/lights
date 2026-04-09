/**
 * Entry point for the Distant Lights demo.  This module wires together the
 * parameter model, synthesiser, UI controls and persistence.  All DOM
 * interactions occur here; the rest of the code base is organised into
 * focused modules under `models/`, `audio-engine/`, `ui/` and `presets/`.
 */

import {
  SAMPLE_RATE,
  LOOP_SECONDS,
  EXPORT_SECONDS,
  RECORD_SECONDS,
  DEFAULT_PARAMS,
  PRESETS,
  CONTROL_CONFIG,
} from './presets/index.js';
import { synthesize } from './audio-engine/synth.js';
import { floatToWav, downloadBlob, safeName } from './audio-engine/export.js';
import { physicsSummary } from './models/physics.js';
import { buildControls, populatePresetSelect, refreshSavedPresetSelect } from './ui/controls.js';
import { drawSeries } from './ui/draw.js';
import { loadSavedPresets, writeSavedPresets } from './ui/storage.js';

// -----------------------------------------------------------------------------
// Global state
//
// The mutable state object keeps track of the current parameter set and
// synthesiser resources.  Because the Web Audio API requires explicit clean
// up of nodes, we store references so we can stop playback.  The state is
// initialised with a deep clone of the first built‑in preset to provide a
// sensible starting point.

/**
 * Deep clone of an arbitrary object using JSON serialisation.  This is safe
 * for plain objects and numbers/strings/booleans but will drop functions or
 * circular references.  It avoids sharing references between presets.
 *
 * @template T
 * @param {T} obj Object to clone.
 * @returns {T} Cloned object.
 */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

const state = {
  params: clone(PRESETS[0].params),
  isPlaying: false,
  isRecording: false,
  audioContext: null,
  source: null,
  gainNode: null,
  mediaDest: null,
  recorder: null,
  recordChunks: [],
  recordTimeout: null,
};

// References to DOM elements.  This lookup happens once on load rather than
// repeatedly during event handling.  If you add new UI elements to
// `index.html`, declare them here with the corresponding ID.
const els = {
  presetSelect: /** @type {HTMLSelectElement} */ (document.getElementById('presetSelect')),
  controlsContainer: /** @type {HTMLElement} */ (document.getElementById('controlsContainer')),
  savedPresetSelect: /** @type {HTMLSelectElement} */ (document.getElementById('savedPresetSelect')),
  statusText: /** @type {HTMLElement} */ (document.getElementById('statusText')),
  capabilityText: /** @type {HTMLElement} */ (document.getElementById('capabilityText')),
  lightCanvas: /** @type {HTMLCanvasElement} */ (document.getElementById('lightCanvas')),
  audioCanvas: /** @type {HTMLCanvasElement} */ (document.getElementById('audioCanvas')),
  modelTitle: /** @type {HTMLElement} */ (document.getElementById('modelTitle')),
  formula1: /** @type {HTMLElement} */ (document.getElementById('formula1')),
  formula2: /** @type {HTMLElement} */ (document.getElementById('formula2')),
  literalStatus: /** @type {HTMLElement} */ (document.getElementById('literalStatus')),
  numericSummary: /** @type {HTMLElement} */ (document.getElementById('numericSummary')),
  warningBox: /** @type {HTMLElement} */ (document.getElementById('warningBox')),
  playBtn: /** @type {HTMLButtonElement} */ (document.getElementById('playBtn')),
  stopBtn: /** @type {HTMLButtonElement} */ (document.getElementById('stopBtn')),
  exportWavBtn: /** @type {HTMLButtonElement} */ (document.getElementById('exportWavBtn')),
  recordBtn: /** @type {HTMLButtonElement} */ (document.getElementById('recordBtn')),
  exportJsonBtn: /** @type {HTMLButtonElement} */ (document.getElementById('exportJsonBtn')),
  saveBrowserBtn: /** @type {HTMLButtonElement} */ (document.getElementById('saveBrowserBtn')),
  loadBrowserBtn: /** @type {HTMLButtonElement} */ (document.getElementById('loadBrowserBtn')),
  deleteBrowserBtn: /** @type {HTMLButtonElement} */ (document.getElementById('deleteBrowserBtn')),
  importPresetInput: /** @type {HTMLInputElement} */ (document.getElementById('importPresetInput')),
};

// -----------------------------------------------------------------------------
// Helper functions

/**
 * Update the preview canvases to reflect the current parameter values.  The
 * preview uses a lower sample rate and shorter duration than the final
 * synthesis to remain responsive.  This function is called whenever a
 * parameter is modified.
 */
function updatePreview() {
  // Generate a tiny buffer for preview (50 ms) at 4 kHz to reduce CPU load
  const preview = synthesize({ ...state.params, gain: 1 }, 0.05, 4_000);
  const points = 180;
  const light = [];
  const audio = [];
  for (let i = 0; i < points; i += 1) {
    const t = i / points;
    const wave = wavePreview(t, Math.max(state.params.baseFreq, 1), state.params.waveform, state.params.duty);
    const intensity = Math.max(0, Math.min(1, 0.5 + 0.5 * state.params.depth * wave));
    light.push({ x: i, y: intensity });
    const idx = Math.floor((i / points) * preview.length);
    audio.push({ x: i, y: preview[idx] || 0 });
  }
  drawSeries(els.lightCanvas, light, '#0ff', false);
  drawSeries(els.audioCanvas, audio, '#ff0', true);
}

// Local helper to compute a waveform sample for the preview.  We re‑implement
// the wave sample here rather than importing from the waveform module to avoid
// circular dependencies (synth.js already imports waveforms).  See
// models/waveforms.js for documentation.
function wavePreview(t, freq, waveform, duty) {
  const phase = (t * freq) % 1;
  const s = Math.sin(2 * Math.PI * freq * t);
  switch (waveform) {
    case 'sine': return s;
    case 'square': return s >= 0 ? 1 : -1;
    case 'triangle': return 1 - 4 * Math.abs(phase - 0.5);
    case 'pwm': return phase < duty ? 1 : -1;
    case 'abs-sine': return Math.abs(s) * 2 - 1;
    default: return s;
  }
}

/**
 * Update the numeric summary display with key parameter values.  The summary
 * displays a compact representation of frequency, depth, resonance and gain
 * parameters so that users can quickly check settings.  Feel free to extend
 * this list with additional fields as your models evolve.
 */
function updateNumericSummary() {
  const p = state.params;
  els.numericSummary.textContent = `f0=${p.baseFreq.toFixed(2)} Hz, depth=${p.depth.toFixed(2)}, Q=${p.resonanceQ.toFixed(2)}, gain=${p.gain.toFixed(2)}`;
}

/**
 * Update the physics summary panel.  This calls into {@link physicsSummary}
 * which returns LaTeX strings.  The innerHTML is set directly because the
 * formulas use backslash sequences.  A more sophisticated implementation
 * could typeset the formulas with MathJax.
 */
function updatePhysicsSummary() {
  const summary = physicsSummary(state.params);
  els.modelTitle.textContent = summary.title;
  els.formula1.textContent = summary.formula1;
  els.formula2.textContent = summary.formula2;
  // Interpretation text
  if (state.params.mode === 'photoacoustic') {
    els.literalStatus.textContent = 'thermal diffusion → pressure';
  } else if (state.params.lowFreqSonify || state.params.baseFreq < 20) {
    els.literalStatus.textContent = 'sonification (carrier)';
  } else {
    els.literalStatus.textContent = 'direct modulation';
  }
}

/**
 * Stop any currently playing audio and release associated resources.  This
 * should be called before starting new playback or when the user clicks the
 * Stop button.  The Web Audio API nodes are closed and cleared.
 */
function stopPlayback() {
  if (state.source) {
    state.source.stop();
    state.source.disconnect();
    state.source = null;
  }
  if (state.gainNode) {
    state.gainNode.disconnect();
    state.gainNode = null;
  }
  if (state.mediaDest) {
    state.mediaDest.disconnect();
    state.mediaDest = null;
  }
  state.isPlaying = false;
  els.playBtn.disabled = false;
  els.stopBtn.disabled = true;
  els.statusText.textContent = 'Stopped';
}

/**
 * Start audio playback using the current parameters.  A new AudioContext is
 * created if one does not already exist.  The synthesised buffer is looped
 * according to {@link LOOP_SECONDS}.  If the browser does not support the
 * Web Audio API (unlikely) a warning is displayed.
 */
function startPlayback() {
  if (state.isPlaying) return;
  try {
    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const buffer = synthesize(state.params, LOOP_SECONDS, SAMPLE_RATE);
    const audioBuffer = state.audioContext.createBuffer(1, buffer.length, SAMPLE_RATE);
    audioBuffer.copyToChannel(buffer, 0);
    const source = state.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    const gainNode = state.audioContext.createGain();
    source.connect(gainNode);
    gainNode.connect(state.audioContext.destination);
    // Connect to recorder if in recording mode
    if (state.isRecording && state.mediaDest) {
      gainNode.connect(state.mediaDest);
    }
    source.start();
    state.source = source;
    state.gainNode = gainNode;
    state.isPlaying = true;
    els.playBtn.disabled = true;
    els.stopBtn.disabled = false;
    els.statusText.textContent = 'Playing';
  } catch (err) {
    els.warningBox.textContent = 'Web Audio API not supported: ' + err.message;
  }
}

/**
 * Begin recording audio to a WebM/Opus blob using the MediaRecorder API.  The
 * recording will stop automatically after {@link RECORD_SECONDS} seconds or
 * when the user clicks the record button again.  Recorded data is stored in
 * `state.recordChunks` and finalised when recording stops.
 */
function startRecording() {
  if (state.isRecording) {
    stopRecording();
    return;
  }
  if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
    els.warningBox.textContent = 'Recording not supported by this browser.';
    return;
  }
  // Ensure audio is playing so that recorder has a signal
  if (!state.isPlaying) startPlayback();
  const audioCtx = state.audioContext;
  if (!audioCtx) return;
  // Create media stream destination
  state.mediaDest = audioCtx.createMediaStreamDestination();
  // Connect the gain node to the recorder
  if (state.gainNode) {
    state.gainNode.connect(state.mediaDest);
  }
  const recorder = new MediaRecorder(state.mediaDest.stream);
  state.recordChunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) state.recordChunks.push(e.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(state.recordChunks, { type: recorder.mimeType });
    downloadBlob(blob, safeName(state.params.label) + '.webm');
    els.recordBtn.textContent = 'Record';
    state.isRecording = false;
    if (state.mediaDest) {
      state.mediaDest.disconnect();
      state.mediaDest = null;
    }
  };
  recorder.start();
  state.recorder = recorder;
  state.isRecording = true;
  els.recordBtn.textContent = 'Stop Rec';
  els.statusText.textContent = 'Recording';
  // Stop recording after a fixed duration
  state.recordTimeout = setTimeout(() => {
    stopRecording();
  }, RECORD_SECONDS * 1000);
}

/**
 * Stop an ongoing recording.  This is called either when the user clicks
 * Record again or when the timeout fires.  The MediaRecorder stream is
 * stopped which triggers the `onstop` callback defined in
 * {@link startRecording}.
 */
function stopRecording() {
  if (!state.isRecording) return;
  if (state.recorder) state.recorder.stop();
  if (state.recordTimeout) clearTimeout(state.recordTimeout);
  state.recordTimeout = null;
}

/**
 * Update a single parameter value and propagate changes to the preview,
 * numeric summary and physics panel.  The third argument `commit` indicates
 * whether the change should be persisted to history (for undo/redo) or if it
 * is part of an interactive drag on a range slider.  This sample
 * implementation does not implement an undo stack, but it could be added.
 *
 * @param {string} key   Parameter name.
 * @param {*} value      New value for the parameter.
 * @param {boolean} commit Whether the change is final (mouseup) or live.
 */
function updateParam(key, value, commit) {
  state.params[key] = value;
  updatePreview();
  updateNumericSummary();
  updatePhysicsSummary();
}

/**
 * Load a built‑in preset into the current state.  The parameter object is
 * cloned to avoid mutating the preset definition.  After updating the state
 * this function refreshes the controls and preview.
 *
 * @param {{name: string, params: Object}} preset
 */
function applyPreset(preset) {
  state.params = clone(preset.params);
  // Rebuild the controls to reflect the new parameter values
  buildControls(els.controlsContainer, CONTROL_CONFIG, state.params, updateParam);
  updateNumericSummary();
  updatePreview();
  updatePhysicsSummary();
  els.presetSelect.value = state.params.label;
}

/**
 * Export the current parameter set as a JSON file.  The file is named
 * according to the preset label.  The JSON contains only the parameter
 * values and not other state such as `isPlaying`.
 */
function exportPreset() {
  const data = JSON.stringify({ label: state.params.label, params: state.params }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  downloadBlob(blob, safeName(state.params.label) + '.json');
}

/**
 * Import a preset from a JSON file selected via an `<input type="file">`.
 * The file should contain an object with `params` matching the parameter
 * schema.  On success the imported parameters replace the current state and
 * are displayed in the UI.
 */
function importPreset(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (obj && obj.params) {
        state.params = clone(obj.params);
        buildControls(els.controlsContainer, CONTROL_CONFIG, state.params, updateParam);
        updateNumericSummary();
        updatePreview();
        updatePhysicsSummary();
        els.presetSelect.value = state.params.label;
      }
    } catch (err) {
      els.warningBox.textContent = 'Error importing preset: ' + err.message;
    }
  };
  reader.readAsText(file);
}

/**
 * Save the current preset to browser localStorage.  If a preset with the same
 * label already exists it is replaced; otherwise it is appended.  After
 * saving the saved presets select element is refreshed.
 */
function savePreset() {
  const saved = loadSavedPresets();
  const existing = saved.findIndex((p) => p.label === state.params.label);
  if (existing >= 0) {
    saved[existing] = { label: state.params.label, params: clone(state.params) };
  } else {
    saved.push({ label: state.params.label, params: clone(state.params) });
  }
  writeSavedPresets(saved);
  refreshSavedPresetSelect(els.savedPresetSelect, saved);
}

/**
 * Load a preset from the saved presets list.  The index corresponds to the
 * position in the saved array.  The preset’s parameters replace the current
 * state and the UI is updated.  If the index is invalid nothing happens.
 */
function loadPresetFromSaved(index) {
  const saved = loadSavedPresets();
  const entry = saved[index];
  if (!entry) return;
  state.params = clone(entry.params);
  buildControls(els.controlsContainer, CONTROL_CONFIG, state.params, updateParam);
  updateNumericSummary();
  updatePreview();
  updatePhysicsSummary();
  els.presetSelect.value = state.params.label;
}

/**
 * Delete a saved preset.  The index corresponds to the option value of the
 * saved presets select.  After deletion the list is refreshed.  Nothing is
 * done if the index is invalid.
 */
function deletePresetFromSaved(index) {
  const saved = loadSavedPresets();
  if (index < 0 || index >= saved.length) return;
  saved.splice(index, 1);
  writeSavedPresets(saved);
  refreshSavedPresetSelect(els.savedPresetSelect, saved);
}

/**
 * Synthesize the entire buffer and trigger a WAV download.  Uses
 * {@link EXPORT_SECONDS} as the duration.
 */
function exportWav() {
  const samples = synthesize(state.params, EXPORT_SECONDS, SAMPLE_RATE);
  const blob = floatToWav(samples, SAMPLE_RATE);
  downloadBlob(blob, safeName(state.params.label) + '.wav');
}

// -----------------------------------------------------------------------------
// Initialisation
//
// Build the UI and attach event listeners once the document has loaded.  All
// interactive controls are delegated to the functions defined above.

function init() {
  // Populate built‑in preset selector
  populatePresetSelect(els.presetSelect, PRESETS, state.params, (preset) => applyPreset(preset));
  // Build parameter controls
  buildControls(els.controlsContainer, CONTROL_CONFIG, state.params, updateParam);
  // Populate saved presets selector
  refreshSavedPresetSelect(els.savedPresetSelect, loadSavedPresets());
  // Update preview and summaries
  updateNumericSummary();
  updatePreview();
  updatePhysicsSummary();
  // Enable/disable stop button initially
  els.stopBtn.disabled = true;
  // Event listeners
  els.playBtn.addEventListener('click', startPlayback);
  els.stopBtn.addEventListener('click', () => {
    stopPlayback();
    stopRecording();
  });
  els.exportWavBtn.addEventListener('click', exportWav);
  els.recordBtn.addEventListener('click', startRecording);
  els.exportJsonBtn.addEventListener('click', exportPreset);
  els.saveBrowserBtn.addEventListener('click', savePreset);
  els.loadBrowserBtn.addEventListener('click', () => {
    const idx = parseInt(els.savedPresetSelect.value, 10);
    loadPresetFromSaved(idx);
  });
  els.deleteBrowserBtn.addEventListener('click', () => {
    const idx = parseInt(els.savedPresetSelect.value, 10);
    deletePresetFromSaved(idx);
  });
  els.importPresetInput.addEventListener('change', () => {
    const files = els.importPresetInput.files;
    if (files && files.length) importPreset(files[0]);
    // Reset the input so the same file can be imported again
    els.importPresetInput.value = '';
  });
}

// Kick off initialisation once the DOM is fully parsed
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}