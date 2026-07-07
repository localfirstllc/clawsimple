const DEFAULT_NOTIFY_TIMEOUT_MS = 3000;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getRunnerNotifyUrl() {
  return trimTrailingSlash((process.env.RUNNER_NOTIFY_URL ?? "").trim());
}

export async function notifyRunnerJobAvailable(sid: string, jobId?: string) {
  const baseUrl = getRunnerNotifyUrl();
  const secret = (process.env.RUNNER_NOTIFY_SECRET ?? "").trim();
  if (!baseUrl || !secret) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_NOTIFY_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${baseUrl}/notify/${encodeURIComponent(sid)}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "job_available",
          ...(jobId ? { job_id: jobId } : {}),
        }),
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      console.warn(`[runner-notify] notify failed sid=${sid} status=${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.warn(`[runner-notify] notify failed sid=${sid} error=${message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
