/**
 * @module ui/automation
 *
 * Renders compact LFO automation controls.  Each lane can target any numeric
 * parameter and modulate it additively or multiplicatively.
 */

/** Render LFO automation lanes into a container. */
export function renderAutomationLanes(container, lanes, targets, onAction) {
  container.innerHTML = '';
  if (!lanes.length) {
    const empty = document.createElement('div');
    empty.className = 'sequence-empty';
    empty.textContent = 'No automation lanes yet.';
    container.appendChild(empty);
    return;
  }
  lanes.forEach((lane, index) => {
    const card = document.createElement('div');
    card.className = 'automation-card';
    card.innerHTML = `
      <div class="sequence-card-head">
        <strong>LFO ${index + 1}</strong>
        <div class="sequence-chip-row">
          <button data-action="remove">Remove</button>
        </div>
      </div>
      <div class="automation-grid">
        <label class="field">
          <span>Enabled</span>
          <select data-field="enabled">
            <option value="true" ${lane.enabled ? 'selected' : ''}>On</option>
            <option value="false" ${!lane.enabled ? 'selected' : ''}>Off</option>
          </select>
        </label>
        <label class="field">
          <span>Target</span>
          <select data-field="target">
            ${targets.map((target) => `<option value="${target}" ${lane.target === target ? 'selected' : ''}>${target}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>Wave</span>
          <select data-field="waveform">
            ${['sine', 'triangle', 'square', 'saw', 'inv-saw'].map((wave) => `<option value="${wave}" ${lane.waveform === wave ? 'selected' : ''}>${wave}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>Mode</span>
          <select data-field="mode">
            ${['add', 'multiply'].map((mode) => `<option value="${mode}" ${lane.mode === mode ? 'selected' : ''}>${mode}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>Rate Hz</span>
          <input data-field="rateHz" type="number" min="0" max="50" step="0.01" value="${lane.rateHz}" />
        </label>
        <label class="field">
          <span>Depth</span>
          <input data-field="depth" type="number" min="0" max="1" step="0.01" value="${lane.depth}" />
        </label>
        <label class="field">
          <span>Phase °</span>
          <input data-field="phaseDegrees" type="number" min="0" max="360" step="1" value="${lane.phaseDegrees}" />
        </label>
      </div>
    `;
    card.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const field = input.getAttribute('data-field');
        let value = input.value;
        if (field === 'enabled') value = value === 'true';
        else if (input.type === 'number') value = Number(value);
        onAction('update-field', index, { field, value });
      });
    });
    card.querySelector('[data-action="remove"]').addEventListener('click', () => onAction('remove', index));
    container.appendChild(card);
  });
}
