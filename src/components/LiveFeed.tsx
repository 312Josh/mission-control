'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, Clock, AlertCircle } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Event } from '@/lib/types';
import type { SystemOverview } from '@/lib/system-overview.types';
import { formatDistanceToNow } from 'date-fns';

type FeedFilter = 'all' | 'tasks' | 'agents';
type SidebarTab = 'live' | 'sessions' | 'scheduled' | 'system';

const OPERATIONS_REFRESH_MS = 20000;

export function LiveFeed() {
  const { events } = useMissionControl();
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [tab, setTab] = useState<SidebarTab>('live');
  const [isMinimized, setIsMinimized] = useState(false);
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      setIsMinimized(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadOverview = async () => {
      try {
        const res = await fetch('/api/system/overview', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`System endpoint returned ${res.status}`);
        }
        const payload = (await res.json()) as SystemOverview;
        if (!mounted) {
          return;
        }
        setOverview(payload);
        setOverviewError(null);
      } catch (error) {
        if (!mounted) {
          return;
        }
        setOverviewError(error instanceof Error ? error.message : 'Failed to load system overview');
      } finally {
        if (mounted) {
          setOverviewLoading(false);
        }
      }
    };

    void loadOverview();
    const interval = window.setInterval(() => {
      void loadOverview();
    }, OPERATIONS_REFRESH_MS);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (feedFilter === 'all') return true;
      if (feedFilter === 'tasks') {
        return ['task_created', 'task_assigned', 'task_status_changed', 'task_completed'].includes(
          event.type
        );
      }
      if (feedFilter === 'agents') {
        return ['agent_joined', 'agent_status_changed', 'message_sent'].includes(event.type);
      }
      return true;
    });
  }, [events, feedFilter]);

  const toggleMinimize = () => setIsMinimized((prev) => !prev);

  return (
    <aside
      className={`bg-mc-bg-secondary border-l border-mc-border flex flex-col transition-all duration-300 ease-in-out ${
        isMinimized ? 'w-12' : 'w-72 xl:w-80'
      }`}
    >
      <div className="p-3 border-b border-mc-border">
        <div className="flex items-center">
          <button
            onClick={toggleMinimize}
            className="p-1 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary hover:text-mc-text transition-colors"
            aria-label={isMinimized ? 'Expand feed' : 'Minimize feed'}
          >
            {isMinimized ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {!isMinimized && (
            <span className="text-sm font-medium uppercase tracking-wider">
              {tab === 'live' ? 'Live Feed' : 'Operations'}
            </span>
          )}
        </div>

        {!isMinimized && (
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
            {([
              ['live', 'Live'],
              ['sessions', 'Sessions'],
              ['scheduled', 'Scheduled'],
              ['system', 'System'],
            ] as [SidebarTab, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`px-2.5 py-1 text-[10px] rounded uppercase whitespace-nowrap ${
                  tab === value
                    ? 'bg-mc-accent text-mc-bg font-medium'
                    : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!isMinimized && tab === 'live' && (
        <>
          <div className="px-3 pt-2">
            <div className="flex gap-1">
              {(['all', 'tasks', 'agents'] as FeedFilter[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setFeedFilter(value)}
                  className={`px-3 py-1 text-xs rounded uppercase ${
                    feedFilter === value
                      ? 'bg-mc-accent text-mc-bg font-medium'
                      : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredEvents.length === 0 ? (
              <EmptyState message="No events yet" />
            ) : (
              filteredEvents.map((event) => <EventItem key={event.id} event={event} />)
            )}
          </div>
        </>
      )}

      {!isMinimized && tab !== 'live' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {overviewError && (
            <div className="p-3 rounded border border-mc-accent-red/50 bg-mc-accent-red/10 text-xs text-mc-accent-red">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{overviewError}</span>
              </div>
            </div>
          )}
          {overviewLoading && !overview ? (
            <EmptyState message="Loading operational data..." />
          ) : null}
          {overview && tab === 'sessions' ? <SessionsPanel overview={overview} /> : null}
          {overview && tab === 'scheduled' ? <ScheduledPanel overview={overview} /> : null}
          {overview && tab === 'system' ? <SystemPanel overview={overview} /> : null}
        </div>
      )}
    </aside>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-8 text-mc-text-secondary text-sm">
      {message}
    </div>
  );
}

function SessionsPanel({ overview }: { overview: SystemOverview }) {
  const sessions = overview.sessions;
  const lastUpdated = overview.generated_at
    ? formatDistanceToNow(new Date(overview.generated_at), { addSuffix: true })
    : 'unknown';

  return (
    <>
      <MetricCard
        title="Gateway"
        value={sessions.connected ? 'Connected' : 'Disconnected'}
        detail={sessions.gateway_url}
        tone={sessions.connected ? 'green' : 'red'}
      />
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          title="Sessions"
          value={String(sessions.total)}
          detail={`${sessions.active_recent} active in 15m`}
          tone="blue"
        />
        <MetricCard
          title="Agents"
          value={String(overview.agent_status.total)}
          detail={`${overview.agent_status.working} working`}
          tone="purple"
        />
      </div>
      {sessions.error ? (
        <ErrorCard text={sessions.error} />
      ) : null}
      <div className="text-[10px] text-mc-text-secondary px-1 uppercase tracking-wider">
        Last refresh {lastUpdated}
      </div>
      <div className="space-y-1">
        {sessions.entries.length === 0 ? (
          <EmptyState message="No live OpenClaw sessions." />
        ) : (
          sessions.entries.slice(0, 20).map((session) => (
            <div key={session.key} className="p-2 rounded border border-mc-border bg-mc-bg">
              <div className="text-[11px] text-mc-text truncate">{session.key}</div>
              <div className="mt-1 text-[10px] text-mc-text-secondary flex items-center justify-between gap-2">
                <span className="truncate">{session.model || 'unknown model'}</span>
                <span>{session.context_percent}%</span>
              </div>
              <div className="mt-1 text-[10px] text-mc-text-secondary">
                {session.updated_at
                  ? formatDistanceToNow(new Date(session.updated_at), { addSuffix: true })
                  : 'No activity timestamp'}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function ScheduledPanel({ overview }: { overview: SystemOverview }) {
  const scheduled = overview.scheduled;
  const cronCount = scheduled.entries.filter((entry) => entry.source === 'crontab').length;
  const launchdCount = scheduled.entries.filter((entry) => entry.source === 'launchd').length;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          title="Scheduled"
          value={String(scheduled.total)}
          detail={`${cronCount} cron · ${launchdCount} launchd`}
          tone="blue"
        />
        <MetricCard
          title="Agent Links"
          value={String(overview.agent_status.active_links)}
          detail="Active session links"
          tone="green"
        />
      </div>
      {!scheduled.cron_available && scheduled.cron_error ? (
        <ErrorCard text={`crontab unavailable: ${scheduled.cron_error}`} />
      ) : null}
      {scheduled.launchd_error ? (
        <ErrorCard text={`launchd parse warnings: ${scheduled.launchd_error}`} />
      ) : null}
      <div className="space-y-1">
        {scheduled.entries.length === 0 ? (
          <EmptyState message="No scheduled entries detected." />
        ) : (
          scheduled.entries.slice(0, 30).map((entry, index) => (
            <div key={`${entry.source}-${entry.label}-${index}`} className="p-2 rounded border border-mc-border bg-mc-bg">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-mc-text truncate">{entry.label}</span>
                <span className="text-[9px] uppercase text-mc-text-secondary">{entry.source}</span>
              </div>
              <div className="mt-1 text-[10px] text-mc-text-secondary truncate">{entry.schedule}</div>
              <div className="mt-1 text-[10px] text-mc-text-secondary truncate">{entry.command}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function SystemPanel({ overview }: { overview: SystemOverview }) {
  const health = overview.system_health;
  const uptime = formatDistanceToNow(new Date(Date.now() - (health.uptime_seconds * 1000)), {
    addSuffix: false,
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          title="Memory"
          value={`${health.memory_used_percent}%`}
          detail={`${health.memory_used_gb} / ${health.memory_total_gb} GB`}
          tone={health.memory_used_percent >= 85 ? 'red' : health.memory_used_percent >= 70 ? 'yellow' : 'green'}
        />
        <MetricCard
          title="Disk"
          value={health.disk_used_percent !== null ? `${health.disk_used_percent}%` : 'n/a'}
          detail={
            health.disk_total_gb !== null && health.disk_free_gb !== null
              ? `${health.disk_free_gb} free / ${health.disk_total_gb} GB`
              : 'Unavailable'
          }
          tone={health.disk_used_percent !== null && health.disk_used_percent >= 85 ? 'red' : 'blue'}
        />
      </div>
      <MetricCard
        title="Host"
        value={health.hostname}
        detail={`${health.platform} ${health.release} · up ${uptime}`}
        tone="purple"
      />
      <MetricCard
        title="Load Avg"
        value={`${health.load_avg[0]} / ${health.load_avg[1]} / ${health.load_avg[2]}`}
        detail={`Node ${health.node_version}`}
        tone="blue"
      />
      <div className="space-y-1">
        {health.processes.length === 0 ? (
          <EmptyState message="No tracked OpenClaw/mission processes detected." />
        ) : (
          health.processes.map((process) => (
            <div key={process.pid} className="p-2 rounded border border-mc-border bg-mc-bg">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-mc-text truncate">PID {process.pid}</span>
                <span className="text-mc-text-secondary">{process.elapsed}</span>
              </div>
              <div className="mt-1 text-[10px] text-mc-text-secondary">
                CPU {process.cpu_percent.toFixed(1)}% · MEM {process.mem_percent.toFixed(1)}%
              </div>
              <div className="mt-1 text-[10px] text-mc-text-secondary truncate">{process.command}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function MetricCard({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: 'green' | 'red' | 'blue' | 'yellow' | 'purple';
}) {
  const toneStyles = {
    green: 'border-green-500/30 text-green-400',
    red: 'border-mc-accent-red/40 text-mc-accent-red',
    blue: 'border-mc-accent/30 text-mc-accent',
    yellow: 'border-mc-accent-yellow/30 text-mc-accent-yellow',
    purple: 'border-mc-accent-purple/30 text-mc-accent-purple',
  };

  return (
    <div className={`p-2 rounded border bg-mc-bg ${toneStyles[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider">{title}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
      <div className="mt-1 text-[10px] text-mc-text-secondary truncate">{detail}</div>
    </div>
  );
}

function ErrorCard({ text }: { text: string }) {
  return (
    <div className="p-2 rounded border border-mc-accent-red/40 bg-mc-accent-red/10 text-[11px] text-mc-accent-red">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>{text}</span>
      </div>
    </div>
  );
}

function EventItem({ event }: { event: Event }) {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'task_created':
        return '📋';
      case 'task_assigned':
        return '👤';
      case 'task_status_changed':
        return '🔄';
      case 'task_completed':
        return '✅';
      case 'message_sent':
        return '💬';
      case 'agent_joined':
        return '🎉';
      case 'agent_status_changed':
        return '🔔';
      case 'system':
        return '⚙️';
      default:
        return '📌';
    }
  };

  const isTaskEvent = ['task_created', 'task_assigned', 'task_completed'].includes(event.type);
  const isHighlight = event.type === 'task_created' || event.type === 'task_completed';

  return (
    <div
      className={`p-2 rounded border-l-2 animate-slide-in ${
        isHighlight
          ? 'bg-mc-bg-tertiary border-mc-accent-pink'
          : 'bg-transparent border-transparent hover:bg-mc-bg-tertiary'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm">{getEventIcon(event.type)}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${isTaskEvent ? 'text-mc-accent-pink' : 'text-mc-text'}`}>
            {event.message}
          </p>
          <div className="flex items-center gap-1 mt-1 text-xs text-mc-text-secondary">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
          </div>
        </div>
      </div>
    </div>
  );
}
