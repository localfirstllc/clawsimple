type RunnerApiLogFields = {
  route: string;
  action: string;
  sid?: string | null;
  jobId?: string | null;
  status: number;
  startedAt: number;
  ok?: boolean;
  jobType?: string | null;
  updated?: boolean | number;
  staleJobs?: number;
  profiles?: number;
  error?: string;
};

function shortId(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= 8 ? trimmed : `${trimmed.slice(0, 8)}...`;
}

export function logRunnerApiEvent(fields: RunnerApiLogFields) {
  const durationMs = Math.max(0, Date.now() - fields.startedAt);
  const record = {
    ts: new Date().toISOString(),
    event: "runner_api",
    route: fields.route,
    action: fields.action,
    status: fields.status,
    duration_ms: durationMs,
    ...(fields.ok !== undefined ? { ok: fields.ok } : {}),
    ...(fields.sid ? { sid: shortId(fields.sid) } : {}),
    ...(fields.jobId ? { job_id: shortId(fields.jobId) } : {}),
    ...(fields.jobType ? { job_type: fields.jobType } : {}),
    ...(fields.updated !== undefined ? { updated: fields.updated } : {}),
    ...(fields.staleJobs !== undefined ? { stale_jobs: fields.staleJobs } : {}),
    ...(fields.profiles !== undefined ? { profiles: fields.profiles } : {}),
    ...(fields.error ? { error: fields.error } : {}),
  };

  process.stdout.write(`${JSON.stringify(record)}\n`);
}
