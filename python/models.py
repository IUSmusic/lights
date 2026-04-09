"""
Python implementation of the Distant Lights synthesis models.

This module mirrors the functionality of the JavaScript code found in
``audio-engine/synth.js`` but makes use of ``numpy`` and ``scipy`` for high
precision numerical processing.  It also demonstrates how to extend the
original demo with more sophisticated physical models, such as a basic
magnetostriction response for electrical hum and a one‑dimensional finite
difference solver for the photoacoustic thermal diffusion equation.

Two high‑level functions are provided:

* :func:`synthesize` – generate a floating‑point audio buffer given a
  dictionary of parameters.
* :func:`export_wav` – write samples to a 16‑bit PCM WAV file using
  ``soundfile``.

The preset definitions from the JavaScript version are re‑exported so that
Python scripts can iterate over the same scenarios when performing batch
analysis or parameter sweeps.

"""

from __future__ import annotations

import math
from dataclasses import dataclass, asdict
from typing import Dict, Any, List

import numpy as np
import soundfile as sf
from scipy.signal import iirpeak, lfilter


# -----------------------------------------------------------------------------
# Data structures

@dataclass
class Params:
    """Container for synthesis parameters.  See presets/index.js for
    documentation of each field.  Dataclasses make it easy to convert
    between dictionaries and strongly typed objects.
    """

    label: str = "Custom"
    mode: str = "electrical"  # 'electrical' or 'photoacoustic'
    baseFreq: float = 100.0
    waveform: str = "abs-sine"  # 'sine', 'square', 'triangle', 'pwm', 'abs-sine'
    duty: float = 0.3
    depth: float = 0.8
    thermalCutoff: float = 80.0
    resonanceHz: float = 180.0
    resonanceQ: float = 1.2
    resonanceMix: float = 0.28
    whineFreq: float = 0.0
    whineLevel: float = 0.0
    noiseLevel: float = 0.01
    gain: float = 2.2
    lowFreqSonify: bool = False
    carrierFreq: float = 220.0

    def clone(self) -> "Params":
        return Params(**asdict(self))


def default_params() -> Params:
    return Params()


# Built‑in presets (mirroring presets/index.js).  Values are converted to
# Params instances for convenience.
PRESETS: List[Params] = [
    Params(
        label="UK LED mains ripple (100 Hz)",
        mode="electrical",
        baseFreq=100.0,
        waveform="abs-sine",
        depth=0.85,
        resonanceHz=180.0,
        resonanceQ=1.2,
        resonanceMix=0.28,
        noiseLevel=0.008,
        gain=2.4,
    ),
    Params(
        label="Fluorescent / ballast hum",
        mode="electrical",
        baseFreq=100.0,
        waveform="triangle",
        depth=0.7,
        resonanceHz=120.0,
        resonanceQ=2.2,
        resonanceMix=0.45,
        noiseLevel=0.006,
        gain=2.6,
    ),
    Params(
        label="PWM LED dimmer + driver whine",
        mode="electrical",
        baseFreq=240.0,
        waveform="pwm",
        duty=0.18,
        depth=1.0,
        resonanceHz=900.0,
        resonanceQ=2.5,
        resonanceMix=0.34,
        whineFreq=7_800.0,
        whineLevel=0.15,
        noiseLevel=0.008,
        gain=1.8,
    ),
    Params(
        label="Photoacoustic chopped light",
        mode="photoacoustic",
        baseFreq=440.0,
        waveform="square",
        duty=0.5,
        depth=1.0,
        thermalCutoff=120.0,
        resonanceHz=440.0,
        resonanceQ=6.0,
        resonanceMix=0.5,
        noiseLevel=0.004,
        gain=5.0,
    ),
    Params(
        label="Slow collision beacon (sonified)",
        mode="electrical",
        baseFreq=1.2,
        waveform="pwm",
        duty=0.18,
        depth=1.0,
        lowFreqSonify=True,
        carrierFreq=330.0,
        resonanceHz=330.0,
        resonanceQ=3.5,
        resonanceMix=0.2,
        noiseLevel=0.003,
        gain=2.5,
    ),
]


def wave_sample(t: np.ndarray, freq: float, waveform: str, duty: float) -> np.ndarray:
    """Vectorised waveform generator.  Computes a periodic waveform over an
    array of time values ``t``.  See :func:`models.waveforms.waveSample`
    for the definitions.  ``t`` should be a 1‑D numpy array.
    """
    phase = np.mod(t * freq, 1.0)
    s = np.sin(2 * np.pi * freq * t)
    if waveform == "sine":
        return s
    if waveform == "square":
        return np.where(s >= 0, 1.0, -1.0)
    if waveform == "triangle":
        return 1.0 - 4.0 * np.abs(phase - 0.5)
    if waveform == "pwm":
        return np.where(phase < duty, 1.0, -1.0)
    if waveform == "abs-sine":
        return np.abs(s) * 2.0 - 1.0
    return s


