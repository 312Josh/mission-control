'use client';

import { useEffect, useMemo, useState } from 'react';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  category: 'work' | 'family' | 'home' | 'other';
  calendarName: string;
  location?: string;
  description?: string;
}

interface CalendarPayload {
  source: 'gws' | 'accli' | 'none';
  range: {
    start: string;
    end: string;
  };
  generatedAt: string;
  events: CalendarEvent[];
  sourceError?: string;
}

const REFRESH_MS = 30000;

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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No data';
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown day';
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function startOfDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function categoryTone(category: CalendarEvent['category']) {
  if (category === 'work') return 'border-[#B3C5FF]/40 bg-[#638EFD]/16 text-[#B3C5FF]';
  if (category === 'family') return 'border-[#DDB7FF]/45 bg-[#6F00BE]/18 text-[#DDB7FF]';
  if (category === 'home') return 'border-[#4AE176]/45 bg-[#1D3A2A] text-[#4AE176]';
  return 'border-[#434653] bg-[#2A2A2C] text-[#C3C6D5]';
}

function sourceLabel(source: CalendarPayload['source']) {
  if (source === 'gws') return 'GWS';
  if (source === 'accli') return 'ACCLI';
  return 'NONE';
}

export default function CalendarPage() {
  const [payload, setPayload] = useState<CalendarPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await fetch('/api/calendar', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Calendar request failed (${res.status})`);
        }

        const data = (await res.json()) as CalendarPayload;
        if (!mounted) return;

        setPayload(data);
        setError(null);
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load calendar');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, REFRESH_MS);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const groupedEvents = useMemo(() => {
    if (!payload) return [] as Array<{ key: string; label: string; events: CalendarEvent[] }>;

    const byDay = new Map<string, CalendarEvent[]>();
    for (const event of payload.events) {
      const key = startOfDayKey(event.start);
      const current = byDay.get(key) ?? [];
      current.push(event);
      byDay.set(key, current);
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, events]) => ({
        key,
        label: formatDayLabel(events[0]?.start ?? ''),
        events: [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
      }));
  }, [payload]);

  const categoryCounts = useMemo(() => {
    const counts = { work: 0, family: 0, home: 0, other: 0 };
    if (!payload) {
      return counts;
    }

    for (const event of payload.events) {
      counts[event.category] += 1;
    }

    return counts;
  }, [payload]);

  return (
    <section className="mx-auto w-full max-w-[1400px] pb-6 font-['Inter',sans-serif]">
      <header className="rounded-xl border border-[#434653] bg-[#1F1F21] p-5 shadow-[0_12px_30px_rgba(0,0,0,0.26)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Mission Schedule</p>
            <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[#E4E2E4]">Calendar</h1>
            <p className="mt-2 text-sm text-[#C3C6D5]">Live events from `/api/calendar` with source fallback and no-data protection.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-[#434653] bg-[#2A2A2C] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#C3C6D5]">
            <MaterialIcon name="sync" className={`${loading ? 'animate-spin' : ''} text-sm`} />
            {payload?.generatedAt ? `Updated ${formatDate(payload.generatedAt)}` : loading ? 'Loading' : 'Awaiting data'}
          </div>
        </div>
      </header>

      {error ? (
        <div className="mt-4 rounded-lg border border-[#FFB4AB]/60 bg-[#93000A]/30 p-3 text-sm text-[#FFB4AB]">
          <div className="flex items-center gap-2">
            <MaterialIcon name="error" className="text-base" />
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-xl border border-[#638EFD]/50 bg-[#1B1B1D] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Source</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-[#B3C5FF]">{sourceLabel(payload?.source ?? 'none')}</p>
        </article>
        <article className="rounded-xl border border-[#434653] bg-[#1B1B1D] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Events</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-[#E4E2E4]">{payload?.events.length ?? 0}</p>
        </article>
        <article className="rounded-xl border border-[#4AE176]/45 bg-[#1B1B1D] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">All Day</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-[#4AE176]">{payload?.events.filter((event) => event.allDay).length ?? 0}</p>
        </article>
        <article className="rounded-xl border border-[#DDB7FF]/45 bg-[#1B1B1D] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Work / Family</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-[#DDB7FF]">{categoryCounts.work + categoryCounts.family}</p>
        </article>
        <article className="rounded-xl border border-[#434653] bg-[#1B1B1D] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Home / Other</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-[#C3C6D5]">{categoryCounts.home + categoryCounts.other}</p>
        </article>
      </section>

      {payload?.sourceError ? (
        <div className="mt-4 rounded-lg border border-[#DDB7FF]/50 bg-[#6F00BE]/20 p-3 text-sm text-[#DDB7FF]">
          <div className="flex items-center gap-2">
            <MaterialIcon name="warning" className="text-base" />
            <span>{payload.sourceError}</span>
          </div>
        </div>
      ) : null}

      <section className="mt-4 rounded-xl border border-[#434653] bg-[#1F1F21]">
        <div className="border-b border-[#434653] px-4 py-3">
          <h2 className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Timeline</h2>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4">
          {loading && !payload ? (
            <div className="rounded-lg border border-dashed border-[#434653] bg-[#1B1B1D] px-4 py-8 text-center text-sm text-[#C3C6D5]">
              <MaterialIcon name="progress_activity" className="mb-2 text-2xl animate-spin" />
              Loading calendar feed...
            </div>
          ) : null}

          {!loading && (payload?.events.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed border-[#434653] bg-[#1B1B1D] px-4 py-8 text-center">
              <MaterialIcon name="event_busy" className="mx-auto text-3xl text-[#C3C6D5]" />
              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">No Data</p>
              <p className="mt-2 text-sm text-[#C3C6D5]">No calendar events were found in the current range.</p>
            </div>
          ) : null}

          {groupedEvents.map((group) => (
            <article key={group.key}>
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">{group.label}</h3>
              <div className="space-y-2">
                {group.events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-[#434653] bg-[#1B1B1D] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#E4E2E4]">{event.title}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${categoryTone(event.category)}`}>
                        <MaterialIcon name="category" className="text-sm" />
                        {event.category}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[#C3C6D5]">
                      <span className="inline-flex items-center gap-1">
                        <MaterialIcon name="schedule" className="text-sm" />
                        {event.allDay ? 'All day' : `${formatDate(event.start)} - ${formatDate(event.end)}`}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MaterialIcon name="calendar_month" className="text-sm" />
                        {event.calendarName || 'No data'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MaterialIcon name="location_on" className="text-sm" />
                        {event.location || 'No location'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
