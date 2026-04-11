export function DeleteIntegrationModal({
  integrationName,
  onCancel,
  onConfirm,
}: {
  integrationName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="plugins__confirm-overlay" onClick={onCancel}>
      <div
        className="plugins__confirm"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Delete Integration</h3>
        <p>
          Remove &ldquo;{integrationName}&rdquo;? This cannot be undone.
        </p>
        <div className="plugins__confirm-actions">
          <button className="plugins__confirm-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="plugins__confirm-delete" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
