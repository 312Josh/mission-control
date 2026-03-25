'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type QuickAction = 'reset' | 'new';

interface AgentCardData {
  id: string;
  name: string;
  emoji: string;
  session_status: string | null;
  context_percent: number | null;
  model: string | null;
  last_activity: string | null;
  session_id: string | null;
  session_key: string | null;
}

interface AgentsStatusResponse {
  generated_at: string;
  connected: boolean;
  error: string | null;
  agents: AgentCardData[];
}

const REFRESH_INTERVAL_MS = 15000;

function MaterialIcon({
  name,
  filled = false,
  className = '',
}: {
  name: string;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined leading-none ${className}`}
      style={{
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 500, 'GRAD' 0, 'opsz' 20`,
      }}
    >
      {name}
    </span>
  );
}

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return 'No data';
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return 'No data';
  }

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  const steps = [
    { amount: 60, unit: 'second' as const },
    { amount: 60, unit: 'minute' as const },
    { amount: 24, unit: 'hour' as const },
    { amount: 7, unit: 'day' as const },
    { amount: 4.34524, unit: 'week' as const },
    { amount: 12, unit: 'month' as const },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' as const },
  ];

  let duration = diffSeconds;
  for (const step of steps) {
    if (Math.abs(duration) < step.amount) {
      return formatter.format(Math.round(duration), step.unit);
    }
    duration /= step.amount;
  }

  return 'No data';
}

function contextTone(contextPercent: number | null): string {
  if (contextPercent === null) {
    return 'text-[#C3C6D5]';
  }

  if (contextPercent >= 85) {
    return 'text-[#FFB4AB]';
  }

  if (contextPercent >= 70) {
    return 'text-[#DDB7FF]';
  }

  return 'text-[#4AE176]';
}

function statusBadge(status: string | null): string {
  if (!status) {
    return 'border-[#434653] bg-[#2A2A2C] text-[#C3C6D5]';
  }

  const lower = status.toLowerCase();
  if (lower === 'active' || lower === 'connected') {
    return 'border-[#4AE176]/50 bg-[#4AE176]/15 text-[#4AE176]';
  }

  if (lower === 'idle') {
    return 'border-[#B3C5FF]/50 bg-[#638EFD]/15 text-[#B3C5FF]';
  }

  return 'border-[#434653] bg-[#2A2A2C] text-[#E4E2E4]';
}

