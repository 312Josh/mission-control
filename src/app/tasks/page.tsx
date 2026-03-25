import Link from 'next/link';
import { queryAll } from '@/lib/db';

export const dynamic = 'force-dynamic';

const NO_DATA = 'No data';

const STATUS_ORDER = [
  'pending_dispatch',
  'planning',
  'inbox',
  'assigned',
  'in_progress',
  'testing',
  'review',
  'done',
] as const;

type Priority = 'low' | 'normal' | 'high' | 'urgent';

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  workspace_name: string | null;
  assigned_agent_name: string | null;
  assigned_agent_emoji: string | null;
  created_by_agent_name: string | null;
  created_by_agent_emoji: string | null;
  created_at: string | null;
  updated_at: string | null;
  due_date: string | null;
}

const STATUS_META: Record<string, { label: string; badge: string; border: string; icon: string }> = {
  pending_dispatch: {
    label: 'Pending Dispatch',
    badge: 'bg-[#638EFD]/18 text-[#B3C5FF] border-[#638EFD]/50',
    border: 'border-[#638EFD]/50',
    icon: 'send',
  },
  planning: {
    label: 'Planning',
    badge: 'bg-[#6F00BE]/20 text-[#DDB7FF] border-[#DDB7FF]/45',
    border: 'border-[#DDB7FF]/45',
    icon: 'strategy',
  },
  inbox: {
    label: 'Inbox',
    badge: 'bg-[#353437] text-[#E4E2E4] border-[#434653]',
    border: 'border-[#434653]',
    icon: 'inbox',
  },
  assigned: {
    label: 'Assigned',
    badge: 'bg-[#B3C5FF]/16 text-[#B3C5FF] border-[#B3C5FF]/40',
    border: 'border-[#B3C5FF]/40',
    icon: 'assignment_ind',
  },
  in_progress: {
    label: 'In Progress',
    badge: 'bg-[#638EFD]/18 text-[#B3C5FF] border-[#638EFD]/50',
    border: 'border-[#638EFD]/50',
    icon: 'pending',
  },
  testing: {
    label: 'Testing',
    badge: 'bg-[#1D3A2A] text-[#4AE176] border-[#4AE176]/45',
    border: 'border-[#4AE176]/45',
    icon: 'science',
  },
  review: {
    label: 'Review',
    badge: 'bg-[#6F00BE]/20 text-[#DDB7FF] border-[#DDB7FF]/45',
    border: 'border-[#DDB7FF]/45',
    icon: 'rate_review',
  },
  done: {
    label: 'Done',
    badge: 'bg-[#1D3A2A] text-[#4AE176] border-[#4AE176]/45',
    border: 'border-[#4AE176]/45',
    icon: 'task_alt',
  },
};

const PRIORITY_META: Record<Priority, string> = {
  low: 'text-[#C3C6D5]',
  normal: 'text-[#B3C5FF]',
  high: 'text-[#DDB7FF]',
  urgent: 'text-[#FFB4AB]',
};

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

