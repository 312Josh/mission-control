'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MissionSection } from '@/lib/mission-sections';
import type { SystemOverview } from '@/lib/system-overview.types';

interface MissionSectionLivePageProps {
  section: MissionSection;
}

interface AgentStatusItem {
  id: string;
  name: string;
  emoji: string;
  session_status: string | null;
  session_key: string | null;
  last_activity: string | null;
}

interface AgentsStatusPayload {
  connected: boolean;
  error: string | null;
  agents: AgentStatusItem[];
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  workspace_id: string;
  updated_at: string;
}

interface EventItem {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

type FeedItem = {
  id: string;
  title: string;
  status: string;
  updatedAt: string | null;
  source: 'task' | 'event';
};

const REFRESH_MS = 15000;

function MaterialIcon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined leading-none ${className}`}
      style={{
        fontVariationSettings: `'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 20`,
      }}
    >
      {name}
    </span>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'No timestamp';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No timestamp';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function toEpoch(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusBadge(status: string): string {
  const lowered = status.toLowerCase();
  if (lowered.includes('done') || lowered.includes('active') || lowered.includes('working')) {
    return 'border-[#4AE176]/45 bg-[#1D3A2A] text-[#4AE176]';
  }
  if (lowered.includes('review') || lowered.includes('testing') || lowered.includes('planning')) {
    return 'border-[#DDB7FF]/45 bg-[#6F00BE]/20 text-[#DDB7FF]';
  }
  if (lowered.includes('error') || lowered.includes('offline') || lowered.includes('failed')) {
    return 'border-[#FFB4AB]/45 bg-[#93000A]/30 text-[#FFB4AB]';
  }
  return 'border-[#638EFD]/50 bg-[#638EFD]/16 text-[#B3C5FF]';
}

function getSectionKeywords(slug: string): string[] {
  const map: Record<string, string[]> = {
    content: ['content', 'social', 'post', 'video', 'newsletter', 'campaign'],
    approvals: ['review', 'approve', 'approval', 'sign-off', 'legal'],
    council: ['strategy', 'decision', 'roadmap', 'meeting', 'priority'],
    projects: ['project', 'milestone', 'deliverable', 'epic'],
    memory: ['memory', 'context', 'knowledge', 'notes', 'retrospective'],
    docs: ['docs', 'documentation', 'readme', 'spec', 'guide'],
    people: ['people', 'hiring', 'onboard', 'team', 'org'],
    office: ['office', 'ops', 'logistics', 'facilities', 'calendar'],
    team: ['team', 'capacity', 'staffing', 'handoff', 'ownership'],
    radar: ['alert', 'risk', 'incident', 'watch', 'signal'],
    factory: ['build', 'release', 'deploy', 'ci', 'pipeline'],
    'ai-lab': ['model', 'prompt', 'eval', 'agent', 'experiment'],
    feedback: ['feedback', 'customer', 'issue', 'request', 'nps'],
  };

  return map[slug] ?? [slug.replace('-', ' ')];
}

