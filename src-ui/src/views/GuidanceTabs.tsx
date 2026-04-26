import { useNavigation } from '../contexts/NavigationContext';

export function GuidanceTabs({
  active,
  onNavigate,
}: {
  active: 'playbooks' | 'skills';
  onNavigate?: (path: string) => void;
}) {
  const { navigate } = useNavigation();
  const go = onNavigate ?? navigate;
  return (
    <div className="page__tabs page__tabs--compact" aria-label="Guidance">
      <button
        type="button"
        className={`page__tab${active === 'playbooks' ? ' page__tab--active' : ''}`}
        onClick={() => go('/playbooks')}
      >
        Playbooks
      </button>
      <button
        type="button"
        className={`page__tab${active === 'skills' ? ' page__tab--active' : ''}`}
        onClick={() => go('/skills')}
      >
        Skills
      </button>
    </div>
  );
}
