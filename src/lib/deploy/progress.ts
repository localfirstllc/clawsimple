export type DeploymentServerInfo = {
  os?: string;
  arch?: string;
  installer_version?: string;
  install_phase?:
    | "runtime_installed"
    | "bot_configured"
    | "service_started"
    | "health_verified";
  deploy_provider?: string;
  server_id?: string | number;
  server_name?: string;
  server_ipv4?: string;
  server_ipv6?: string;
  runtime_mode?: string;
  [key: string]: unknown;
} | null;

export type DeploymentStepKey =
  | "serverAssigned"
  | "nodeReported"
  | "runtimeInstalled"
  | "botConfigured"
  | "serviceStarted"
  | "serviceReady";

export type DeploymentStepState = "pending" | "current" | "complete" | "failed";

export type DeploymentStep = {
  key: DeploymentStepKey;
  state: DeploymentStepState;
};

function hasServerAssigned(server: DeploymentServerInfo) {
  return Boolean(
    server?.deploy_provider ||
      server?.server_id ||
      server?.server_name ||
      server?.server_ipv4,
  );
}

function hasNodeReported(server: DeploymentServerInfo) {
  return Boolean(server?.os || server?.arch || server?.installer_version);
}

function getInstallPhaseRank(server: DeploymentServerInfo) {
  switch (server?.install_phase) {
    case "service_started":
      return 3;
    case "health_verified":
      return 4;
    case "bot_configured":
      return 2;
    case "runtime_installed":
      return 1;
    default:
      return 0;
  }
}

export function getDeploymentProgress(params: {
  sid?: string | null;
  status?: string | null;
  server?: DeploymentServerInfo;
}) {
  const { sid, status, server } = params;
  const installPhaseRank = getInstallPhaseRank(server ?? null);
  if (!sid) return 0;
  if (status === "completed") return 100;
  if (installPhaseRank >= 4) return 96;
  if (installPhaseRank >= 3) return 88;
  if (installPhaseRank >= 2) return 72;
  if (installPhaseRank >= 1) return 55;
  if (hasNodeReported(server ?? null)) return 48;
  if (hasServerAssigned(server ?? null)) return 38;
  if (status === "started" || status === "created") return 12;
  if (status === "failed") {
    if (hasNodeReported(server ?? null)) return 48;
    if (hasServerAssigned(server ?? null)) return 38;
    return 12;
  }
  return 0;
}

export function getDeploymentSteps(params: {
  status?: string | null;
  server?: DeploymentServerInfo;
}): DeploymentStep[] {
  const { status, server } = params;
  const serverAssigned = hasServerAssigned(server ?? null);
  const nodeReported = hasNodeReported(server ?? null);
  const installPhaseRank = getInstallPhaseRank(server ?? null);
  const completed = status === "completed";
  const failed = status === "failed";

  const steps: DeploymentStep[] = [
    {
      key: "serverAssigned",
      state: serverAssigned ? "complete" : "pending",
    },
    {
      key: "nodeReported",
      state: nodeReported ? "complete" : "pending",
    },
    {
      key: "runtimeInstalled",
      state: installPhaseRank >= 1 ? "complete" : "pending",
    },
    {
      key: "botConfigured",
      state: installPhaseRank >= 2 ? "complete" : "pending",
    },
    {
      key: "serviceStarted",
      state: installPhaseRank >= 3 ? "complete" : "pending",
    },
    {
      key: "serviceReady",
      state: completed || installPhaseRank >= 4 ? "complete" : "pending",
    },
  ];

  if (!completed && !failed) {
    const currentIndex = steps.findIndex((step) => step.state === "pending");
    if (currentIndex >= 0) {
      steps[currentIndex] = { ...steps[currentIndex], state: "current" };
    }
    return steps;
  }

  if (failed) {
    const failedIndex = steps.findIndex((step) => step.state === "pending");
    if (failedIndex >= 0) {
      steps[failedIndex] = { ...steps[failedIndex], state: "failed" };
    } else {
      steps[steps.length - 1] = { ...steps[steps.length - 1], state: "failed" };
    }
  }

  return steps;
}
