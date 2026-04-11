import { PROVIDER_TYPES } from './providerTypes';

export function ProviderTypePicker({
  onAdd,
}: {
  onAdd: (type: string, name: string) => void;
}) {
  return (
    <div className="provider-overview">
      <div className="provider-overview__header">
        <h3 className="provider-overview__title">Add Model Connection</h3>
        <p className="provider-overview__desc">
          Choose the type of backend to add
        </p>
      </div>
      <div className="provider-overview__quickstart-options">
        {PROVIDER_TYPES.map((option) => (
          <button
            key={option.type}
            className="provider-overview__quickstart-btn"
            onClick={() => onAdd(option.type, option.name)}
          >
            <span className="provider-overview__quickstart-icon">
              {option.icon}
            </span>
            <div>
              <div className="provider-overview__quickstart-name">
                {option.name}
              </div>
              <div className="provider-overview__quickstart-meta">
                {option.desc}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