function includesAny(haystack: string, keywords: string[]): boolean {
  const normalized = haystack.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

export function MissionSectionLivePage({ section }: MissionSectionLivePageProps) {
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [agentsPayload, setAgentsPayload] = useState<AgentsStatusPayload | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const [overviewRes, agentsRes, tasksRes, eventsRes] = await Promise.allSettled([
        fetch('/api/system/overview', { cache: 'no-store' }),
        fetch('/api/agents/status', { cache: 'no-store' }),
        fetch('/api/tasks', { cache: 'no-store' }),
        fetch('/api/events?limit=100', { cache: 'no-store' }),
      ]);

      if (!mounted) {
        return;
      }

      const failures: string[] = [];

      if (overviewRes.status === 'fulfilled' && overviewRes.value.ok) {
        setOverview((await overviewRes.value.json()) as SystemOverview);
      } else {
        failures.push('system overview');
      }

      if (agentsRes.status === 'fulfilled' && agentsRes.value.ok) {
        setAgentsPayload((await agentsRes.value.json()) as AgentsStatusPayload);
      } else {
        failures.push('agent status');
      }

      if (tasksRes.status === 'fulfilled' && tasksRes.value.ok) {
        setTasks((await tasksRes.value.json()) as TaskItem[]);
      } else {
        failures.push('tasks');
      }

      if (eventsRes.status === 'fulfilled' && eventsRes.value.ok) {
        setEvents((await eventsRes.value.json()) as EventItem[]);
      } else {
        failures.push('events');
      }

      setError(failures.length > 0 ? `Some data sources failed: ${failures.join(', ')}` : null);
      setLoading(false);
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, REFRESH_MS);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const keywords = useMemo(() => getSectionKeywords(section.slug), [section.slug]);

  const sectionTasks = useMemo(
    () =>
      tasks
        .filter((task) => includesAny(`${task.title} ${task.status} ${task.priority}`, keywords))
        .sort((a, b) => toEpoch(b.updated_at) - toEpoch(a.updated_at))
        .slice(0, 12),
    [keywords, tasks]
  );

  const sectionEvents = useMemo(
    () =>
      events
        .filter((event) => includesAny(`${event.type} ${event.message}`, keywords))
        .sort((a, b) => toEpoch(b.created_at) - toEpoch(a.created_at))
        .slice(0, 12),
    [events, keywords]
  );

  const activeAgents = useMemo(
    () => (agentsPayload?.agents ?? []).filter((agent) => (agent.session_status ?? '').toLowerCase() === 'active').length,
    [agentsPayload]
  );

  const mixedFeed = useMemo(() => {
    const fromTasks: FeedItem[] = sectionTasks.map((task) => ({
      id: `task:${task.id}`,
      title: task.title,
      status: task.status || 'unknown',
      updatedAt: task.updated_at,
      source: 'task',
    }));

    const fromEvents: FeedItem[] = sectionEvents.map((event) => ({
      id: `event:${event.id}`,
      title: event.message,
      status: event.type || 'event',
      updatedAt: event.created_at,
      source: 'event',
    }));

    return [...fromTasks, ...fromEvents]
      .sort((a, b) => toEpoch(b.updatedAt) - toEpoch(a.updatedAt))
      .slice(0, 14);
  }, [sectionEvents, sectionTasks]);

  return (
    <section className="mx-auto w-full max-w-6xl font-['Inter',sans-serif]">
      <header className="rounded-xl border border-[#434653] bg-[#1F1F21] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Mission Surface</p>
            <h1 className="mt-2 text-2xl font-black uppercase tracking-tight text-[#E4E2E4]">{section.title}</h1>
            <p className="mt-2 max-w-3xl text-sm text-[#C3C6D5]">{section.description}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#638EFD]/45 bg-[#638EFD]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#B3C5FF]">
            <MaterialIcon name="monitoring" className="text-sm" />
            Live Data
          </span>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-[#FFB4AB]/60 bg-[#93000A]/30 p-3 text-sm text-[#FFB4AB]">{error}</div>
        ) : null}
      </header>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Matched Tasks" value={String(sectionTasks.length)} detail="Filtered by section keywords" tone="blue" />
        <StatCard title="Matched Events" value={String(sectionEvents.length)} detail="Recent activity stream matches" tone="purple" />
        <StatCard
          title="Gateway Sessions"
          value={String(overview?.sessions.total ?? 0)}
          detail={overview?.sessions.connected ? 'Connected to OpenClaw gateway' : 'Gateway currently offline'}
          tone={overview?.sessions.connected ? 'green' : 'red'}
        />
        <StatCard title="Active Agents" value={String(activeAgents)} detail="From /api/agents/status" tone="green" />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-[#434653] bg-[#1F1F21] p-4">
          <h2 className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Recent Section Feed</h2>
          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="rounded-lg border border-dashed border-[#434653] bg-[#1B1B1D] p-3 text-sm text-[#C3C6D5]">Loading section feed...</div>
            ) : null}

            {!loading && mixedFeed.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#434653] bg-[#1B1B1D] p-3 text-sm text-[#C3C6D5]">
                No matching records yet for this section.
              </div>
            ) : null}

            {mixedFeed.map((item) => (
              <div key={item.id} className="rounded-lg border border-[#434653] bg-[#1B1B1D] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-[#E4E2E4]">{item.title}</span>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${statusBadge(item.status)}`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#C3C6D5]">
                  {item.source === 'task' ? 'Task' : 'Event'} · {formatDate(item.updatedAt)}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-[#434653] bg-[#1F1F21] p-4">
          <h2 className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Agent Pulse</h2>
          <div className="mt-3 space-y-2">
            {(agentsPayload?.agents ?? []).slice(0, 10).map((agent) => {
              const status = agent.session_status || 'standby';
              return (
                <div key={agent.id} className="rounded-lg border border-[#434653] bg-[#1B1B1D] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-[#E4E2E4]">
                      {agent.emoji} {agent.name}
                    </p>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${statusBadge(status)}`}>
                      {status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-[#C3C6D5]">{agent.session_key || 'No active session key'}</p>
                  <p className="mt-1 text-xs text-[#C3C6D5]">Last activity: {formatDate(agent.last_activity)}</p>
                </div>
              );
            })}
            {!loading && (agentsPayload?.agents.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed border-[#434653] bg-[#1B1B1D] p-3 text-sm text-[#C3C6D5]">No agents were returned.</div>
            ) : null}
          </div>
        </article>
      </section>
    </section>
  );
}

function StatCard({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: 'green' | 'red' | 'blue' | 'purple';
}) {
  const toneClass: Record<typeof tone, string> = {
    green: 'border-[#4AE176]/45 text-[#4AE176]',
    red: 'border-[#FFB4AB]/45 text-[#FFB4AB]',
    blue: 'border-[#638EFD]/50 text-[#B3C5FF]',
    purple: 'border-[#DDB7FF]/45 text-[#DDB7FF]',
  };

  return (
    <article className="rounded-xl border border-[#434653] bg-[#1B1B1D] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">{title}</p>
      <p className={`mt-2 text-2xl font-black tracking-tight ${toneClass[tone]}`}>{value}</p>
      <p className="mt-1 text-xs text-[#C3C6D5]">{detail}</p>
    </article>
  );
}
