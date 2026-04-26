import { useEffect, useState } from 'react';
import { Button } from '../components/Button';

export function GuidanceConversionModal({
  isOpen,
  title,
  sourceName,
  destinationLabel,
  confirmLabel,
  defaultName,
  pending,
  notes,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  title: string;
  sourceName: string;
  destinationLabel: string;
  confirmLabel: string;
  defaultName: string;
  pending?: boolean;
  notes: string[];
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
    }
  }, [defaultName, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guidance-conversion-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="guidance-conversion-title">{title}</h3>
        </div>
        <div className="modal-body">
          <p>
            Create a {destinationLabel} from "{sourceName}". The source stays
            unchanged.
          </p>
          <div className="editor-field">
            <label className="editor-label">Name</label>
            <input
              className="editor-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <ul className="guidance-conversion__notes">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
        <div className="modal-footer">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={pending || !name.trim()}
            onClick={() => onConfirm(name.trim())}
          >
            {pending ? 'Creating...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
