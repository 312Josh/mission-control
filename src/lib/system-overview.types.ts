export interface SessionOverviewEntry {
  key: string;
  id: string | null;
  model: string | null;
  channel: string | null;
  status: string | null;
  updated_at: string | null;
  total_tokens: number;
  context_tokens: number;
  context_percent: number;
}

export interface ScheduledEntry {
  source: 'crontab' | 'launchd';
  label: string;
  schedule: string;
  command: string;
  path?: string;
}

export interface ProcessEntry {
  pid: number;
  cpu_percent: number;
  mem_percent: number;
  elapsed: string;
  command: string;
}

export interface RateLimitStatus {
  available: boolean;
  limit: number | null;
  remaining: number | null;
  reset_at: string | null;
  retry_after_seconds: number | null;
  source: string | null;
}

export interface SystemOverview {
  generated_at: string;
  agent_status: {
    total: number;
    working: number;
    standby: number;
    offline: number;
    active_links: number;
  };
  sessions: {
    connected: boolean;
    error: string | null;
    gateway_url: string;
    total: number;
    active_recent: number;
    rate_limit: RateLimitStatus;
    entries: SessionOverviewEntry[];
  };
  connections: {
    dashboard_sse_clients: number;
  };
  scheduled: {
    cron_available: boolean;
    cron_error: string | null;
    launchd_available: boolean;
    launchd_error: string | null;
    total: number;
    entries: ScheduledEntry[];
  };
  system_health: {
    hostname: string;
    platform: string;
    release: string;
    uptime_seconds: number;
    cpu_cores: number;
    cpu_load_percent: number;
    load_avg: [number, number, number];
    memory_total_gb: number;
    memory_used_gb: number;
    memory_used_percent: number;
    disk_total_gb: number | null;
    disk_free_gb: number | null;
    disk_used_percent: number | null;
    node_version: string;
    processes: ProcessEntry[];
  };
}
