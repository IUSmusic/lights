/**
 * @module audio-engine/export
 *
 * Utilities for exporting synthesised audio.  The browser implementation
 * provides functions to convert a Float32Array into a WAV file and trigger
 * downloads.  These helpers are kept in a separate module to decouple I/O
 * concerns from the core synthesis logic.
 */

/**
 * Convert an array of floating‑point samples to a 16‑bit little‑endian WAV
 * Blob.  The WAV header is written according to the RIFF specification.
 *
 * @param {Float32Array} samples  Audio samples in the range [−1, 1].
 * @param {number} sampleRate     Sampling rate in hertz.
 * @returns {Blob} A browser Blob containing the binary WAV data.
 */
export function floatToWav(samples, sampleRate) {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  // fmt subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, 1, true);  // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  // data subchunk
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);
  // sample data
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Safely generate a URL‑friendly file name from arbitrary text.  The name is
 * lower‑cased and stripped of non‑alphanumeric characters.  Hyphens are
 * collapsed and leading/trailing hyphens are removed.  If the resulting name
 * is empty, a fallback of "distant-lights" is returned.
 *
 * @param {string} text Free‑form text, e.g. a preset label.
 * @returns {string} Sanitised file name.
 */
export function safeName(text) {
  return String(text || 'distant-lights')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'distant-lights';
}

/**
 * Trigger a client‑side download of a Blob.  A temporary anchor element is
 * created, added to the DOM, clicked and then removed.  The object URL is
 * revoked after a short timeout to avoid leaking browser resources.
 *
 * @param {Blob} blob     Data blob to download.
 * @param {string} filename Suggested file name (without path).
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revocation to avoid interfering with download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}