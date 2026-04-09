/**
 * @module presets/index
 *
 * This module defines the default parameters, presets and UI control configuration
 * for the Distant Lights demo.  Separating these values into their own module
 * makes it easy to reuse them in both the browser implementation and in the
 * Python port.  Each constant is documented thoroughly so that users and
 * developers understand exactly what it represents.
 */

/**
 * Sample rate of the audio engine in hertz.  A higher sample rate results in
 * better fidelity but requires more processing.  CD‑quality audio uses
 * 44.1 kHz; we use 48 kHz to align with common browser audio contexts.
 * @type {number}
 */
export const SAMPLE_RATE = 48_000;

/**
 * Length in seconds of the looping preview played in the demo.  This short
 * segment repeats so that the user can quickly hear changes to the parameters
 * without having to wait for a long file to finish.  Four seconds provides
 * enough time to perceive low‑frequency modulation (e.g. 0.5 Hz pulses) while
 * remaining responsive to user interaction.
 * @type {number}
 */
export const LOOP_SECONDS = 4;

/**
 * Length in seconds of the audio buffer exported when the user clicks the
 * “WAV” button.  A longer export time gives users ample material to use in
 * compositions but still keeps the file size manageable.  Eight seconds is
 * chosen arbitrarily and can be adjusted as needed.
 * @type {number}
 */
export const EXPORT_SECONDS = 8;

/**
 * Maximum duration in seconds of the live recording feature.  The browser
 * implementation streams audio to a `MediaRecorder` which limits recordings
 * to a finite length.  Eight seconds matches the export length so that
 * recordings and WAV exports are comparable.
 * @type {number}
 */
export const RECORD_SECONDS = 8;

/**
 * Key used to persist user‑defined presets in `localStorage`.  Changing this
 * value will invalidate existing saved presets.  The version suffix allows
 * us to evolve the save format without colliding with older data.
 * @type {string}
 */
export const STORAGE_KEY = "distant-lights-saved-presets-v1";

/**
 * Default synthesis parameters.  These serve as sensible starting values for
 * new presets and are also used as a base for the built‑in preset definitions.
 *
 * @typedef {Object} Params
 * @property {string} label           – human‑readable label for the preset.
 * @property {'electrical'|'photoacoustic'} mode – selects which physical
 *  model to use.  "electrical" models mains hum and PWM noise while
 *  "photoacoustic" approximates the thermal diffusion of modulated light.
 * @property {number} baseFreq        – base modulation frequency in hertz.
 * @property {'sine'|'square'|'triangle'|'pwm'|'abs-sine'} waveform – shape of
 *  the modulation signal.  PWM waveforms also use the `duty` parameter.
 * @property {number} duty            – duty cycle for the PWM waveform (0–1).
 * @property {number} depth           – modulation depth (0–1) where 0 is no
 *  modulation and 1 is full amplitude modulation.  In the electrical model
 *  this roughly corresponds to ripple amplitude; in the photoacoustic model
 *  it controls the modulation of incident intensity.
 * @property {number} thermalCutoff   – cutoff frequency in hertz for the
 *  single‑pole thermal low‑pass filter used in the photoacoustic model.  The
 *  time constant τ = 1/(2π·thermalCutoff).  Higher values yield faster
 *  thermal response.
 * @property {number} resonanceHz     – centre frequency of the second‑order
 *  resonant peak (band‑pass filter) applied to the electrical model in
 *  hertz.  It roughly approximates fixture or enclosure resonances.
 * @property {number} resonanceQ      – quality factor of the resonant
 *  band‑pass filter.  Lower Q values give a broader, less pronounced peak
 *  while higher values emphasise a narrow frequency band.  Typical values
 *  range from 0.5 (very broad) to 10 (very narrow).
 * @property {number} resonanceMix    – mix ratio between the dry signal and
 *  the filtered (resonant) signal (0–1).  0 means only the dry modulation,
 *  1 means only the resonant output.
 * @property {number} whineFreq       – frequency in hertz of an optional
 *  additive whine (sinusoid) modelling switching converters or driver
 *  oscillators.  Set to 0 to disable.
 * @property {number} whineLevel      – amplitude of the whine tone (0–1).  A
 *  value of 0 disables the whine even if `whineFreq` is non‑zero.
 * @property {number} noiseLevel      – white noise amplitude added to the
 *  signal.  Noise is synthesised by a simple linear‑congruential generator
 *  for reproducibility.
 * @property {number} gain            – overall linear gain applied after
 *  normalisation.  Larger values make the output louder; values above 1 may
 *  cause clipping if the mix or filter emphasises certain frequencies.
 * @property {number} temperatureC    – nominal ambient temperature in degrees
 *  Celsius.  The browser demo uses this to slightly shift resonances and
 *  stochastic noise, standing in for temperature-dependent material changes.
 * @property {number} temperatureDrift – slow random drift rate in hertz used
 *  to wobble resonance/whine terms and make long tones feel less static.
 * @property {number} electricalLayerGain – gain of the electrical-hum layer
 *  when multi-model layering is enabled.
 * @property {number} photoacousticLayerGain – gain of the photoacoustic layer
 *  when multi-model layering is enabled.
 * @property {number} sonificationLayerGain – gain of the sonification layer
 *  when multi-model layering is enabled.
 * @property {boolean} lowFreqSonify  – if true and the base frequency is
 *  below the audible range (≈ 20 Hz), then the modulation envelope is mapped
 *  onto an audible carrier (`carrierFreq`) to produce a tone.  This mode is
 *  used for sonification of very slow beacons.
 * @property {number} carrierFreq     – carrier frequency for the sonification
 *  mode in hertz.  Only used when `lowFreqSonify` is true or `baseFreq` is
 *  less than 20 Hz.
 */