export default function AgentsPage() {
  const [data, setData] = useState<AgentsStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<Record<string, QuickAction | null>>({});
  const [actionMessage, setActionMessage] = useState<Record<string, string>>({});

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/agents/status', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Status request failed (${response.status})`);
      }

      const payload = (await response.json()) as AgentsStatusResponse;
      setData(payload);
      setRefreshError(null);
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Failed to load agent status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();

    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadStatus]);

  const handleAction = useCallback(
    async (agentId: string, action: QuickAction) => {
      setActionState((current) => ({ ...current, [agentId]: action }));
      setActionMessage((current) => ({ ...current, [agentId]: '' }));

      try {
        const response = await fetch('/api/agents/status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ agentId, action }),
        });

        const payload = (await response.json()) as { warning?: string; error?: string };

        if (!response.ok) {
          throw new Error(payload.error || `Action failed (${response.status})`);
        }

        if (payload.warning) {
          setActionMessage((current) => ({ ...current, [agentId]: payload.warning || '' }));
        }

        await loadStatus();
      } catch (error) {
        setActionMessage((current) => ({
          ...current,
          [agentId]: error instanceof Error ? error.message : 'Quick action failed',
        }));
      } finally {
        setActionState((current) => ({ ...current, [agentId]: null }));
      }
    },
    [loadStatus]
  );

  const cards = useMemo(() => data?.agents ?? [], [data]);
  const sourceUnavailable = data ? !data.connected : Boolean(refreshError);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#131315] font-['Inter',sans-serif] text-[#E4E2E4]">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(141,144,159,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(141,144,159,0.08)_1px,transparent_1px)] [background-size:52px_52px]" />

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-xl border border-[#434653] bg-[#1F1F21] p-5 shadow-[0_14px_36px_rgba(0,0,0,0.28)] sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Mission Telemetry</p>
              <h1 className="mt-2 text-2xl font-black uppercase tracking-tight text-[#E4E2E4]">Agents</h1>
              <p className="mt-2 text-sm text-[#C3C6D5]">Live session telemetry for the named agent roster.</p>
            </div>

            <div className="text-sm">
              <div className="flex items-center justify-end gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${sourceUnavailable ? 'bg-[#FFB4AB]' : 'bg-[#4AE176]'} ${loading ? 'animate-pulse' : ''}`}
                />
                <span className={sourceUnavailable ? 'text-[#FFB4AB]' : 'text-[#4AE176]'}>
                  {loading ? 'Syncing' : sourceUnavailable ? 'Source unavailable' : 'Source live'}
                </span>
              </div>
              <p className="mt-1 text-right text-xs text-[#C3C6D5]">
                {data?.generated_at ? `Updated ${formatRelativeTime(data.generated_at)}` : 'Awaiting first sync'}
              </p>
            </div>
          </div>

          {(refreshError || data?.error) && (
            <div className="mt-4 rounded-lg border border-[#FFB4AB]/60 bg-[#93000A]/30 px-3 py-2 text-sm text-[#FFB4AB]">
              <div className="flex items-center gap-2">
                <MaterialIcon name="error" className="text-base" />
                <span>{refreshError || data?.error}</span>
              </div>
            </div>
          )}
        </header>

        <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((agent) => {
            const busyAction = actionState[agent.id];
            const noData = sourceUnavailable || !agent.session_key;

            return (
              <article
                key={agent.id}
                className="rounded-xl border border-[#434653] bg-[#1B1B1D] p-4 transition-colors duration-300 hover:bg-[#1F1F21]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#434653] bg-[#2A2A2C] text-xl">
                      <span aria-hidden="true">{agent.emoji}</span>
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-black uppercase tracking-tight text-[#E4E2E4] sm:text-base">{agent.name}</h2>
                      <p className="mt-1 truncate text-xs text-[#C3C6D5]">{agent.session_key || 'No data'}</p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${statusBadge(noData ? null : agent.session_status)}`}
                  >
                    {(noData ? null : agent.session_status) || 'No data'}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-[#434653] bg-[#2A2A2C]/60 px-3 py-2">
                    <dt className="text-[10px] font-black uppercase tracking-[0.18em] text-[#C3C6D5]">Context %</dt>
                    <dd className={`mt-1 text-sm font-semibold tabular-nums ${contextTone(noData ? null : agent.context_percent)}`}>
                      {noData || agent.context_percent === null ? 'No data' : `${agent.context_percent}%`}
                    </dd>
                  </div>

                  <div className="rounded-lg border border-[#434653] bg-[#2A2A2C]/60 px-3 py-2">
                    <dt className="text-[10px] font-black uppercase tracking-[0.18em] text-[#C3C6D5]">Model</dt>
                    <dd className="mt-1 truncate text-sm font-semibold text-[#E4E2E4]">
                      {noData ? 'No data' : agent.model || 'No data'}
                    </dd>
                  </div>

                  <div className="rounded-lg border border-[#434653] bg-[#2A2A2C]/60 px-3 py-2">
                    <dt className="text-[10px] font-black uppercase tracking-[0.18em] text-[#C3C6D5]">Last Activity</dt>
                    <dd className="mt-1 text-sm font-semibold text-[#E4E2E4]">
                      {noData ? 'No data' : formatRelativeTime(agent.last_activity)}
                    </dd>
                  </div>

                  <div className="rounded-lg border border-[#434653] bg-[#2A2A2C]/60 px-3 py-2">
                    <dt className="text-[10px] font-black uppercase tracking-[0.18em] text-[#C3C6D5]">Session Status</dt>
                    <dd className="mt-1 text-sm font-semibold text-[#E4E2E4]">{noData ? 'No data' : agent.session_status || 'No data'}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAction(agent.id, 'reset')}
                    disabled={Boolean(busyAction) || noData}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#DDB7FF]/50 bg-[#6F00BE]/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#DDB7FF] transition-colors hover:bg-[#6F00BE]/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <MaterialIcon
                      name={busyAction === 'reset' ? 'sync' : 'restart_alt'}
                      className={`text-sm ${busyAction === 'reset' ? 'animate-spin' : ''}`}
                    />
                    Reset
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleAction(agent.id, 'new')}
                    disabled={Boolean(busyAction) || sourceUnavailable}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#638EFD]/60 bg-[#638EFD]/18 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#B3C5FF] transition-colors hover:bg-[#638EFD]/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <MaterialIcon
                      name={busyAction === 'new' ? 'sync' : 'add_circle'}
                      className={`text-sm ${busyAction === 'new' ? 'animate-spin' : ''}`}
                    />
                    New Session
                  </button>
                </div>

                {actionMessage[agent.id] && (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded border border-[#DDB7FF]/40 bg-[#6F00BE]/20 px-2 py-1 text-xs text-[#DDB7FF]">
                    <MaterialIcon name="warning" className="text-sm" />
                    {actionMessage[agent.id]}
                  </p>
                )}
              </article>
            );
          })}
        </section>

        {!loading && cards.length === 0 && (
          <div className="mt-5 rounded-xl border border-dashed border-[#434653] bg-[#1B1B1D] p-8 text-center">
            <MaterialIcon name="hourglass_empty" className="mx-auto text-3xl text-[#C3C6D5]" />
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">No Data</p>
            <p className="mt-2 text-sm text-[#C3C6D5]">No agent cards were returned by the current status source.</p>
          </div>
        )}
      </div>
    </main>
  );
}
