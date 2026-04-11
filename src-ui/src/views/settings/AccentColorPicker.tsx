import { useState } from 'react';

const ACCENT_PRESETS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
];

const ACCENT_STORAGE_KEY = 'stallion-accent-color';

export function AccentColorPicker() {
  const [color, setColor] = useState(
    () => localStorage.getItem(ACCENT_STORAGE_KEY) || '',
  );

  const apply = (nextColor: string) => {
    setColor(nextColor);
    if (nextColor) {
      localStorage.setItem(ACCENT_STORAGE_KEY, nextColor);
      document.documentElement.style.setProperty('--accent-primary', nextColor);
    } else {
      localStorage.removeItem(ACCENT_STORAGE_KEY);
      document.documentElement.style.removeProperty('--accent-primary');
    }
  };

  return (
    <div className="settings__field">
      <label className="settings__field-label">Accent Color</label>
      <div className="settings__accent-row">
        {ACCENT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`settings__accent-swatch${color === preset ? ' settings__accent-swatch--active' : ''}`}
            style={{ background: preset }}
            onClick={() => apply(preset)}
            aria-label={`Accent color ${preset}`}
          />
        ))}
        <input
          type="color"
          className="settings__accent-custom"
          value={color || '#6366f1'}
          onChange={(event) => apply(event.target.value)}
          aria-label="Custom accent color"
        />
        {color && (
          <button
            type="button"
            className="settings__accent-reset"
            onClick={() => apply('')}
          >
            Reset
          </button>
        )}
      </div>
      <span className="settings__field-hint">
        Customize the UI accent color. Resets to default on clear.
      </span>
    </div>
  );
}