function formatStatus(value: string | null | undefined): string {
  if (!value) {
    return NO_DATA;
  }

  const known = STATUS_META[value];
  if (known) {
    return known.label;
  }

  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return NO_DATA;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return NO_DATA;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatPriority(value: string): string {
  if (!value) {
    return NO_DATA;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isPriority(value: string): value is Priority {
  return value === 'low' || value === 'normal' || value === 'high' || value === 'urgent';
}

function statusClasses(status: string) {
  const meta = STATUS_META[status];
  return meta ? meta.badge : 'bg-[#2A2A2C] text-[#C3C6D5] border-[#434653]';
}

export default function TasksPage() {
  const tasks = queryAll<TaskRow>(`
    SELECT
      t.id,
      t.title,
      t.status,
      t.priority,
      t.created_at,
      t.updated_at,
      t.due_date,
      w.name AS workspace_name,
      aa.name AS assigned_agent_name,
      aa.avatar_emoji AS assigned_agent_emoji,
      ca.name AS created_by_agent_name,
      ca.avatar_emoji AS created_by_agent_emoji
    FROM tasks t
    LEFT JOIN workspaces w ON w.id = t.workspace_id
    LEFT JOIN agents aa ON aa.id = t.assigned_agent_id
    LEFT JOIN agents ca ON ca.id = t.created_by_agent_id
    ORDER BY
      CASE t.status
        WHEN 'pending_dispatch' THEN 0
        WHEN 'planning' THEN 1
        WHEN 'inbox' THEN 2
        WHEN 'assigned' THEN 3
        WHEN 'in_progress' THEN 4
        WHEN 'testing' THEN 5
        WHEN 'review' THEN 6
        WHEN 'done' THEN 7
        ELSE 8
      END,
      datetime(t.updated_at) DESC,
      datetime(t.created_at) DESC
  `);

  const grouped: Record<string, TaskRow[]> = {};
  for (const status of STATUS_ORDER) {
    grouped[status] = [];
  }

  for (const task of tasks) {
    if (!grouped[task.status]) {
      grouped[task.status] = [];
    }
    grouped[task.status].push(task);
  }

  const assignedCount = tasks.filter((task) => task.assigned_agent_name).length;

  return (
    <main className="min-h-screen bg-[#131315] font-['Inter',sans-serif] text-[#E4E2E4]">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 overflow-hidden rounded-xl border border-[#434653] bg-[#1F1F21] p-5 shadow-[0_12px_30px_rgba(0,0,0,0.26)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Mission Queue</p>
              <h1 className="mt-1 text-2xl font-black uppercase tracking-tight">Task Operations</h1>
              <p className="mt-2 text-sm text-[#C3C6D5]">
                Live queue from the local database with assignment, ownership, and status timestamps.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-lg border border-[#434653] bg-[#2A2A2C] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#C3C6D5] transition-colors hover:border-[#638EFD]/60 hover:text-[#E4E2E4]"
            >
              <MaterialIcon name="arrow_back" className="text-sm" />
              Dashboard
            </Link>
          </div>
        </div>

        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-[#434653] bg-[#1B1B1D] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Total Tasks</p>
            <p className="mt-2 text-2xl font-black tracking-tight text-[#E4E2E4]">{tasks.length}</p>
          </article>
          <article className="rounded-xl border border-[#434653] bg-[#1B1B1D] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Assigned</p>
            <p className="mt-2 text-2xl font-black tracking-tight text-[#B3C5FF]">{assignedCount}</p>
          </article>
          <article className="rounded-xl border border-[#434653] bg-[#1B1B1D] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Unassigned</p>
            <p className="mt-2 text-2xl font-black tracking-tight text-[#DDB7FF]">{tasks.length - assignedCount}</p>
          </article>
        </section>

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Queue by Status</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STATUS_ORDER.map((status) => {
              const queue = grouped[status] ?? [];
              const meta = STATUS_META[status];

              return (
                <article key={status} className={`rounded-xl border bg-[#1B1B1D] ${meta.border}`}>
                  <div className="flex items-center justify-between border-b border-[#434653]/70 px-3 py-2">
                    <h3 className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#C3C6D5]">
                      <MaterialIcon name={meta.icon} className="text-sm text-[#B3C5FF]" />
                      {meta.label}
                    </h3>
                    <span className="rounded border border-[#434653] bg-[#2A2A2C] px-2 py-0.5 text-xs text-[#E4E2E4]">
                      {queue.length}
                    </span>
                  </div>

                  <div className="space-y-2 p-3">
                    {queue.length === 0 && (
                      <p className="rounded-lg border border-dashed border-[#434653] bg-[#2A2A2C]/50 px-2 py-3 text-xs text-[#C3C6D5]">
                        {NO_DATA}
                      </p>
                    )}

                    {queue.slice(0, 5).map((task) => (
                      <div key={task.id} className="rounded-lg border border-[#434653] bg-[#2A2A2C]/55 px-2.5 py-2">
                        <p className="truncate text-sm font-semibold text-[#E4E2E4]">{task.title || NO_DATA}</p>
                        <p className="mt-1 text-xs text-[#C3C6D5]">
                          {task.assigned_agent_name
                            ? `${task.assigned_agent_emoji ?? ''} ${task.assigned_agent_name}`.trim()
                            : NO_DATA}
                        </p>
                        <p className="mt-1 text-[11px] text-[#C3C6D5]">Updated: {formatDate(task.updated_at)}</p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#434653] bg-[#1F1F21]">
          <div className="border-b border-[#434653] px-4 py-3">
            <h2 className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Task Assignments</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="bg-[#2A2A2C]/80 text-left text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Queue Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Assignment</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Workspace</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Due</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-[#C3C6D5]">
                      <div className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[#434653] bg-[#1B1B1D] px-3 py-2">
                        <MaterialIcon name="hourglass_empty" className="text-base" />
                        {NO_DATA}
                      </div>
                    </td>
                  </tr>
                )}

                {tasks.map((task) => {
                  const priorityClass = isPriority(task.priority) ? PRIORITY_META[task.priority] : 'text-[#C3C6D5]';
                  const statusMeta = STATUS_META[task.status];

                  return (
                    <tr key={task.id} className="border-t border-[#434653]/70 text-sm hover:bg-[#2A2A2C]/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#E4E2E4]">{task.title || NO_DATA}</p>
                        <p className="mt-1 text-xs text-[#C3C6D5]">ID: {task.id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${statusClasses(task.status)}`}>
                          <MaterialIcon name={statusMeta?.icon ?? 'help'} className="text-sm" />
                          {formatStatus(task.status)}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] ${priorityClass}`}>
                        {formatPriority(task.priority)}
                      </td>
                      <td className="px-4 py-3">
                        {task.assigned_agent_name ? (
                          <span className="text-sm text-[#E4E2E4]">
                            {(task.assigned_agent_emoji ?? '') + ' ' + task.assigned_agent_name}
                          </span>
                        ) : (
                          <span className="text-[#C3C6D5]">{NO_DATA}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {task.created_by_agent_name ? (
                          <span className="text-sm text-[#E4E2E4]">
                            {(task.created_by_agent_emoji ?? '') + ' ' + task.created_by_agent_name}
                          </span>
                        ) : (
                          <span className="text-[#C3C6D5]">{NO_DATA}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#C3C6D5]">{task.workspace_name || NO_DATA}</td>
                      <td className="px-4 py-3 text-xs text-[#C3C6D5]">{formatDate(task.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-[#C3C6D5]">{formatDate(task.updated_at)}</td>
                      <td className="px-4 py-3 text-xs text-[#C3C6D5]">{formatDate(task.due_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
