'use client';

import { useEffect, useMemo, useState } from 'react';

type AgentStatusType = 'active' | 'idle' | 'needs-reset';
type AccentTone = 'blue' | 'green' | 'orange' | 'red' | 'neutral';

interface AgentRosterEntry {
  id: string;
  name: string;
  emoji: string;
  role: string;
}

interface AgentCard extends AgentRosterEntry {
  contextTokens: number;
  totalTokens: number;
  contextPercent: number;
  lastActive: string | null;
  model: string | null;
  status: AgentStatusType;
  sessionKey: string | null;
}

interface SystemHealth {
  activeSessions: number;
  diskFreeGb: number;
  diskTotalGb: number;
  diskPercent: number;
  agentsNeedingReset: string[];
}

interface CommandCenterResponse {
  agents: AgentCard[];
  health: SystemHealth;
}

interface CommandCenterProps {
  roster: AgentRosterEntry[];
}

const REFRESH_INTERVAL_MS = 15000;

const TONE_CLASSES: Record<AccentTone, {
  dot: string;
  text: string;
  badge: string;
  bar: string;
}> = {
  blue: {
    dot: 'bg-sky-400',
    text: 'text-sky-300',
    badge: 'border-sky-400/40 bg-sky-500/10 text-sky-200',
    bar: 'bg-sky-400',
  },
  green: {
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
    badge: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200',
    bar: 'bg-emerald-400',
  },
  orange: {
    dot: 'bg-orange-400',
    text: 'text-orange-300',
    badge: 'border-orange-400/40 bg-orange-500/10 text-orange-200',
    bar: 'bg-orange-400',
  },
  red: {
    dot: 'bg-red-400',
    text: 'text-red-300',
    badge: 'border-red-400/40 bg-red-500/10 text-red-200',
    bar: 'bg-red-400',
  },
  neutral: {
    dot: 'bg-zinc-500',
    text: 'text-zinc-300',
    badge: 'border-zinc-600/70 bg-zinc-700/20 text-zinc-300',
    bar: 'bg-zinc-500',
  },
};

function createPlaceholderAgents(roster: AgentRosterEntry[]): AgentCard[] {
  return roster.map((agent) => ({
    ...agent,
    contextTokens: 0,
    totalTokens: 0,
    contextPercent: 0,
    lastActive: null,
    model: null,
    status: 'idle',
    sessionKey: null,
  }));
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function getUsageTone(percent: number): AccentTone {
  if (percent >= 85) return 'red';
  if (percent >= 70) return 'orange';
  if (percent >= 50) return 'blue';
  return 'green';
}

function getUsageLabel(percent: number) {
  if (percent >= 85) return 'Critical';
  if (percent >= 70) return 'High';
  if (percent >= 50) return 'Watch';
  return 'Healthy';
}

function getStatusTone(status: AgentStatusType): AccentTone {
  if (status === 'active') return 'blue';
  if (status === 'needs-reset') return 'red';
  return 'neutral';
}

function getStatusLabel(status: AgentStatusType) {
  if (status === 'active') return 'Active';
  if (status === 'needs-reset') return 'Needs reset';
  return 'Idle';
}

function formatRelativeTime(value: string | null) {
  if (!value) return 'No recent activity';

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'Unknown';

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const divisions = [
    { amount: 60, unit: 'second' as const },
    { amount: 60, unit: 'minute' as const },
    { amount: 24, unit: 'hour' as const },
    { amount: 7, unit: 'day' as const },
    { amount: 4.34524, unit: 'week' as const },
    { amount: 12, unit: 'month' as const },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' as const },
  ];

  let duration = diffSeconds;

  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }

  return 'Unknown';
}

function formatTokenCount(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}m`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, '')}k`;
  }

  return value.toLocaleString();
}

function formatCapacityLabel(free: number, total: number) {
  return `${free.toFixed(1)} GB free / ${total.toFixed(1)} GB total`;
}

function TelemetryCard({
  label,
  value,
  detail,
  tone,
  loading,
}: {
  label: string;
  value: string;
  detail: string;
  tone: AccentTone;
  loading?: boolean;
}) {
  const palette = TONE_CLASSES[tone];

  return (
    <article className="rounded-xl border border-white/10 bg-[linear-gradient(160deg,rgba(17,20,26,0.88),rgba(9,11,16,0.94))] px-4 py-4 shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">{value}</p>
          <p className="mt-1 text-xs text-zinc-400">{detail}</p>
        </div>
        <span
          className={`mt-1 h-2.5 w-2.5 rounded-full ${palette.dot} ${loading ? 'animate-pulse' : ''}`}
          aria-hidden="true"
        />
      </div>
    </article>
  );
}