/**
 * Plain object containing the default parameter values.  Spread this into a
 * new object before modifying to avoid sharing references between presets.
 * @type {Params}
 */
export const DEFAULT_PARAMS = {
  label: "Custom",
  mode: "electrical",
  baseFreq: 100,
  waveform: "abs-sine",
  duty: 0.3,
  depth: 0.8,
  thermalCutoff: 80,
  resonanceHz: 180,
  resonanceQ: 1.2,
  resonanceMix: 0.28,
  whineFreq: 0,
  whineLevel: 0,
  noiseLevel: 0.01,
  gain: 2.2,
  temperatureC: 22,
  temperatureDrift: 0.015,
  electricalLayerGain: 1,
  photoacousticLayerGain: 0,
  sonificationLayerGain: 0,
  lowFreqSonify: false,
  carrierFreq: 220,
};

/**
 * Built‑in presets shipped with the demo.  These provide realistic starting
 * points for common lighting scenarios and demonstrate the range of the
 * synthesis engine.  Each preset overrides selected fields of
 * {@link DEFAULT_PARAMS} but always specifies a unique `label` so it can be
 * round‑tripped through JSON export/import without confusion.
 *
 * @type {Array<{name: string, params: Params}>}
 */
export const PRESETS = [
  {
    name: "UK LED mains ripple (100 Hz)",
    params: {
      ...DEFAULT_PARAMS,
      label: "UK LED mains ripple (100 Hz)",
      mode: "electrical",
      baseFreq: 100,
      waveform: "abs-sine",
      depth: 0.85,
      resonanceHz: 180,
      resonanceQ: 1.2,
      resonanceMix: 0.28,
      noiseLevel: 0.008,
      gain: 2.4,
    },
  },
  {
    name: "Fluorescent / ballast hum",
    params: {
      ...DEFAULT_PARAMS,
      label: "Fluorescent / ballast hum",
      mode: "electrical",
      baseFreq: 100,
      waveform: "triangle",
      depth: 0.7,
      resonanceHz: 120,
      resonanceQ: 2.2,
      resonanceMix: 0.45,
      noiseLevel: 0.006,
      gain: 2.6,
    },
  },
  {
    name: "PWM LED dimmer + driver whine",
    params: {
      ...DEFAULT_PARAMS,
      label: "PWM LED dimmer + driver whine",
      mode: "electrical",
      baseFreq: 240,
      waveform: "pwm",
      duty: 0.18,
      depth: 1,
      resonanceHz: 900,
      resonanceQ: 2.5,
      resonanceMix: 0.34,
      whineFreq: 7_800,
      whineLevel: 0.15,
      noiseLevel: 0.008,
      gain: 1.8,
    },
  },
  {
    name: "Photoacoustic chopped light",
    params: {
      ...DEFAULT_PARAMS,
      label: "Photoacoustic chopped light",
      mode: "photoacoustic",
      baseFreq: 440,
      waveform: "square",
      duty: 0.5,
      depth: 1,
      thermalCutoff: 120,
      resonanceHz: 440,
      resonanceQ: 6,
      resonanceMix: 0.5,
      noiseLevel: 0.004,
      gain: 5,
    },
  },
  {
    name: "Slow collision beacon (sonified)",
    params: {
      ...DEFAULT_PARAMS,
      label: "Slow collision beacon (sonified)",
      mode: "electrical",
      baseFreq: 1.2,
      waveform: "pwm",
      duty: 0.18,
      depth: 1,
      lowFreqSonify: true,
      carrierFreq: 330,
      resonanceHz: 330,
      resonanceQ: 3.5,
      resonanceMix: 0.2,
      noiseLevel: 0.003,
      gain: 2.5,
    },
  },
];

