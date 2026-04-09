"""
Utility script to generate example WAV files and their corresponding FFT plots
for each built‑in preset.  This script is a thin wrapper around
``python/models.py`` and is provided so that users can run it without
supplying command line arguments.  The output WAV and PNG files are placed
into the ``data/examples`` directory relative to the repository root.

To run:

    python data/generate_examples.py --seconds 2

"""

import argparse
from pathlib import Path
import sys

# Add the python module directory to sys.path so that we can import models.py
CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parents[1]
PYTHON_DIR = PROJECT_ROOT / 'python'
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))
import models  # type: ignore


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate example audio and FFTs.')
    parser.add_argument('--seconds', type=float, default=1.0, help='Duration of each example (s)')
    parser.add_argument('--out', type=str, default='data/examples', help='Output directory')
    args = parser.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    # Use the CLI built into models.py
    for preset in models.PRESETS:
        name = preset.label.replace(' ', '_').replace('/', '_')
        samples = models.synthesize(preset, args.seconds)
        wav_path = out_dir / f'{name}.wav'
        models.export_wav(samples, str(wav_path))
        # FFT plot
        import matplotlib.pyplot as plt  # Lazy import
        from scipy.fft import rfft, rfftfreq
        import numpy as np
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
        fig_path = out_dir / f'{name}_fft.png'
        plt.savefig(fig_path)
        plt.close()
    print(f'Generated examples in {out_dir}')


if __name__ == '__main__':
    main()