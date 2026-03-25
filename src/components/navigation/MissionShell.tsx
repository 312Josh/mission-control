'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { missionSections, type MissionSectionSlug } from '@/lib/mission-sections';

const iconBySlug: Record<MissionSectionSlug, string> = {
  tasks: 'task_alt',
  agents: 'smart_toy',
  content: 'article',
  approvals: 'fact_check',
  council: 'balance',
  calendar: 'event',
  projects: 'folder',
  memory: 'database',
  docs: 'menu_book',
  people: 'group',
  office: 'apartment',
  team: 'groups',
  system: 'dns',
  radar: 'radar',
  factory: 'factory',
  pipeline: 'conversion_path',
  'ai-lab': 'science',
  feedback: 'forum',
};

interface MissionShellProps {
  children: React.ReactNode;
}

interface MaterialSymbolProps {
  name: string;
  className?: string;
  filled?: boolean;
}

function MaterialSymbol({ name, className, filled = false }: MaterialSymbolProps) {
  return (
    <span
      aria-hidden
      className={clsx('material-symbols-outlined select-none leading-none', filled && 'material-symbol-filled', className)}
    >
      {name}
    </span>
  );
}

export function MissionShell({ children }: MissionShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const activeSection = useMemo(
    () => missionSections.find((section) => pathname === `/${section.slug}` || pathname.startsWith(`/${section.slug}/`)),
    [pathname],
  );

  const activeTitle = activeSection?.title ?? 'Mission Control';

  return (
    <div
      className="min-h-screen bg-[#131315] text-[#E4E2E4]"
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}
    >
      <aside
        className={clsx(
          'fixed left-0 top-0 z-50 h-screen border-r border-[#434653] bg-[#1B1B1D] transition-all duration-300',
          collapsed ? 'w-20' : 'w-64',
        )}
      >
        <div className={clsx('flex h-full flex-col py-5', collapsed ? 'px-2' : 'px-3')}>
          <div className={clsx('mb-8 flex items-center overflow-hidden', collapsed ? 'justify-center' : 'gap-3 px-3')}>
            <div className="kinetic-gradient flex h-10 w-10 items-center justify-center rounded-lg shadow-lg shadow-[#638EFD]/25">
              <MaterialSymbol name="rocket_launch" filled className="text-[20px] text-[#001849]" />
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <h1 className="truncate text-xl font-black uppercase leading-none tracking-widest text-[#E4E2E4]">JLM Claw</h1>
                <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.2em] text-[#B3C5FF]/90">Mission Shell</p>
              </div>
            ) : null}
          </div>

          <div className={clsx('mb-3', collapsed ? 'flex justify-center' : 'px-2')}>
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="flex items-center justify-center rounded-lg border border-[#434653]/70 bg-[#1F1F21] p-2 text-[#C3C6D5] transition-colors hover:border-[#638EFD]/50 hover:text-[#B3C5FF]"
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              <MaterialSymbol name={collapsed ? 'menu_open' : 'menu'} className="text-[20px]" />
            </button>
          </div>

          <nav className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-1">
            {missionSections.map((section) => {
              const href = `/${section.slug}`;
              const active = pathname === href || pathname.startsWith(`${href}/`);

              return (
                <Link
                  key={section.slug}
                  href={href}
                  className={clsx(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200',
                    active
                      ? 'border-r-4 border-[#638EFD] bg-gradient-to-r from-[#638EFD]/10 to-transparent text-[#B3C5FF]'
                      : 'text-[#C3C6D5] hover:bg-[#353437] hover:text-[#E4E2E4]',
                  )}
                  title={collapsed ? section.title : undefined}
                >
                  <MaterialSymbol
                    name={iconBySlug[section.slug]}
                    filled={active}
                    className="text-[20px] transition-transform duration-200 group-hover:scale-110"
                  />
                  {!collapsed ? <span className="truncate text-sm font-semibold uppercase tracking-tight">{section.title}</span> : null}
                </Link>
              );
            })}
          </nav>

          <div className={clsx('pt-2', collapsed ? 'px-1' : 'px-2')}>
            <button
              type="button"
              className={clsx(
                'kinetic-gradient w-full rounded-xl py-3 text-xs font-black uppercase tracking-[0.18em] text-[#001849] shadow-xl shadow-[#638EFD]/20 transition-all duration-200 hover:opacity-90 active:scale-[0.98]',
                collapsed && 'px-0',
              )}
              aria-label="New mission"
            >
              {collapsed ? <MaterialSymbol name="add" className="text-[20px]" /> : 'New Mission'}
            </button>
          </div>
        </div>
      </aside>

      <header
        className={clsx(
          'glass-panel fixed right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[#434653]/35 px-4 transition-all duration-300 lg:px-8',
          collapsed ? 'left-20' : 'left-64',
        )}
      >
        <div className="flex flex-1 items-center">
          <div className="mr-4 hidden xl:block">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#B3C5FF]">JLM Claw</p>
            <p className="text-xs uppercase tracking-[0.14em] text-[#C3C6D5]">{activeTitle}</p>
          </div>
          <div className="relative w-full max-w-xl">
            <MaterialSymbol
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[19px] text-[#C3C6D5]"
            />
            <input
              type="text"
              aria-label="Search mission parameters"
              placeholder="Search mission parameters..."
              className="w-full rounded-xl border border-[#434653]/45 bg-[#1F1F21] py-2 pl-10 pr-4 text-sm text-[#E4E2E4] placeholder:text-[#C3C6D5]/50 focus:border-[#638EFD] focus:outline-none focus:ring-1 focus:ring-[#638EFD]/40"
            />
          </div>
        </div>

        <div className="ml-4 flex items-center gap-3 lg:gap-6">
          <button
            type="button"
            className="relative rounded-lg p-2 text-[#C3C6D5] transition-colors hover:bg-[#1F1F21] hover:text-[#E4E2E4]"
            aria-label="Notifications"
          >
            <MaterialSymbol name="notifications" className="text-[20px]" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full border border-[#131315] bg-[#4AE176]" />
          </button>
          <div className="h-8 w-px bg-[#434653]/40" />
          <div className="hidden items-center gap-3 sm:flex">
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#E4E2E4]">System Active</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.13em] text-[#4AE176]">Status: Stable</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#B3C5FF]/30 bg-[#1F1F21] text-xs font-black text-[#B3C5FF]">
              JL
            </div>
          </div>
        </div>
      </header>

      <div className={clsx('transition-all duration-300', collapsed ? 'pl-20' : 'pl-64')}>
        <main className="min-h-screen px-5 pb-8 pt-20 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
