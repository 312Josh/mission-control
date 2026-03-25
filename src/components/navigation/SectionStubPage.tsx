import type { MissionSection } from '@/lib/mission-sections';

interface SectionStubPageProps {
  section: MissionSection;
}

function MaterialIcon({ name, filled = false, className = '' }: { name: string; filled?: boolean; className?: string }) {
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

export function SectionStubPage({ section }: SectionStubPageProps) {
  return (
    <section className="mx-auto w-full max-w-5xl font-['Inter',sans-serif]">
      <div className="rounded-xl border border-[#434653] bg-[#1F1F21] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#434653]/80 pb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Mission Surface</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-[#E4E2E4]">{section.title}</h2>
            <p className="mt-2 max-w-3xl text-sm text-[#C3C6D5]">{section.description}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#638EFD]/45 bg-[#638EFD]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#B3C5FF]">
            <MaterialIcon name="science" className="text-sm" />
            Stub Route
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-[#434653] bg-[#1B1B1D] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Status</p>
            <p className="mt-2 text-sm font-medium text-[#E4E2E4]">Awaiting live data wiring</p>
            <p className="mt-1 text-xs text-[#C3C6D5]">No API stream is attached to this route yet.</p>
          </article>

          <article className="rounded-xl border border-[#434653] bg-[#1B1B1D] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Route</p>
            <p className="mt-2 inline-flex items-center rounded border border-[#434653] bg-[#2A2A2C] px-2 py-1 text-xs font-semibold text-[#E4E2E4]">
              /{section.slug}
            </p>
            <p className="mt-1 text-xs text-[#C3C6D5]">Navigation and shell behaviors are active.</p>
          </article>

          <article className="rounded-xl border border-[#4AE176]/45 bg-[#4AE176]/10 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#4AE176]">Readiness</p>
            <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#E4E2E4]">
              <span className="h-2 w-2 rounded-full bg-[#4AE176]" />
              UI Skin Synced
            </div>
            <p className="mt-1 text-xs text-[#C3C6D5]">Cards, badges, and typography now match JLM Claw.</p>
          </article>
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-[#434653] bg-[#1B1B1D] p-4 text-sm text-[#C3C6D5]">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">
            <MaterialIcon name="info" className="text-sm" />
            Empty State
          </div>
          <p className="mt-2">This section is intentionally in a no-data mode until backend integration is added.</p>
        </div>
      </div>
    </section>
  );
}
