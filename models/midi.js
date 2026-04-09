/**
 * @module models/midi
 *
 * Minimal MIDI/OSC export helpers.  This implementation does not depend on
 * external libraries; instead it produces a basic MIDI file format using
 * typed arrays.  MIDI note events are derived from sequence events by
 * mapping the base frequency onto the nearest MIDI note number.  Envelope
 * and modulation parameters are not encoded; for more expressive exports
 * integrate with a full‑featured MIDI library.
 */

/**
 * Convert a frequency in hertz to a MIDI note number (integer).  Note 69
 * corresponds to A4 (440 Hz).  Frequencies below 8.18 Hz map to 0 and
 * above ~12543 Hz map to 127.
 *
 * @param {number} freq Frequency in hertz.
 * @returns {number} MIDI note number (0–127).
 */
function freqToMidi(freq) {
  return Math.max(0, Math.min(127, Math.round(69 + 12 * Math.log2(freq / 440))));
}

/**
 * Convert a sequence of light/audio events into a simple MIDI file.  Each
 * event produces a single note starting at `event.start` with duration
 * `event.duration`.  The velocity is fixed at 100.  The resulting buffer
 * contains a single track and uses a time division of 960 ticks per
 * quarter note.  A proper implementation would support tempo changes and
 * multiple tracks.
 *
 * @param {{start: number, duration: number, params: any}[]} events
 *  Sequence events.
 * @param {number} [bpm=120] Tempo in beats per minute.
 * @returns {Uint8Array} Byte array containing the MIDI file data.
 */
export function sequenceToMidi(events, bpm = 120) {
  // Basic helpers to write variable length quantities and integers
  const writeVLQ = (value) => {
    const bytes = [];
    let buffer = value & 0x7f;
    while ((value >>= 7)) {
      buffer <<= 8;
      buffer |= ((value & 0x7f) | 0x80);
    }
    while (true) {
      bytes.push(buffer & 0xff);
      if (buffer & 0x80) buffer >>= 8;
      else break;
    }
    return bytes;
  };
  const track = [];
  // Sort events by start time
  const sorted = events.slice().sort((a, b) => a.start - b.start);
  let lastTick = 0;
  const ticksPerQuarter = 960;
  const tickScale = (bpm / 60) * ticksPerQuarter; // ticks per second
  sorted.forEach((ev) => {
    const note = freqToMidi(ev.params.baseFreq);
    const startTick = Math.round(ev.start * tickScale);
    const deltaStart = startTick - lastTick;
    track.push(...writeVLQ(deltaStart));
    track.push(0x90, note, 100); // Note on, velocity 100
    const endTick = Math.round((ev.start + ev.duration) * tickScale);
    const deltaDur = endTick - startTick;
    track.push(...writeVLQ(deltaDur));
    track.push(0x80, note, 0); // Note off
    lastTick = endTick;
  });
  // End of track meta event
  track.push(0x00, 0xff, 0x2f, 0x00);
  const trackLength = track.length;
  const header = [
    ...[0x4d, 0x54, 0x68, 0x64], // 'MThd'
    0x00, 0x00, 0x00, 0x06,       // header length 6
    0x00, 0x00,                   // format 0
    0x00, 0x01,                   // one track
    (ticksPerQuarter >> 8) & 0xff,
    ticksPerQuarter & 0xff,
    0x4d, 0x54, 0x72, 0x6b,       // 'MTrk'
    (trackLength >> 24) & 0xff,
    (trackLength >> 16) & 0xff,
    (trackLength >> 8) & 0xff,
    trackLength & 0xff,
  ];
  return new Uint8Array([...header, ...track]);
}