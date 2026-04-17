import './SortToolbar.css';

interface SortOption {
  key: string;
  label: string;
}

interface SortToolbarProps {
  options: SortOption[];
  value: string;
  onChange: (key: string) => void;
}

export function SortToolbar({ options, value, onChange }: SortToolbarProps) {
  return (
    <div className="sort-toolbar">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={`sort-toolbar__btn${value === opt.key ? ' sort-toolbar__btn--active' : ''}`}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
