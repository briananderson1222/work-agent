/**
 * useUrlSelection — sync a selected item ID with the URL path.
 *
 * Given a base path like "/agents", reads the selection from
 * the URL (e.g. "/agents/my-agent") and provides setters that
 * update both state and URL together.
 */
import { useCallback, useMemo } from 'react';
import { useNavigation } from '../contexts/NavigationContext';

export function useUrlSelection(basePath: string) {
  const { navigate } = useNavigation();

  const selectedId = useMemo(() => {
    const path = window.location.pathname;
    if (!path.startsWith(`${basePath}/`)) return null;
    const rest = decodeURIComponent(path.slice(basePath.length + 1));
    return rest || null;
  }, [basePath]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = useCallback(
    (id: string) => navigate(`${basePath}/${encodeURIComponent(id)}`),
    [basePath, navigate],
  );

  const deselect = useCallback(() => navigate(basePath), [basePath, navigate]);

  return { selectedId, select, deselect };
}
