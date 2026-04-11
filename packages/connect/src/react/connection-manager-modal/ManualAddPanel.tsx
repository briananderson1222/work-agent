import { inputStyle, primaryBtnStyle, secondaryBtnStyle } from './styles';

interface ManualAddPanelProps {
  name: string;
  url: string;
  onNameChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onAdd: () => void;
  onCancel: () => void;
}

export function ManualAddPanel({
  name,
  url,
  onNameChange,
  onUrlChange,
  onAdd,
  onCancel,
}: ManualAddPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input
        type="text"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Name (optional)"
        style={inputStyle}
        autoFocus
      />
      <input
        type="text"
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        placeholder="http://192.168.1.x:3141"
        style={inputStyle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onAdd();
          if (event.key === 'Escape') onCancel();
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onAdd}
          disabled={!url.trim()}
          style={primaryBtnStyle}
        >
          Add
        </button>
        <button type="button" onClick={onCancel} style={secondaryBtnStyle}>
          Cancel
        </button>
      </div>
    </div>
  );
}