def bandpass_filter(samples: np.ndarray, f0: float, q: float, sample_rate: int) -> np.ndarray:
    """
    Apply a resonant band‑pass filter to ``samples``.  Uses ``scipy.signal.iirpeak``
    to design a digital resonator with peak gain of 1 at ``f0`` and quality
    factor ``q``.  The filter is applied using ``scipy.signal.lfilter``.

    Parameters
    ----------
    samples : array_like
        Input signal.
    f0 : float
        Centre frequency of the resonator in hertz.
    q : float
        Quality factor.
    sample_rate : int
        Sampling rate in hertz.

    Returns
    -------
    ndarray
        Filtered signal with the same shape as ``samples``.
    """
    # Design a second‑order IIR peak filter
    b, a = iirpeak(f0 / (sample_rate / 2), q)
    return lfilter(b, a, samples)


def synthesize(params: Params, seconds: float, sample_rate: int = 48_000) -> np.ndarray:
    """
    Generate an audio waveform according to the provided parameters.  This
    function loosely follows the structure of the JavaScript implementation but
    takes advantage of numpy vectorisation for efficiency.

    Parameters
    ----------
    params : Params
        Synthesis parameters.
    seconds : float
        Duration of the output in seconds.
    sample_rate : int, optional
        Sampling rate in hertz (default: 48000).

    Returns
    -------
    numpy.ndarray
        1‑D array of floating‑point samples in the range [−1, 1].
    """
    total = int(math.floor(seconds * sample_rate))
    t = np.linspace(0, seconds, total, endpoint=False)
    # Generate raw waveform and light intensity
    raw_wave = wave_sample(t, params.baseFreq, params.waveform, params.duty)
    light = np.clip(0.5 + 0.5 * params.depth * raw_wave, 0.0, 1.0)
    # Convert light modulation to an audio signal
    if params.lowFreqSonify or params.baseFreq < 20.0:
        carrier = np.sin(2.0 * np.pi * params.carrierFreq * t)
        x = (light - 0.5) * carrier * 2.0
    elif params.mode == "photoacoustic":
        # One‑pole low‑pass: T[n+1] = T[n] + alpha*(I - T[n]); alpha based on cutoff
        alpha = 1.0 - np.exp((-2.0 * np.pi * max(0.1, params.thermalCutoff)) / sample_rate)
        thermal = np.zeros_like(light)
        prev = 0.0
        for i in range(len(light)):
            prev += alpha * (light[i] - prev)
            thermal[i] = prev
        x = (np.gradient(thermal) * sample_rate) * 0.01
    else:
        x = light - 0.5
    # Whine term
    if params.whineFreq > 0 and params.whineLevel > 0:
        x += params.whineLevel * np.sin(2.0 * np.pi * params.whineFreq * t)
    # White noise using numpy’s random generator seeded deterministically
    if params.noiseLevel > 0:
        rng = np.random.default_rng(1337)
        x += rng.uniform(-1.0, 1.0, size=x.shape) * params.noiseLevel
    # Apply band‑pass resonance
    wet = bandpass_filter(x, params.resonanceHz, params.resonanceQ, sample_rate)
    mixed = (1.0 - params.resonanceMix) * x + params.resonanceMix * wet
    # Normalise and apply gain
    peak = np.max(np.abs(mixed)) or 1.0
    mixed = np.clip(mixed * (0.95 / peak) * params.gain, -1.0, 1.0)
    return mixed.astype(np.float32)


def export_wav(samples: np.ndarray, filename: str, sample_rate: int = 48_000) -> None:
    """
    Write an array of samples to a 16‑bit PCM WAV file.  Uses the ``soundfile``
    library to handle file I/O.  The samples are clipped to [−1, 1] and
    converted to 16‑bit integers internally.

    Parameters
    ----------
    samples : array_like
        Floating‑point audio samples.
    filename : str
        Output file path.
    sample_rate : int
        Sampling rate in hertz.
    """
    sf.write(filename, samples, sample_rate, subtype='PCM_16')


def run_magnetostriction_model(current: np.ndarray, sample_rate: int, 
                               core_resonance: float = 120.0, q: float = 5.0) -> np.ndarray:
    """
    Optional enhanced electrical hum model.  Given an input current waveform
    (modulation) this function applies a magnetostriction transfer function
    approximated by a resonant band‑pass at twice the mains frequency.  The
    quality factor can be tuned to simulate the degree of mechanical damping
    in the core.  Real magnetostriction responses often include several
    harmonics; only the first harmonic is included here for simplicity.

    Parameters
    ----------
    current : array_like
        Modulation signal centered around zero.
    sample_rate : int
        Sampling rate in hertz.
    core_resonance : float
        Frequency of the magnetostriction mode (twice line frequency).
    q : float
        Quality factor of the resonance.

    Returns
    -------
    ndarray
        Signal filtered by the magnetostriction transfer function.
    """
    return bandpass_filter(current, core_resonance, q, sample_rate)


