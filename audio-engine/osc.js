/**
 * @module audio-engine/osc
 *
 * Lightweight OSC-style export for the browser demo.  Rather than writing the
 * binary OSC packet format, this module emits a JSON bundle that can easily be
 * translated into OSC messages by Max/MSP, Pure Data, SuperCollider, Python,
 * Node or DAW scripting environments.  The goal is interoperability rather than
 * strict packet-level fidelity.
 */

/**
 * Convert project sequence events into a JSON-friendly OSC bundle.  Each event
 * emits `/distantlights/event/start` and `/distantlights/event/stop` messages,
 * plus automation lane descriptors for offline translation.
 *
 * @param {Array<Object>} events Sequence events.
 * @returns {{format: string, messages: Array<Object>}} JSON bundle.
 */
export function sequenceToOscBundle(events) {
  const messages = [];
  events.forEach((event, index) => {
    messages.push({
      time: Number(event.start.toFixed(6)),
      address: '/distantlights/event/start',
      args: {
        index,
        label: event.label,
        baseFreq: event.params.baseFreq,
        mode: event.params.mode,
        layerSettings: event.layerSettings || {},
      },
    });
    (event.automationLanes || []).forEach((lane, laneIndex) => {
      messages.push({
        time: Number(event.start.toFixed(6)),
        address: '/distantlights/automation/lane',
        args: {
          eventIndex: index,
          laneIndex,
          ...lane,
        },
      });
    });
    messages.push({
      time: Number((event.start + event.duration).toFixed(6)),
      address: '/distantlights/event/stop',
      args: { index },
    });
  });
  return { format: 'osc-json-v1', messages };
}
