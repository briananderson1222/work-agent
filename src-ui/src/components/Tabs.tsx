interface Tab {
  key: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export function Tabs({ tabs, activeTab, onTabChange }: TabsProps) {
  return (
    <div className="page__tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`page__tab${activeTab === t.key ? ' page__tab--active' : ''}`}
          onClick={() => onTabChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
