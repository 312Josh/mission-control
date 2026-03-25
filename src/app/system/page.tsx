'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { SystemOverview } from '@/lib/system-overview.types';

const REFRESH_MS = 15000;

type Tone = 'green' | 'red' | 'blue' | 'yellow' | 'purple';

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

export default function SystemPage() {
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasOverviewRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const loadOverview = async () => {
      try {
        if (mounted && hasOverviewRef.current) {
          setRefreshing(true);
        }

        const res = await fetch('/api/system/overview', { cache: 'no-store' });
        if (!res.ok) {
          let detail = `System overview returned ${res.status}`;
          try {
            const payload = (await res.json()) as { detail?: string };
            if (payload.detail) {
              detail = payload.detail;
            }
          } catch {
            // Keep status-based error when response body is not JSON.
          }
          throw new Error(detail);
        }

        const payload = (await res.json()) as SystemOverview;
        if (!mounted) {
          return;
        }

        setOverview(payload);
        hasOverviewRef.current = true;
        setError(null);
      } catch (loadError) {
        if (!mounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Failed to load system data');
      } finally {
        if (mounted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void loadOverview();
    const interval = window.setInterval(() => {
      void loadOverview();
    }, REFRESH_MS);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const stats = useMemo(() => {
    if (!overview) {
      return null;
    }

    const health = overview.system_health;
    const gatewayTone: Tone = !overview.sessions.connected ? 'red' : overview.sessions.error ? 'yellow' : 'green';

    const gatewayValue = !overview.sessions.connected ? 'OFFLINE' : overview.sessions.error ? 'DEGRADED' : 'ONLINE';

    const uptime = formatDistanceToNow(new Date(Date.now() - health.uptime_seconds * 1000), {
      addSuffix: false,
    });

    const memoryTone: Tone = health.memory_used_percent >= 85 ? 'red' : health.memory_used_percent >= 70 ? 'yellow' : 'green';

    const diskTone: Tone =
      health.disk_used_percent !== null && health.disk_used_percent >= 85
        ? 'red'
        : health.disk_used_percent !== null && health.disk_used_percent >= 70
          ? 'yellow'
          : 'blue';

    const cpuTone: Tone = health.cpu_load_percent >= 85 ? 'red' : health.cpu_load_percent >= 65 ? 'yellow' : 'green';

    const activeConnections = overview.sessions.total;
    const activeDetail = [
      `${overview.sessions.total} gateway sessions`,
      `${overview.agent_status.active_links} active links`,
      `${overview.connections.dashboard_sse_clients} dashboard streams`,
    ].join(' · ');

    const rateLimit = overview.sessions.rate_limit;
    const rateLimitValue = rateLimit.available
      ? rateLimit.remaining !== null && rateLimit.limit !== null
        ? `${rateLimit.remaining}/${rateLimit.limit}`
        : rateLimit.remaining !== null
          ? `${rateLimit.remaining} remaining`
          : 'Reported'
      : 'Unavailable';

    const rateLimitDetail = rateLimit.available
      ? [
          rateLimit.reset_at ? `reset ${formatDistanceToNow(new Date(rateLimit.reset_at), { addSuffix: true })}` : null,
          rateLimit.retry_after_seconds !== null ? `retry in ${rateLimit.retry_after_seconds}s` : null,
          rateLimit.source ? `source ${rateLimit.source}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Gateway provided partial rate-limit metadata'
      : 'Gateway did not expose rate-limit metadata';

    return {
      gatewayTone,
      gatewayValue,
      uptime,
      memoryTone,
      diskTone,
      cpuTone,
      activeConnections,
      activeDetail,
      rateLimitValue,
      rateLimitDetail,
    };
  }, [overview]);

  return (
    <main className="min-h-screen bg-[#131315] font-['Inter',sans-serif] text-[#E4E2E4]">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#434653] bg-[#1F1F21] px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
          <div className="flex items-center gap-3">
            <MaterialIcon name="memory" className="text-xl text-[#B3C5FF]" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Control Surface</p>
              <h1 className="text-lg font-black uppercase tracking-tight text-[#E4E2E4]">System Overview</h1>
              <p className="text-xs text-[#C3C6D5]">Live gateway and host telemetry from `/api/system/overview`</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#C3C6D5]">
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-lg border border-[#434653] bg-[#2A2A2C] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#C3C6D5] hover:border-[#638EFD]/60 hover:text-[#E4E2E4]"
            >
              <MaterialIcon name="arrow_back" className="text-sm" />
              Dashboard
            </Link>
            <span className="inline-flex items-center gap-1 rounded-lg border border-[#434653] bg-[#2A2A2C] px-2 py-1">
              <MaterialIcon name="refresh" className={`text-sm ${refreshing ? 'animate-spin text-[#B3C5FF]' : ''}`} />
              {overview?.generated_at
                ? `Updated ${formatDistanceToNow(new Date(overview.generated_at), { addSuffix: true })}`
                : loading
                  ? 'Loading...'
                  : 'Awaiting telemetry'}
            </span>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-[#FFB4AB]/60 bg-[#93000A]/30 p-3 text-sm text-[#FFB4AB]">
            <div className="flex items-center gap-2">
              <MaterialIcon name="error" className="text-base" />
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        {!overview && loading ? (
          <div className="rounded-xl border border-dashed border-[#434653] bg-[#1B1B1D] p-8 text-center text-sm text-[#C3C6D5]">
            <MaterialIcon name="progress_activity" className="mb-2 text-2xl animate-spin" />
            <p>Loading live system telemetry...</p>
          </div>
        ) : null}

        {overview && stats ? (
          <>
            <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Gateway"
                value={stats.gatewayValue}
                detail={overview.sessions.error || overview.sessions.gateway_url}
                tone={stats.gatewayTone}
                icon="hub"
              />
              <StatCard
                title="Uptime"
                value={stats.uptime}
                detail={`${overview.system_health.hostname} · ${overview.system_health.platform} ${overview.system_health.release}`}
                tone="purple"
                icon="schedule"
              />
              <StatCard
                title="CPU"
                value={`${overview.system_health.cpu_load_percent}%`}
                detail={`${overview.system_health.load_avg[0]} / ${overview.system_health.load_avg[1]} / ${overview.system_health.load_avg[2]} load · ${overview.system_health.cpu_cores} cores`}
                tone={stats.cpuTone}
                icon="speed"
              />
              <StatCard
                title="Memory"
                value={`${overview.system_health.memory_used_percent}%`}
                detail={`${overview.system_health.memory_used_gb} / ${overview.system_health.memory_total_gb} GB`}
                tone={stats.memoryTone}
                icon="storage"
              />
              <StatCard
                title="Disk"
                value={overview.system_health.disk_used_percent !== null ? `${overview.system_health.disk_used_percent}%` : 'n/a'}
                detail={
                  overview.system_health.disk_total_gb !== null && overview.system_health.disk_free_gb !== null
                    ? `${overview.system_health.disk_free_gb} free / ${overview.system_health.disk_total_gb} GB`
                    : 'Disk telemetry unavailable'
                }
                tone={stats.diskTone}
                icon="save"
              />
              <StatCard
                title="Active Connections"
                value={String(stats.activeConnections)}
                detail={stats.activeDetail}
                tone="blue"
                icon="link"
              />
              <StatCard
                title="Rate Limit"
                value={stats.rateLimitValue}
                detail={stats.rateLimitDetail}
                tone={overview.sessions.rate_limit.available ? 'green' : 'yellow'}
                icon="timer"
              />
              <StatCard
                title="Node Runtime"
                value={overview.system_health.node_version}
                detail={`${overview.sessions.active_recent} sessions active in the last 15m`}
                tone="blue"
                icon="terminal"
              />
            </section>

            <section className="mt-4 rounded-xl border border-[#434653] bg-[#1F1F21] p-4">
              <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Tracked Runtime Processes</h2>
              {overview.system_health.processes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#434653] bg-[#1B1B1D] p-3 text-sm text-[#C3C6D5]">
                  <p>No tracked OpenClaw/mission-control processes detected.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {overview.system_health.processes.map((process) => (
                    <div key={process.pid} className="rounded-lg border border-[#434653] bg-[#1B1B1D] px-3 py-2 text-xs text-[#C3C6D5]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-[#E4E2E4]">PID {process.pid}</span>
                        <span>{process.elapsed}</span>
                      </div>
                      <div className="mt-1">CPU {process.cpu_percent.toFixed(1)}% · MEM {process.mem_percent.toFixed(1)}%</div>
                      <div className="mt-1 truncate">{process.command}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
  detail,
  tone,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  icon: string;
}) {
  const toneStyles: Record<Tone, string> = {
    green: 'border-[#4AE176]/45 text-[#4AE176]',
    red: 'border-[#FFB4AB]/45 text-[#FFB4AB]',
    blue: 'border-[#638EFD]/50 text-[#B3C5FF]',
    yellow: 'border-[#DDB7FF]/45 text-[#DDB7FF]',
    purple: 'border-[#DDB7FF]/45 text-[#DDB7FF]',
  };

  return (
    <article className={`rounded-xl border bg-[#1B1B1D] p-4 transition-colors duration-300 hover:bg-[#1F1F21] ${toneStyles[tone]}`}>
      <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.2em]">
        <span>{title}</span>
        <MaterialIcon name={icon} className="text-base" />
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-[#E4E2E4]">{value}</div>
      <p className="mt-2 truncate text-xs text-[#C3C6D5]">{detail}</p>
    </article>
  );
}
