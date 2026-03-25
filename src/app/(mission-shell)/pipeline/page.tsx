'use client';

import { useEffect, useMemo, useState } from 'react';

interface PipelineSource {
  id: string;
  label: string;
  target: string;
  status: 'ok' | 'empty' | 'missing' | 'error';
  attempted: boolean;
  count: number;
  detail: string;
}

interface PipelineProspect {
  id: string;
  name: string;
  company: string | null;
  stage: string | null;
  status: string | null;
  updated_at: string | null;
  source: string;
}

interface PipelineOutreach {
  id: string;
  prospect_name: string | null;
  channel: string | null;
  status: string | null;
  owner: string | null;
  activity_at: string | null;
  notes: string;
  source: string;
}

interface PipelinePayload {
  generated_at: string;
  refresh_ms: number;
  summary: {
    prospects_total: number;
    outreach_total: number;
    sources_ok: number;
    sources_missing: number;
    sources_error: number;
    last_activity_at: string | null;
  };
  sources: PipelineSource[];
  prospects: PipelineProspect[];
  outreach: PipelineOutreach[];
  detail?: string;
  error?: string;
}

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

function formatDate(value: string | null): string {
  if (!value) {
    return 'No data';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No data';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function statusTone(status: PipelineSource['status']): string {
  if (status === 'ok') return 'border-[#4AE176]/45 bg-[#1D3A2A] text-[#4AE176]';
  if (status === 'empty') return 'border-[#638EFD]/50 bg-[#638EFD]/16 text-[#B3C5FF]';
  if (status === 'missing') return 'border-[#434653] bg-[#2A2A2C] text-[#C3C6D5]';
  return 'border-[#FFB4AB]/45 bg-[#93000A]/30 text-[#FFB4AB]';
}

export default function PipelinePage() {
  const [payload, setPayload] = useState<PipelinePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let timerId: number | null = null;

    const load = async () => {
      try {
        const res = await fetch('/api/pipeline', { cache: 'no-store' });
        if (!res.ok) {
          const detail = (await res.json().catch(() => null)) as { detail?: string } | null;
          throw new Error(detail?.detail || `Pipeline request failed (${res.status})`);
        }

        const data = (await res.json()) as PipelinePayload;
        if (!mounted) return;

        setPayload(data);
        setError(null);

        if (timerId) {
          window.clearInterval(timerId);
        }
        timerId = window.setInterval(() => {
          void load();
        }, Math.max(data.refresh_ms || 15000, 10000));
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load pipeline');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
      if (timerId) {
        window.clearInterval(timerId);
      }
    };
  }, []);

  const topProspects = useMemo(() => (payload?.prospects ?? []).slice(0, 80), [payload]);
  const topOutreach = useMemo(() => (payload?.outreach ?? []).slice(0, 120), [payload]);

  return (
    <section className="mx-auto w-full max-w-[1500px] pb-6 font-['Inter',sans-serif]">
      <header className="rounded-xl border border-[#434653] bg-[#1F1F21] p-5 shadow-[0_12px_30px_rgba(0,0,0,0.26)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Revenue Operations</p>
            <h1 className="mt-1 text-2xl font-black uppercase tracking-tight text-[#E4E2E4]">Pipeline</h1>
            <p className="mt-2 text-sm text-[#C3C6D5]">Live CoGrow/prospect signal aggregation with source diagnostics and fallback scans.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-[#434653] bg-[#2A2A2C] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#C3C6D5]">
            <MaterialIcon name="sync" className={`${loading ? 'animate-spin' : ''} text-sm`} />
            {payload?.generated_at ? `Updated ${formatDate(payload.generated_at)}` : loading ? 'Loading' : 'Awaiting data'}
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
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Prospects</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-[#B3C5FF]">{payload?.summary.prospects_total ?? 0}</p>
        </article>
        <article className="rounded-xl border border-[#DDB7FF]/45 bg-[#1B1B1D] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Outreach</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-[#DDB7FF]">{payload?.summary.outreach_total ?? 0}</p>
        </article>
        <article className="rounded-xl border border-[#4AE176]/45 bg-[#1B1B1D] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Sources OK</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-[#4AE176]">{payload?.summary.sources_ok ?? 0}</p>
        </article>
        <article className="rounded-xl border border-[#434653] bg-[#1B1B1D] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Sources Missing</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-[#C3C6D5]">{payload?.summary.sources_missing ?? 0}</p>
        </article>
        <article className="rounded-xl border border-[#FFB4AB]/45 bg-[#1B1B1D] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Source Errors</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-[#FFB4AB]">{payload?.summary.sources_error ?? 0}</p>
        </article>
      </section>

      <section className="mt-4 rounded-xl border border-[#434653] bg-[#1F1F21]">
        <div className="border-b border-[#434653] px-4 py-3">
          <h2 className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Source Diagnostics</h2>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {(payload?.sources ?? []).map((source) => (
            <article key={source.id} className="rounded-lg border border-[#434653] bg-[#1B1B1D] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#E4E2E4]">{source.label}</p>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${statusTone(source.status)}`}>
                  {source.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-[#C3C6D5]">Target: {source.target}</p>
              <p className="mt-1 text-xs text-[#C3C6D5]">Rows: {source.count}</p>
              <p className="mt-2 text-xs text-[#C3C6D5]">{source.detail}</p>
            </article>
          ))}
          {!loading && (payload?.sources.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed border-[#434653] bg-[#1B1B1D] p-4 text-sm text-[#C3C6D5]">
              No data
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <article className="overflow-hidden rounded-xl border border-[#434653] bg-[#1F1F21]">
          <div className="border-b border-[#434653] px-4 py-3">
            <h2 className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Prospects</h2>
          </div>
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr className="bg-[#2A2A2C]/80 text-left text-[10px] font-black uppercase tracking-[0.18em] text-[#C3C6D5]">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {topProspects.map((prospect) => (
                  <tr key={prospect.id} className="border-t border-[#434653]/60 text-sm hover:bg-[#2A2A2C]/40">
                    <td className="px-4 py-3 font-semibold text-[#E4E2E4]">{prospect.name || 'No data'}</td>
                    <td className="px-4 py-3 text-[#C3C6D5]">{prospect.company || 'No data'}</td>
                    <td className="px-4 py-3 text-[#C3C6D5]">{prospect.stage || 'No data'}</td>
                    <td className="px-4 py-3 text-[#C3C6D5]">{prospect.status || 'No data'}</td>
                    <td className="px-4 py-3 text-[#C3C6D5]">{formatDate(prospect.updated_at)}</td>
                  </tr>
                ))}
                {!loading && topProspects.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#C3C6D5]">
                      <div className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[#434653] bg-[#1B1B1D] px-3 py-2">
                        <MaterialIcon name="hourglass_empty" className="text-base" />
                        No data
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="overflow-hidden rounded-xl border border-[#434653] bg-[#1F1F21]">
          <div className="border-b border-[#434653] px-4 py-3">
            <h2 className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Outreach Activity</h2>
          </div>
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="bg-[#2A2A2C]/80 text-left text-[10px] font-black uppercase tracking-[0.18em] text-[#C3C6D5]">
                  <th className="px-4 py-3">Prospect</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {topOutreach.map((item) => (
                  <tr key={item.id} className="border-t border-[#434653]/60 text-sm hover:bg-[#2A2A2C]/40">
                    <td className="px-4 py-3 text-[#E4E2E4]">{item.prospect_name || 'No data'}</td>
                    <td className="px-4 py-3 text-[#C3C6D5]">{item.channel || 'No data'}</td>
                    <td className="px-4 py-3 text-[#C3C6D5]">{item.status || 'No data'}</td>
                    <td className="px-4 py-3 text-[#C3C6D5]">{item.owner || 'No data'}</td>
                    <td className="px-4 py-3 text-[#C3C6D5]">{formatDate(item.activity_at)}</td>
                    <td className="max-w-[24rem] truncate px-4 py-3 text-[#C3C6D5]" title={item.notes || ''}>{item.notes || 'No data'}</td>
                  </tr>
                ))}
                {!loading && topOutreach.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#C3C6D5]">
                      <div className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[#434653] bg-[#1B1B1D] px-3 py-2">
                        <MaterialIcon name="hourglass_empty" className="text-base" />
                        No data
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </section>
  );
}
