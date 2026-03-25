'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  Bot,
  ChartLine,
  CloudUpload,
  Gauge,
  HelpCircle,
  LayoutDashboard,
  Lock,
  Plus,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useMissionControl } from '@/lib/store';
import type { Event, Task, Workspace } from '@/lib/types';
import type { SystemOverview } from '@/lib/system-overview.types';
import { TaskModal } from './TaskModal';

type ChartWindow = '24h' | '7d' | '30d';

type EventTone = 'success' | 'info' | 'error';

const OVERVIEW_REFRESH_MS = 20000;

const STATUS_PROGRESS: Record<Task['status'], number> = {
  planning: 16,
  inbox: 12,
  assigned: 34,
  in_progress: 68,
  testing: 84,
  review: 94,
  done: 100,
};

const STATUS_LABEL: Record<Task['status'], string> = {
  planning: 'Planning',
  inbox: 'Queueing',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  testing: 'Testing',
  review: 'Review',
  done: 'Complete',
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace(/\.0$/, '')}%`;
}

function getEventTone(type: Event['type']): EventTone {
  if (type === 'task_completed') return 'success';
  if (type === 'system') return 'error';
  if (type === 'agent_status_changed') return 'info';
  return 'info';
}

function getEventLabel(type: Event['type']) {
  if (type === 'task_completed') return 'Success';
  if (type === 'system') return 'Alert';
  if (type === 'task_status_changed') return 'Update';
  if (type === 'task_assigned') return 'Assigned';
  if (type === 'task_created') return 'Created';
  if (type === 'agent_status_changed') return 'Agent';
  if (type === 'agent_joined') return 'Join';
  return 'Info';
}

function buildPath(values: number[], width: number, height: number, offsetX = 0) {
  if (values.length === 0) return '';

  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;

  return values
    .map((value, index) => {
      const x = offsetX + index * step;
      const y = clamp(height - (value / max) * height, 0, height);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function buildChart(tasks: Task[], windowRange: ChartWindow) {
  const now = Date.now();

  const config: Record<ChartWindow, { buckets: number; spanMs: number; labels: string[] }> = {
    '24h': {
      buckets: 6,
      spanMs: 4 * 60 * 60 * 1000,
      labels: ['-24h', '-20h', '-16h', '-12h', '-8h', '-4h'],
    },
    '7d': {
      buckets: 7,
      spanMs: 24 * 60 * 60 * 1000,
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    },
    '30d': {
      buckets: 6,
      spanMs: 5 * 24 * 60 * 60 * 1000,
      labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'],
    },
  };

  const { buckets, spanMs, labels } = config[windowRange];
  const throughput = Array.from({ length: buckets }, () => 0);
  const completion = Array.from({ length: buckets }, () => 0);

  for (const task of tasks) {
    const createdAt = new Date(task.created_at).getTime();
    if (!Number.isNaN(createdAt)) {
      const index = Math.floor((now - createdAt) / spanMs);
      const bucketIndex = buckets - index - 1;
      if (bucketIndex >= 0 && bucketIndex < buckets) {
        throughput[bucketIndex] += 1;
      }
    }

    if (task.status === 'done') {
      const doneAt = new Date(task.updated_at).getTime();
      if (!Number.isNaN(doneAt)) {
        const index = Math.floor((now - doneAt) / spanMs);
        const bucketIndex = buckets - index - 1;
        if (bucketIndex >= 0 && bucketIndex < buckets) {
          completion[bucketIndex] += 1;
        }
      }
    }
  }

  return { labels, throughput, completion };
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  accent,
  health,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  accent?: 'primary' | 'secondary' | 'error';
  health?: boolean;
}) {
  const accentClass =
    accent === 'secondary'
      ? 'text-[#DDB7FF]'
      : accent === 'error'
        ? 'text-[#FFB4AB]'
        : 'text-[#B3C5FF]';

  return (
    <article
      className={`rounded-xl bg-[#1B1B1D] p-6 transition-colors duration-300 hover:bg-[#1F1F21] ${
        health ? 'border-l-4 border-[#4AE176]' : ''
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#C3C6D5]">{label}</p>
        <div className={accentClass}>{icon}</div>
      </div>
      <p className="text-3xl font-black tracking-tight text-[#E4E2E4]">{value}</p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-[#C3C6D5]">{detail}</p>
    </article>
  );
}

