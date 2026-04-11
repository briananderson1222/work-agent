import { useState } from 'react';
import {
  useApplyCoreUpdateMutation,
  useCoreUpdateStatusQuery,
} from '@stallion-ai/sdk';
import { checkServerHealth } from '../../lib/serverHealth';

export function CoreUpdateCheck({ apiBase }: { apiBase: string }) {
  const [restarting, setRestarting] = useState(false);

  const {
    data: status,
    isFetching: checking,
    error: checkError,
    refetch: check,
  } = useCoreUpdateStatusQuery(apiBase, {
    enabled: false,
  });

  const updateMutation = useApplyCoreUpdateMutation(apiBase, {
    onSuccess: (data) => {
      if (data.success && data.restarting) {
        setRestarting(true);
        const poll = setInterval(async () => {
          const healthy = await checkServerHealth(apiBase);
          if (healthy) {
            clearInterval(poll);
            setRestarting(false);
            check();
          }
        }, 1500);
      } else if (data.success) {
        check();
      }
    },
  });

  const message = restarting
    ? 'Updated — server restarting…'
    : updateMutation.error
      ? (updateMutation.error as Error).message
      : checkError
        ? (checkError as Error).message
        : null;

  return (
    <div>
      <div className="settings__update-row">
        <button
          type="button"
          className="settings__update-btn settings__update-btn--check"
          onClick={() => check()}
          disabled={checking}
        >
          {checking ? 'Checking…' : 'Check for Updates'}
        </button>
        {status?.updateAvailable && (
          <button
            type="button"
            className="settings__update-btn settings__update-btn--apply"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || restarting}
          >
            {restarting
              ? 'Restarting…'
              : updateMutation.isPending
                ? 'Updating…'
                : `Update (${status.behind} commit${status.behind !== 1 ? 's' : ''} behind)`}
          </button>
        )}
      </div>
      {checking && (
        <div className="settings__update-meta">
          <span>Fetching from remote…</span>
        </div>
      )}
      {status && (
        <div className="settings__update-meta">
          <span>Branch: {status.branch}</span>
          <span>·</span>
          <span>Current: {status.currentHash}</span>
          {status.updateAvailable && (
            <>
              <span>·</span>
              <span className="settings__update-text--success">
                Latest: {status.remoteHash}
              </span>
            </>
          )}
          {!status.updateAvailable && status.ahead > 0 && (
            <>
              <span>·</span>
              <span className="settings__update-text--warning">
                {status.ahead} commit{status.ahead !== 1 ? 's' : ''} ahead
              </span>
            </>
          )}
          {!status.updateAvailable && !status.ahead && status.currentHash && (
            <>
              <span>·</span>
              <span
                className={`settings__update-text--${status.noUpstream ? 'muted' : 'success'}`}
              >
                {status.noUpstream ? 'No upstream configured' : 'Up to date ✓'}
              </span>
            </>
          )}
        </div>
      )}
      {message && (
        <div
          className={`settings__update-msg settings__update-msg--${restarting ? 'warning' : message.includes('Updated') ? 'success' : 'error'}`}
        >
          {message}
        </div>
      )}
      <span className="settings__field-hint">
        Pull latest changes from the git remote. Server restarts automatically
        after update.
      </span>
    </div>
  );
}
