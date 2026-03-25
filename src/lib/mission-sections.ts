export type MissionSectionSlug =
  | 'tasks'
  | 'agents'
  | 'content'
  | 'approvals'
  | 'council'
  | 'calendar'
  | 'projects'
  | 'memory'
  | 'docs'
  | 'people'
  | 'office'
  | 'team'
  | 'system'
  | 'radar'
  | 'factory'
  | 'pipeline'
  | 'ai-lab'
  | 'feedback';

export interface MissionSection {
  slug: MissionSectionSlug;
  title: string;
  description: string;
  priority: boolean;
}

export const missionSections: MissionSection[] = [
  {
    slug: 'tasks',
    title: 'Tasks',
    description: 'Task queues, execution states, and dispatch control.',
    priority: true,
  },
  {
    slug: 'agents',
    title: 'Agents',
    description: 'Agent roster, health, and operating modes.',
    priority: true,
  },
  {
    slug: 'content',
    title: 'Content',
    description: 'Content operations and publication workflows.',
    priority: true,
  },
  {
    slug: 'approvals',
    title: 'Approvals',
    description: 'Pending reviews and authorization checkpoints.',
    priority: true,
  },
  {
    slug: 'council',
    title: 'Council',
    description: 'Cross-team direction, decisions, and outcomes.',
    priority: true,
  },
  {
    slug: 'calendar',
    title: 'Calendar',
    description: 'Mission schedule, timing, and upcoming milestones.',
    priority: false,
  },
  {
    slug: 'projects',
    title: 'Projects',
    description: 'Project-level grouping, ownership, and progress.',
    priority: false,
  },
  {
    slug: 'memory',
    title: 'Memory',
    description: 'Shared context stores and retention systems.',
    priority: false,
  },
  {
    slug: 'docs',
    title: 'Docs',
    description: 'Documentation status and publication surface.',
    priority: false,
  },
  {
    slug: 'people',
    title: 'People',
    description: 'Team members, assignments, and coverage.',
    priority: false,
  },
  {
    slug: 'office',
    title: 'Office',
    description: 'Operational coordination and office logistics.',
    priority: false,
  },
  {
    slug: 'team',
    title: 'Team',
    description: 'Team alignment, capacity, and workload balance.',
    priority: false,
  },
  {
    slug: 'system',
    title: 'System',
    description: 'Runtime status, dependencies, and infrastructure.',
    priority: false,
  },
  {
    slug: 'radar',
    title: 'Radar',
    description: 'Signals, alerts, and emerging risks.',
    priority: false,
  },
  {
    slug: 'factory',
    title: 'Factory',
    description: 'Build operations and production throughput.',
    priority: false,
  },
  {
    slug: 'pipeline',
    title: 'Pipeline',
    description: 'Delivery stages and transition bottlenecks.',
    priority: false,
  },
  {
    slug: 'ai-lab',
    title: 'AI Lab',
    description: 'Model experiments, evaluations, and prototypes.',
    priority: false,
  },
  {
    slug: 'feedback',
    title: 'Feedback',
    description: 'Incoming feedback loops and response tracking.',
    priority: false,
  },
];

export const missionSectionBySlug = missionSections.reduce(
  (sections, section) => {
    sections[section.slug] = section;
    return sections;
  },
  {} as Record<MissionSectionSlug, MissionSection>
);