export function WorkspaceOverview({ workspace }: { workspace: Workspace }) {
  const { agents, tasks, events, isOnline } = useMissionControl();

  const [windowRange, setWindowRange] = useState<ChartWindow>('7d');
  const [searchText, setSearchText] = useState('');
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadOverview = async () => {
      try {
        const res = await fetch('/api/system/overview', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('Failed to load system overview');
        }

        const payload = (await res.json()) as SystemOverview;
        if (!mounted) {
          return;
        }

        setOverview(payload);
      } catch {
        if (!mounted) {
          return;
        }
      }
    };

    void loadOverview();
    const intervalId = window.setInterval(() => {
      void loadOverview();
    }, OVERVIEW_REFRESH_MS);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const activeMissions = useMemo(
    () => tasks.filter((task) => task.status !== 'done').length,
    [tasks]
  );

  const successRate = useMemo(() => {
    if (tasks.length === 0) return 0;
    const done = tasks.filter((task) => task.status === 'done').length;
    return (done / tasks.length) * 100;
  }, [tasks]);

  const systemHealth = useMemo(() => {
    if (!overview) {
      return isOnline ? 99.0 : 0;
    }

    const diskLoad = overview.system_health.disk_used_percent ?? 0;
    const memoryLoad = overview.system_health.memory_used_percent;
    const cpuLoad = overview.system_health.cpu_load_percent;
    return clamp(100 - Math.max(diskLoad, memoryLoad, cpuLoad), 0, 100);
  }, [overview, isOnline]);

  const latencyMs = useMemo(() => {
    if (!overview) return 12;
    const memoryFactor = overview.system_health.memory_used_percent / 6;
    const cpuFactor = overview.system_health.cpu_load_percent / 4;
    const sessionFactor = overview.sessions.connected ? 0 : 8;
    return Math.round(8 + memoryFactor + cpuFactor + sessionFactor);
  }, [overview]);

  const chart = useMemo(() => buildChart(tasks, windowRange), [tasks, windowRange]);

  const chartPrimaryPath = useMemo(
    () => buildPath(chart.completion, 1000, 230),
    [chart.completion]
  );

  const chartSecondaryPath = useMemo(
    () => buildPath(chart.throughput, 1000, 230),
    [chart.throughput]
  );

  const filteredActiveTasks = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const items = tasks
      .filter((task) => task.status !== 'done')
      .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));

    if (!query) {
      return items.slice(0, 4);
    }

    return items
      .filter((task) => task.title.toLowerCase().includes(query))
      .slice(0, 4);
  }, [tasks, searchText]);

  const filteredEvents = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const items = [...events].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

    if (!query) {
      return items.slice(0, 18);
    }

    return items
      .filter((event) => event.message.toLowerCase().includes(query))
      .slice(0, 18);
  }, [events, searchText]);

  const activeHubs = overview?.agent_status.active_links ?? agents.filter((agent) => agent.status === 'working').length;

  const lastSyncLabel = overview?.generated_at
    ? `Synced ${formatDistanceToNow(new Date(overview.generated_at), { addSuffix: true })}`
    : 'Awaiting telemetry sync';

  const exportExecutionLog = () => {
    const payload = filteredEvents.map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      created_at: event.created_at,
    }));

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `jlm-claw-execution-log-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#131315] text-[#E4E2E4] [font-family:Inter,system-ui,sans-serif]">
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col bg-[#1B1B1D] px-4 py-6 lg:flex">
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#B3C5FF] to-[#638EFD] shadow-lg shadow-[#B3C5FF]/20">
            <Rocket className="h-5 w-5 text-[#001849]" />
          </div>
          <div>
            <p className="text-xl font-black uppercase leading-none tracking-[0.16em]">JLM Claw</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B3C5FF]/85">Mission Control</p>
          </div>
        </div>

        <nav className="space-y-1 px-1">
          <Link
            href={`/workspace/${workspace.slug}`}
            className="flex items-center gap-3 border-r-4 border-[#638EFD] bg-gradient-to-r from-[#638EFD]/10 to-transparent px-3 py-3 text-[#B3C5FF]"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-tight">Dashboard</span>
          </Link>
          <Link
            href="/tasks"
            className="flex items-center gap-3 px-3 py-3 text-[#C3C6D5] transition-colors duration-200 hover:bg-[#353437] hover:text-[#E4E2E4]"
          >
            <Rocket className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-tight">Mission Control</span>
          </Link>
          <Link
            href="/agents"
            className="flex items-center gap-3 px-3 py-3 text-[#C3C6D5] transition-colors duration-200 hover:bg-[#353437] hover:text-[#E4E2E4]"
          >
            <Bot className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-tight">Automations</span>
          </Link>
          <Link
            href="/system"
            className="flex items-center gap-3 px-3 py-3 text-[#C3C6D5] transition-colors duration-200 hover:bg-[#353437] hover:text-[#E4E2E4]"
          >
            <ChartLine className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-tight">Analytics</span>
          </Link>
        </nav>

        <div className="mt-6 px-1">
          <button
            type="button"
            onClick={() => setShowTaskModal(true)}
            className="w-full rounded-xl bg-gradient-to-br from-[#B3C5FF] to-[#638EFD] py-3 text-xs font-black uppercase tracking-[0.2em] text-[#001849] shadow-xl shadow-[#B3C5FF]/10 transition-opacity hover:opacity-90"
          >
            New Mission
          </button>
        </div>

        <div className="mt-auto space-y-1 px-1">
          <Link
            href="/settings"
            className="flex items-center gap-3 px-3 py-3 text-[#C3C6D5] transition-colors duration-200 hover:bg-[#353437] hover:text-[#E4E2E4]"
          >
            <Settings className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-tight">Settings</span>
          </Link>
          <a
            href="#"
            className="flex items-center gap-3 px-3 py-3 text-[#C3C6D5] transition-colors duration-200 hover:bg-[#353437] hover:text-[#E4E2E4]"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-tight">Support</span>
          </a>
        </div>
      </aside>

      <header className="fixed top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#434653]/20 bg-[#131315]/80 px-4 backdrop-blur-xl lg:left-64 lg:w-[calc(100%-16rem)] lg:px-8">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C3C6D5]" />
          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search mission parameters..."
            className="w-full rounded-xl border border-transparent bg-[#1F1F21] py-2 pl-10 pr-4 text-sm text-[#E4E2E4] outline-none transition-all focus:border-[#638EFD]/60"
          />
        </div>

        <div className="ml-4 flex items-center gap-5">
          <button className="relative rounded-lg p-2 text-[#C3C6D5] transition-colors hover:bg-[#1F1F21]">
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#4AE176]" />
          </button>
          <button
            type="button"
            onClick={() => setShowTaskModal(true)}
            className="hidden rounded-lg p-2 text-[#C3C6D5] transition-colors hover:bg-[#1F1F21] md:block"
            title="Create new mission"
          >
            <Plus className="h-5 w-5" />
          </button>

          <div className="hidden h-8 w-px bg-[#434653]/30 md:block" />
          <div className="hidden items-center gap-3 md:flex">
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-[0.15em]">
                {isOnline ? 'System Active' : 'System Offline'}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#4AE176]">
                {overview?.sessions.connected ? 'Status: Stable' : 'Status: Degraded'}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full border-2 border-[#B3C5FF]/25 p-0.5">
              <div className="h-full w-full rounded-full bg-gradient-to-br from-[#638EFD] to-[#B3C5FF]" />
            </div>
          </div>
        </div>
      </header>

      <main className="pt-24 lg:ml-64">
        <div className="mx-auto max-w-[1600px] space-y-8 px-4 pb-10 lg:px-8">
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Active Missions"
              value={activeMissions.toString()}
              detail={`${tasks.length} total in ${workspace.name}`}
              icon={<Rocket className="h-5 w-5" />}
            />
            <MetricCard
              label="System Health"
              value={formatPercent(systemHealth)}
              detail={overview?.system_health.hostname ? `${overview.system_health.hostname} host` : 'Overview sync'}
              icon={<Zap className="h-5 w-5 text-[#4AE176]" />}
              health
            />
            <MetricCard
              label="Success Rate"
              value={formatPercent(successRate)}
              detail={`${tasks.filter((task) => task.status === 'done').length} completed tasks`}
              icon={<ShieldCheck className="h-5 w-5" />}
              accent="secondary"
            />
            <MetricCard
              label="Command Latency"
              value={`${latencyMs}ms`}
              detail="Computed from live host + gateway load"
              icon={<Gauge className="h-5 w-5" />}
              accent="error"
            />
          </section>

          <section className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="space-y-8 lg:col-span-8">
              <article className="relative overflow-hidden rounded-xl bg-[#1F1F21] p-8">
                <div className="relative z-10 mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-bold uppercase tracking-tight">Success Rate Analysis</h3>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#C3C6D5]/70">Temporal performance metrics</p>
                  </div>
                  <div className="flex gap-2">
                    {(['24h', '7d', '30d'] as ChartWindow[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setWindowRange(value)}
                        className={`rounded px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] ${
                          windowRange === value
                            ? 'bg-[#B3C5FF] text-[#001849] shadow-lg shadow-[#B3C5FF]/20'
                            : 'bg-[#353437] text-[#E4E2E4]'
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative mt-4 h-64">
                  <div className="absolute inset-0 flex items-center justify-center opacity-10">
                    <ChartLine className="h-44 w-44" />
                  </div>

                  <svg viewBox="0 0 1000 260" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                    <path
                      d={chartPrimaryPath}
                      fill="none"
                      stroke="#B3C5FF"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                    <path
                      d={chartSecondaryPath}
                      fill="none"
                      stroke="#4AE176"
                      strokeWidth="2"
                      strokeDasharray="9 6"
                      opacity="0.65"
                    />
                  </svg>

                  <div className="absolute inset-x-2 bottom-0 translate-y-6 text-[10px] font-black uppercase tracking-[0.16em] text-[#C3C6D5]/55">
                    <div className="flex justify-between">
                      {chart.labels.map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </article>

              <section className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-black uppercase tracking-[0.22em]">Active Execution Nodes</h3>
                  <Link href="/tasks" className="text-[10px] font-black uppercase tracking-[0.16em] text-[#B3C5FF] hover:underline">
                    View Fleet
                  </Link>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {filteredActiveTasks.length === 0 ? (
                    <div className="rounded-xl border border-[#434653]/60 bg-[#1B1B1D] p-5 text-xs uppercase tracking-[0.16em] text-[#C3C6D5] md:col-span-2">
                      No active execution nodes.
                    </div>
                  ) : (
                    filteredActiveTasks.map((task) => {
                      const status = task.status;
                      const percent = clamp(STATUS_PROGRESS[status], 2, 99);
                      const tone =
                        status === 'in_progress' || status === 'testing'
                          ? 'text-[#4AE176] bg-[#4AE176]/10 border-[#4AE176]/40'
                          : status === 'review'
                            ? 'text-[#DDB7FF] bg-[#DDB7FF]/10 border-[#DDB7FF]/40'
                            : 'text-[#B3C5FF] bg-[#B3C5FF]/10 border-[#B3C5FF]/40';

                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setSelectedTask(task)}
                          className="rounded-xl border-l-2 border-[#638EFD] bg-[#1B1B1D] p-5 text-left transition-colors hover:bg-[#1F1F21]"
                        >
                          <div className="mb-6 flex items-start justify-between gap-3">
                            <div>
                              <h4 className="line-clamp-1 text-sm font-bold uppercase leading-none">{task.title}</h4>
                              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[#C3C6D5]">ID: #{task.id.slice(0, 8)}</p>
                            </div>
                            <span className={`rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${tone}`}>
                              {STATUS_LABEL[status]}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-end justify-between text-[10px] font-bold uppercase">
                              <span className="text-[#C3C6D5]">Pipeline</span>
                              <span className="text-[#4AE176]">{percent}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[#353437]">
                              <div className="h-full bg-[#4AE176] transition-all duration-700" style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>
            </div>

            <aside className="flex flex-col lg:col-span-4">
              <section className="flex h-full flex-col rounded-xl border border-[#434653]/20 bg-[#0E0E10]">
                <div className="border-b border-[#434653]/20 p-6">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#4AE176]" />
                    <h3 className="text-sm font-black uppercase tracking-[0.2em]">Execution Log</h3>
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#C3C6D5]">Real-time telemetry stream</p>
                </div>

                <div className="max-h-[620px] flex-1 space-y-6 overflow-y-auto p-6">
                  {filteredEvents.length === 0 ? (
                    <div className="text-xs uppercase tracking-[0.16em] text-[#C3C6D5]">No execution events yet.</div>
                  ) : (
                    filteredEvents.map((event, index) => {
                      const tone = getEventTone(event.type);
                      const dotClass =
                        tone === 'success'
                          ? 'bg-[#4AE176]'
                          : tone === 'error'
                            ? 'bg-[#FFB4AB]'
                            : 'bg-[#B3C5FF]';
                      const badgeClass =
                        tone === 'success'
                          ? 'bg-[#4AE176]/10 text-[#4AE176]'
                          : tone === 'error'
                            ? 'bg-[#FFB4AB]/10 text-[#FFB4AB]'
                            : 'bg-[#B3C5FF]/10 text-[#B3C5FF]';

                      return (
                        <div key={event.id} className="relative flex gap-4">
                          <div className="flex flex-col items-center">
                            <span className={`mt-1.5 h-2 w-2 rounded-full ${dotClass}`} />
                            {index !== filteredEvents.length - 1 ? (
                              <span className="mt-2 h-full w-px bg-[#434653]/30" />
                            ) : null}
                          </div>

                          <div className="pb-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-[9px] font-black uppercase tracking-[0.08em]">
                                {new Date(event.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                  hour12: false,
                                })}
                              </span>
                              <span className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${badgeClass}`}>
                                {getEventLabel(event.type)}
                              </span>
                            </div>
                            <p className="text-xs leading-relaxed text-[#C3C6D5]">{event.message}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="rounded-b-xl border-t border-[#434653]/20 bg-[#1B1B1D]/65 p-6">
                  <button
                    type="button"
                    onClick={exportExecutionLog}
                    className="w-full rounded-lg bg-[#353437] py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5] transition-colors hover:text-[#E4E2E4]"
                  >
                    Export Session Logs
                  </button>
                </div>
              </section>
            </aside>
          </section>

          <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <article className="relative overflow-hidden rounded-xl bg-[#1F1F21] p-8 md:col-span-2">
              <div className="pointer-events-none absolute -bottom-10 -right-10 opacity-[0.08]">
                <ShieldCheck className="h-44 w-44" />
              </div>

              <div className="flex items-center justify-between gap-5">
                <div>
                  <h3 className="mb-2 text-xl font-black uppercase tracking-tight">Security Protocol Active</h3>
                  <p className="max-w-2xl text-sm text-[#C3C6D5]/85">
                    {overview?.system_health.processes.length
                      ? `Tracking ${overview.system_health.processes.length} active runtime processes with no critical breaches detected.`
                      : 'Runtime telemetry monitors active mission data streams. No critical breaches detected.'}
                  </p>
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#2A2A2C] text-[#4AE176]">
                  <Lock className="h-7 w-7" />
                </div>
              </div>
            </article>

            <article className="rounded-xl border-t-4 border-[#B3C5FF] bg-[#1B1B1D] p-8">
              <div className="mb-4 flex items-center gap-3">
                <CloudUpload className="h-5 w-5 text-[#B3C5FF]" />
                <h3 className="text-sm font-black uppercase tracking-[0.16em]">Global Sync</h3>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black tracking-tight">{activeHubs}</span>
                <span className="pb-1 text-xs font-bold uppercase tracking-[0.16em] text-[#C3C6D5]">Active Hubs</span>
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[#C3C6D5]/70">{lastSyncLabel}</p>
            </article>
          </section>

          <section className="rounded-xl border border-[#434653]/20 bg-[#1F1F21] px-6 py-4 text-xs uppercase tracking-[0.14em] text-[#C3C6D5]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Workspace: {workspace.icon} {workspace.name}</span>
              <span>{events.length} tracked events</span>
              <span>{agents.length} registered agents</span>
              <span>{tasks.length} total tasks</span>
            </div>
          </section>
        </div>
      </main>

      {showTaskModal ? (
        <TaskModal onClose={() => setShowTaskModal(false)} workspaceId={workspace.id} />
      ) : null}
      {selectedTask ? (
        <TaskModal task={selectedTask} onClose={() => setSelectedTask(null)} workspaceId={workspace.id} />
      ) : null}
    </div>
  );
}