def run_photoacoustic_fdtd(light: np.ndarray, sample_rate: int, 
                           thermal_diffusivity: float = 1e-7, 
                           density: float = 1.0, specific_heat: float = 1.0,
                           cells: int = 100, length: float = 0.01) -> np.ndarray:
    """
    Simple finite‑difference time‑domain (FDTD) solver for the 1‑D heat
    equation with Neumann boundary conditions.  This function is an
    experimental extension to the basic photoacoustic model.  It models
    thermal diffusion in a slab of length ``length`` discretised into
    ``cells`` spatial points.  The incident light intensity modulates the
    heat flux at the surface.  The returned audio signal is proportional
    to the spatial average of the temperature derivative (pressure).

    The discrete heat equation used is:

      T_{n+1}[i] = T_n[i] + α Δt/Δx² (T_n[i+1] - 2 T_n[i] + T_n[i-1]) + Q

    where α is the thermal diffusivity and Q is the absorbed heat from the
    incident light at the surface (applied to i=0).  The pressure signal is
    approximated by dT/dt at the surface.

    Parameters
    ----------
    light : array_like
        Incident light intensity (0–1) over time.
    sample_rate : int
        Sampling rate in hertz.
    thermal_diffusivity : float
        Thermal diffusivity α (m²/s).
    density : float
        Material density ρ (kg/m³).  Not used but included for completeness.
    specific_heat : float
        Specific heat capacity c_p (J/kg·K).  Not used but included for completeness.
    cells : int
        Number of spatial discretisation points.
    length : float
        Length of the 1‑D domain in metres.

    Returns
    -------
    ndarray
        Approximate pressure signal proportional to the temporal derivative
        of the temperature at the surface.
    """
    dt = 1.0 / sample_rate
    dx = length / cells
    alpha = thermal_diffusivity
    # Stability condition for explicit scheme: alpha*dt/dx^2 <= 0.5
    if alpha * dt / (dx * dx) > 0.5:
        raise ValueError('Time step too large for stable FDTD simulation')
    # Temperature grid
    T = np.zeros((cells,))
    out = np.zeros_like(light, dtype=np.float32)
    for n in range(len(light)):
        # Boundary condition: absorbed heat flux at surface proportional to light
        Q = light[n]
        T_new = T.copy()
        # Interior points
        for i in range(1, cells - 1):
            T_new[i] = T[i] + (alpha * dt / (dx * dx)) * (T[i + 1] - 2 * T[i] + T[i - 1])
        # Surface (i=0) – Neumann BC at both ends: zero gradient
        T_new[0] = T[0] + (alpha * dt / (dx * dx)) * (T[1] - T[0]) + Q * dt
        T_new[-1] = T[-1] + (alpha * dt / (dx * dx)) * (T[-2] - T[-1])
        # Approximate pressure as dT/dt at the surface scaled arbitrarily
        out[n] = (T_new[0] - T[0]) * sample_rate * 0.01
        T = T_new
    # Normalise output
    out = out / (np.max(np.abs(out)) + 1e-9)
    return out


if __name__ == '__main__':  # pragma: no cover
    # Simple CLI to generate examples for each preset
    import argparse
    parser = argparse.ArgumentParser(description='Generate example WAVs and FFT plots for presets.')
    parser.add_argument('--seconds', type=float, default=1.0, help='Duration of each example (s)')
    parser.add_argument('--out', type=str, default='examples', help='Output directory')
    args = parser.parse_args()
    import os
    import matplotlib.pyplot as plt
    from scipy.fft import rfft, rfftfreq
    os.makedirs(args.out, exist_ok=True)
    for i, preset in enumerate(PRESETS):
        name = preset.label.replace(' ', '_').replace('/', '_')
        samples = synthesize(preset, args.seconds)
        wav_path = os.path.join(args.out, f'{name}.wav')
        export_wav(samples, wav_path)
        # FFT plot
        N = len(samples)
        yf = np.abs(rfft(samples))
        xf = rfftfreq(N, 1 / 48000)
        plt.figure(figsize=(6, 3))
        plt.semilogx(xf[1:], 20 * np.log10(yf[1:] + 1e-12))
        plt.xlabel('Frequency (Hz)')
        plt.ylabel('Magnitude (dB)')
        plt.title(preset.label)
        plt.grid(True, which='both')
        plt.tight_layout()
        plt.savefig(os.path.join(args.out, f'{name}_fft.png'))
        plt.close()