function AgentTelemetryCard({ agent }: { agent: AgentCard }) {
  const usageTone = getUsageTone(agent.contextPercent);
  const statusTone = getStatusTone(agent.status);
  const usagePalette = TONE_CLASSES[usageTone];
  const statusPalette = TONE_CLASSES[statusTone];

  return (
    <article className="group rounded-xl border border-white/10 bg-[linear-gradient(150deg,rgba(16,18,24,0.93),rgba(8,9,13,0.96))] px-4 py-4 shadow-[0_16px_32px_rgba(0,0,0,0.28)] transition-colors duration-200 hover:border-white/20 sm:px-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-black/30 text-lg">
                <span aria-hidden="true">{agent.emoji}</span>
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-zinc-100 sm:text-base">{agent.name}</h2>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusPalette.badge}`}
                  >
                    {getStatusLabel(agent.status)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
                  <span className="uppercase tracking-[0.14em] text-zinc-500">{agent.role}</span>
                  <span className="text-zinc-700">·</span>
                  <span className="truncate text-zinc-500">{agent.sessionKey ?? 'Session unassigned'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${usagePalette.badge}`}
            >
              {getUsageLabel(agent.contextPercent)} context load
            </span>
            <span className="inline-flex items-center rounded-full border border-zinc-700/80 bg-zinc-800/45 px-2 py-0.5 text-[11px] text-zinc-300">
              {formatRelativeTime(agent.lastActive)}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.8fr)_auto_auto_auto]">
          <div>
            <div className="flex items-end justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Context Window</p>
              <p className={`text-sm font-semibold tabular-nums ${usagePalette.text}`}>
                {clampPercent(agent.contextPercent)}%
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800/80">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${usagePalette.bar}`}
                style={{ width: `${clampPercent(agent.contextPercent)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {formatTokenCount(agent.totalTokens)} / {formatTokenCount(agent.contextTokens)} tokens
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-black/20 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Total Tokens</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-100">
              {formatTokenCount(agent.totalTokens)}
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-black/20 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Capacity</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-100">
              {formatTokenCount(agent.contextTokens)}
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-black/20 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Model</p>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-100">
              {agent.model ?? 'Unknown'}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function CommandCenter({ roster }: CommandCenterProps) {
  const [agents, setAgents] = useState<AgentCard[]>(() => createPlaceholderAgents(roster));
  const [health, setHealth] = useState<SystemHealth>({
    activeSessions: 0,
    diskFreeGb: 0,
    diskTotalGb: 0,
    diskPercent: 0,
    agentsNeedingReset: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      try {
        const response = await fetch('/api/dashboard', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as CommandCenterResponse;
        if (!isMounted) return;

        setAgents(payload.agents);
        setHealth(payload.health);
        setError(null);
        setLastUpdated(new Date().toISOString());
      } catch (requestError) {
        if (!isMounted) return;
        setError(
          requestError instanceof Error ? requestError.message : 'Failed to refresh command center'
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();
    const intervalId = window.setInterval(() => {
      void loadDashboard();
    }, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const summary = useMemo(() => {
    const totalTokens = agents.reduce((sum, agent) => sum + agent.totalTokens, 0);
    const avgContext = agents.length
      ? Math.round(agents.reduce((sum, agent) => sum + agent.contextPercent, 0) / agents.length)
      : 0;
    const warningAgents = agents.filter(
      (agent) => agent.contextPercent >= 70 && agent.contextPercent < 85
    ).length;
    const criticalAgents = agents.filter((agent) => agent.contextPercent >= 85).length;
    const healthyAgents = agents.filter((agent) => agent.contextPercent < 50).length;
    const idleAgents = agents.filter((agent) => agent.status === 'idle').length;
    const modelCount = new Set(agents.map((agent) => agent.model).filter(Boolean)).size;

    return {
      totalTokens,
      avgContext,
      warningAgents,
      criticalAgents,
      healthyAgents,
      idleAgents,
      modelCount,
    };
  }, [agents]);

  const systemState = useMemo(() => {
    if (error) {
      return { label: 'Degraded', tone: 'red' as const, detail: error };
    }

    if (health.agentsNeedingReset.length > 0 || health.diskPercent >= 85) {
      return {
        label: 'Attention',
        tone: 'orange' as const,
        detail: health.agentsNeedingReset.length > 0
          ? `${health.agentsNeedingReset.length} agent alerts`
          : `Disk at ${health.diskPercent}%`,
      };
    }

    return { label: 'Nominal', tone: 'green' as const, detail: 'No critical alerts detected' };
  }, [error, health.agentsNeedingReset.length, health.diskPercent]);

  const systemPalette = TONE_CLASSES[systemState.tone];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050608] text-zinc-200">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_86%_14%,rgba(249,115,22,0.13),transparent_28%),radial-gradient(circle_at_16%_84%,rgba(16,185,129,0.12),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.22] [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.78))]" />

      <div className="relative mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-white/10 bg-[linear-gradient(160deg,rgba(18,22,29,0.9),rgba(9,10,14,0.95))] px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300/80">Operations Grid</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-[2rem]">
                Mission Control
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                Live command telemetry across agent sessions, context pressure, and system health.
              </p>
            </div>

            <div className="grid gap-2 text-xs text-zinc-400 sm:text-sm">
              <div className="flex items-center justify-start gap-2 lg:justify-end">
                <span className={`h-2.5 w-2.5 rounded-full ${systemPalette.dot} ${loading ? 'animate-pulse' : ''}`} />
                <span className={`font-medium ${systemPalette.text}`}>{systemState.label}</span>
                <span className="text-zinc-600">·</span>
                <span>{systemState.detail}</span>
              </div>
              <p className="text-zinc-500 lg:text-right">
                {lastUpdated ? `Last refresh ${formatRelativeTime(lastUpdated)}` : 'Awaiting first sync'}
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <TelemetryCard
            label="Active Sessions"
            value={health.activeSessions.toLocaleString()}
            detail={`${summary.idleAgents} idle agents`}
            tone="blue"
            loading={loading}
          />
          <TelemetryCard
            label="Fleet Health"
            value={summary.healthyAgents.toLocaleString()}
            detail={`${summary.warningAgents} warning · ${summary.criticalAgents} critical`}
            tone={summary.criticalAgents > 0 ? 'red' : summary.warningAgents > 0 ? 'orange' : 'green'}
          />
          <TelemetryCard
            label="Token Throughput"
            value={formatTokenCount(summary.totalTokens)}
            detail={`Avg context ${clampPercent(summary.avgContext)}%`}
            tone="orange"
          />
          <TelemetryCard
            label="Disk Capacity"
            value={`${health.diskPercent}%`}
            detail={formatCapacityLabel(health.diskFreeGb, health.diskTotalGb)}
            tone={health.diskPercent >= 85 ? 'red' : health.diskPercent >= 70 ? 'orange' : 'green'}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_22rem]">
          <div className="space-y-3">
            {agents.map((agent) => (
              <AgentTelemetryCard key={agent.id} agent={agent} />
            ))}
          </div>

          <aside className="space-y-4">
            <section className="rounded-xl border border-white/10 bg-[linear-gradient(160deg,rgba(16,19,26,0.92),rgba(8,10,15,0.96))] px-4 py-4 shadow-[0_14px_36px_rgba(0,0,0,0.32)]">
              <h2 className="text-sm font-semibold text-zinc-100">System Signal</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-zinc-800/80 bg-black/20 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Disk Usage</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-100">{health.diskPercent}% used</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800/80">
                    <div
                      className={`h-full rounded-full ${health.diskPercent >= 85 ? 'bg-red-400' : health.diskPercent >= 70 ? 'bg-orange-400' : 'bg-emerald-400'}`}
                      style={{ width: `${clampPercent(health.diskPercent)}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-800/80 bg-black/20 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Model Coverage</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-100">{summary.modelCount} models active</p>
                  <p className="mt-1 text-xs text-zinc-400">{agents.length - summary.modelCount} agents without model metadata</p>
                </div>

                <div className="rounded-lg border border-zinc-800/80 bg-black/20 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Context Risk Queue</p>
                  {health.agentsNeedingReset.length > 0 ? (
                    <ul className="mt-2 space-y-1.5 text-xs text-zinc-300">
                      {health.agentsNeedingReset.slice(0, 6).map((name) => (
                        <li key={name} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400" aria-hidden="true" />
                          <span className="truncate">{name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-emerald-300">No agents currently require reset.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-[linear-gradient(160deg,rgba(16,19,26,0.92),rgba(8,10,15,0.96))] px-4 py-4 shadow-[0_14px_36px_rgba(0,0,0,0.32)]">
              <h2 className="text-sm font-semibold text-zinc-100">Fleet State</h2>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between rounded-md border border-zinc-800/70 bg-black/20 px-3 py-2">
                  <span className="text-zinc-400">Healthy</span>
                  <span className="font-semibold text-emerald-300">{summary.healthyAgents}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-zinc-800/70 bg-black/20 px-3 py-2">
                  <span className="text-zinc-400">Warning</span>
                  <span className="font-semibold text-orange-300">{summary.warningAgents}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-zinc-800/70 bg-black/20 px-3 py-2">
                  <span className="text-zinc-400">Critical</span>
                  <span className="font-semibold text-red-300">{summary.criticalAgents}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-zinc-800/70 bg-black/20 px-3 py-2">
                  <span className="text-zinc-400">Idle</span>
                  <span className="font-semibold text-zinc-200">{summary.idleAgents}</span>
                </div>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
