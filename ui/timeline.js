/**
 * @module ui/timeline
 *
 * DOM helpers for rendering the sequence/timeline editor.  The editor is kept
 * intentionally simple: it exposes explicit event cards and a compact timeline
 * canvas so the feature remains usable on mobile browsers as well as desktop.
 */

/** Draw a compact timeline overview on a canvas. */
export function drawTimeline(canvas, events, selectedIndex = -1) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, width, height);
  if (!events.length) {
    ctx.fillStyle = '#888';
    ctx.font = '14px sans-serif';
    ctx.fillText('No sequence events yet.', 12, height / 2 + 5);
    return;
  }
  const total = Math.max(1, ...events.map((event) => event.start + event.duration));
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const x = (i / 4) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  events.forEach((event, index) => {
    const x = (event.start / total) * width;
    const w = Math.max(6, (event.duration / total) * width);
    const y = 12 + (index % 4) * 18;
    ctx.fillStyle = index === selectedIndex ? '#f4ff54' : '#00d8ff';
    ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = '#111';
    ctx.font = '10px sans-serif';
    ctx.fillText(String(index + 1), x + 3, y + 9.5);
  });
}

/**
 * Render editable sequence cards into a container.
 *
 * @param {HTMLElement} container Target DOM element.
 * @param {Array<Object>} events Sequence event objects.
 * @param {Array<Object>} presets Built-in presets.
 * @param {(action: string, index: number, payload?: any) => void} onAction Action callback.
 */
export function renderSequenceEditor(container, events, presets, onAction) {
  container.innerHTML = '';
  if (!events.length) {
    const empty = document.createElement('div');
    empty.className = 'sequence-empty';
    empty.textContent = 'No events yet. Add the current sound as an event to build a timeline.';
    container.appendChild(empty);
    return;
  }
  events.forEach((event, index) => {
    const card = document.createElement('div');
    card.className = 'sequence-card';
    card.innerHTML = `
      <div class="sequence-card-head">
        <strong>${index + 1}. ${event.label}</strong>
        <div class="sequence-chip-row">
          <button data-action="load">Load</button>
          <button data-action="dup">Duplicate</button>
          <button data-action="remove">Remove</button>
        </div>
      </div>
      <div class="sequence-grid">
        <label class="field">
          <span>Label</span>
          <input data-field="label" type="text" value="${event.label}" />
        </label>
        <label class="field">
          <span>Preset ref</span>
          <select data-field="presetLabel">
            ${presets.map((preset) => `<option value="${preset.params.label}" ${preset.params.label === event.params.label ? 'selected' : ''}>${preset.name}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>Start (s)</span>
          <input data-field="start" type="number" min="0" step="0.01" value="${event.start}" />
        </label>
        <label class="field">
          <span>Duration (s)</span>
          <input data-field="duration" type="number" min="0.1" step="0.1" value="${event.duration}" />
        </label>
      </div>
    `;
    card.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('change', () => {
        const payload = {
          field: input.getAttribute('data-field'),
          value: input.type === 'number' ? Number(input.value) : input.value,
        };
        onAction('update-field', index, payload);
      });
    });
    card.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => onAction(button.getAttribute('data-action'), index));
    });
    container.appendChild(card);
  });
}