/**
 * Definition of the UI controls presented to the user.  Each entry describes
 * the parameter it controls and defines the widget type along with range or
 * option values.  The `key` field maps directly onto properties of
 * {@link Params}.
 * @type {Array<{key: string, type: 'range'|'select'|'checkbox', label: string, min?: number, max?: number, step?: number, options?: string[]}>}
 */
export const CONTROL_CONFIG = [
  { key: "mode", type: "select", label: "Mode", options: ["electrical", "photoacoustic"] },
  { key: "waveform", type: "select", label: "Waveform", options: ["sine", "square", "triangle", "pwm", "abs-sine"] },
  { key: "baseFreq", type: "range", label: "Base Hz", min: 0.2, max: 2_000, step: 0.1 },
  { key: "depth", type: "range", label: "Depth", min: 0, max: 1, step: 0.01 },
  { key: "duty", type: "range", label: "PWM duty", min: 0.02, max: 0.98, step: 0.01 },
  { key: "thermalCutoff", type: "range", label: "Thermal Hz", min: 1, max: 1_000, step: 1 },
  { key: "resonanceHz", type: "range", label: "Res Hz", min: 20, max: 12_000, step: 1 },
  { key: "resonanceQ", type: "range", label: "Res Q", min: 0.2, max: 20, step: 0.1 },
  { key: "resonanceMix", type: "range", label: "Res mix", min: 0, max: 1, step: 0.01 },
  { key: "whineFreq", type: "range", label: "Whine Hz", min: 0, max: 16_000, step: 1 },
  { key: "whineLevel", type: "range", label: "Whine lvl", min: 0, max: 0.5, step: 0.001 },
  { key: "noiseLevel", type: "range", label: "Noise", min: 0, max: 0.1, step: 0.001 },
  { key: "gain", type: "range", label: "Gain", min: 0.1, max: 8, step: 0.1 },
  { key: "temperatureC", type: "range", label: "Temp °C", min: -10, max: 80, step: 1 },
  { key: "temperatureDrift", type: "range", label: "Temp drift", min: 0, max: 0.2, step: 0.001 },
  { key: "carrierFreq", type: "range", label: "Carrier", min: 50, max: 2_000, step: 1 },
  { key: "lowFreqSonify", type: "checkbox", label: "Low‑freq sonify" },
];