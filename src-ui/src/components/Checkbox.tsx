/**
 * Checkbox — styled checkbox for multi-select scenarios.
 */
import './Checkbox.css';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function Checkbox({ checked, onChange, id, disabled, children }: CheckboxProps) {
  return (
    <label className={`cb${disabled ? ' cb--disabled' : ''}`}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="cb__input"
      />
      <span className="cb__box" aria-hidden="true">
        {checked && (
          <svg viewBox="0 0 12 12" className="cb__check">
            <path d="M2.5 6l2.5 2.5 4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {children && <span className="cb__label">{children}</span>}
    </label>
  );
}
