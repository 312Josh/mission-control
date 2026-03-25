'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { WorkspaceStats } from '@/lib/types';

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

export function WorkspaceDashboard() {
  const [workspaces, setWorkspaces] = useState<WorkspaceStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const res = await fetch('/api/workspaces?stats=true');
      if (res.ok) {
        const data = (await res.json()) as WorkspaceStats[];
        setWorkspaces(data);
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#131315]">
        <div className="text-center text-[#C3C6D5]">
          <MaterialIcon name="progress_activity" className="mx-auto mb-3 text-3xl animate-spin" />
          <p className="text-sm">Loading workspaces...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#131315] font-['Inter',sans-serif] text-[#E4E2E4]">
      <header className="border-b border-[#434653] bg-[#1B1B1D]">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="kinetic-gradient flex h-10 w-10 items-center justify-center rounded-lg shadow-lg shadow-[#638EFD]/25">
              <MaterialIcon name="rocket_launch" filled className="text-[19px] text-[#001849]" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#B3C5FF]">JLM Claw</p>
              <h1 className="text-lg font-black uppercase tracking-tight">Workspace Dashboard</h1>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="kinetic-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#001849] shadow-xl shadow-[#638EFD]/20 transition-opacity hover:opacity-90"
          >
            <MaterialIcon name="add" className="text-sm" />
            New Workspace
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-6 py-8">
        <section className="mb-6 rounded-xl border border-[#434653] bg-[#1F1F21] p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#C3C6D5]">Workspace Fleet</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">All Workspaces</h2>
          <p className="mt-2 text-sm text-[#C3C6D5]">Select a workspace to view mission queues and agent activity.</p>
        </section>

        {workspaces.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#434653] bg-[#1B1B1D] py-16 text-center">
            <MaterialIcon name="folder_off" className="mx-auto text-5xl text-[#C3C6D5]" />
            <h3 className="mt-4 text-lg font-semibold">No workspaces yet</h3>
            <p className="mt-2 text-[#C3C6D5]">Create your first workspace to get started.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-6 rounded-lg bg-[#638EFD] px-6 py-3 text-sm font-semibold text-[#001849] transition-opacity hover:opacity-90"
            >
              Create Workspace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                onDelete={(id) => setWorkspaces(workspaces.filter((item) => item.id !== id))}
              />
            ))}

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#434653] bg-[#1B1B1D] transition-colors hover:border-[#638EFD]/50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2A2A2C] text-[#C3C6D5]">
                <MaterialIcon name="add" className="text-xl" />
              </div>
              <span className="text-sm font-semibold uppercase tracking-[0.12em] text-[#C3C6D5]">Add Workspace</span>
            </button>
          </div>
        )}
      </main>

      {showCreateModal ? (
        <CreateWorkspaceModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            void loadWorkspaces();
          }}
        />
      ) : null}
    </div>
  );
}

function WorkspaceCard({ workspace, onDelete }: { workspace: WorkspaceStats; onDelete: (id: string) => void }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDeleting(true);

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete(workspace.id);
      } else {
        const data = (await res.json()) as { error?: string };
        alert(data.error || 'Failed to delete workspace');
      }
    } catch {
      alert('Failed to delete workspace');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <Link href={`/workspace/${workspace.slug}`}>
        <div className="group relative cursor-pointer rounded-xl border border-[#434653] bg-[#1B1B1D] p-6 transition-all hover:border-[#638EFD]/50 hover:bg-[#1F1F21]">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{workspace.icon}</span>
              <div>
                <h3 className="text-lg font-semibold transition-colors group-hover:text-[#B3C5FF]">{workspace.name}</h3>
                <p className="text-xs text-[#C3C6D5]">/{workspace.slug}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {workspace.id !== 'default' ? (
                <button
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setShowDeleteConfirm(true);
                  }}
                  className="rounded p-1.5 text-[#C3C6D5] transition-colors hover:bg-[#93000A]/30 hover:text-[#FFB4AB]"
                  title="Delete workspace"
                >
                  <MaterialIcon name="delete" className="text-base" />
                </button>
              ) : null}
              <MaterialIcon name="arrow_forward" className="text-lg text-[#C3C6D5] transition-colors group-hover:text-[#B3C5FF]" />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4 text-xs text-[#C3C6D5]">
            <div className="inline-flex items-center gap-1">
              <MaterialIcon name="task_alt" className="text-sm" />
              <span>{workspace.taskCounts.total} tasks</span>
            </div>
            <div className="inline-flex items-center gap-1">
              <MaterialIcon name="group" className="text-sm" />
              <span>{workspace.agentCount} agents</span>
            </div>
          </div>
        </div>
      </Link>

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="w-full max-w-md rounded-xl border border-[#434653] bg-[#1B1B1D] p-6" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full bg-[#93000A]/30 p-3 text-[#FFB4AB]">
                <MaterialIcon name="warning" className="text-xl" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Delete Workspace</h3>
                <p className="text-sm text-[#C3C6D5]">This action cannot be undone.</p>
              </div>
            </div>

            <p className="mb-6 text-sm text-[#C3C6D5]">
              Are you sure you want to delete <strong>{workspace.name}</strong>?
              {workspace.taskCounts.total > 0 ? (
                <span className="mt-2 block text-[#FFB4AB]">This workspace has {workspace.taskCounts.total} task(s). Delete them first.</span>
              ) : null}
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-[#C3C6D5] transition-colors hover:text-[#E4E2E4]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || workspace.taskCounts.total > 0 || workspace.agentCount > 0}
                className="rounded-lg bg-[#93000A] px-4 py-2 text-sm font-semibold text-[#FFB4AB] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Workspace'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CreateWorkspaceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📁');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const icons = ['📁', '💼', '🏢', '🚀', '💡', '🎯', '📊', '🔧', '🌟', '🏠'];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), icon }),
      });

      if (res.ok) {
        onCreated();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error || 'Failed to create workspace');
      }
    } catch {
      setError('Failed to create workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#434653] bg-[#1B1B1D]">
        <div className="border-b border-[#434653] px-6 py-4">
          <h2 className="text-lg font-semibold uppercase tracking-tight">Create New Workspace</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Icon</label>
            <div className="flex flex-wrap gap-2">
              {icons.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setIcon(value)}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border text-xl transition-colors ${
                    icon === value
                      ? 'border-[#638EFD] bg-[#638EFD]/20'
                      : 'border-[#434653] bg-[#131315] hover:border-[#638EFD]/50'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-[#C3C6D5]">Name</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g., Acme Corp"
              className="w-full rounded-lg border border-[#434653] bg-[#131315] px-4 py-2 text-sm text-[#E4E2E4] outline-none transition-colors focus:border-[#638EFD]"
              autoFocus
            />
          </div>

          {error ? <div className="text-sm text-[#FFB4AB]">{error}</div> : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#C3C6D5] transition-colors hover:text-[#E4E2E4]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="rounded-lg bg-[#638EFD] px-6 py-2 text-sm font-semibold text-[#001849] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
