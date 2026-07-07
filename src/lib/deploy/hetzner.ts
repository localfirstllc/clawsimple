type HetznerServerResponse = {
  server: {
    id: number;
    name: string;
    status: string;
    created: string;
    public_net: {
      ipv4?: { ip: string };
      ipv6?: { ip: string };
    };
    server_type?: { name: string };
    location?: { name: string };
  };
  root_password?: string;
};

const HCLOUD_API = "https://api.hetzner.cloud/v1";

export async function createHetznerServer(params: {
  name: string;
  serverType: string;
  location: string;
  image: string;
  sshKeyName?: string;
  userData: string;
  labels: Record<string, string>;
}) {
  const token = process.env.HETZNER_API_TOKEN;
  if (!token) {
    throw new Error("HETZNER_API_TOKEN is not set");
  }

  const requestBody: Record<string, unknown> = {
    name: params.name,
    server_type: params.serverType,
    location: params.location,
    image: params.image,
    user_data: params.userData,
    labels: params.labels,
  };

  // Only include ssh_keys if sshKeyName is provided
  if (params.sshKeyName) {
    requestBody.ssh_keys = [params.sshKeyName];
  }

  const response = await fetch(`${HCLOUD_API}/servers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const payload = (await response.json()) as HetznerServerResponse & {
    error?: { message?: string; code?: string };
  };

  if (!response.ok || !payload.server) {
    const errorMessage =
      payload?.error?.message ||
      `Hetzner API error: ${response.status} ${response.statusText}`;
    const error = new Error(errorMessage);
    (error as Error & { code?: string }).code = payload?.error?.code;
    throw error;
  }

  return {
    server: payload.server,
    rootPassword: payload.root_password,
  };
}

export async function deleteHetznerServer(serverId: string | number) {
  const token = process.env.HETZNER_API_TOKEN;
  if (!token) {
    throw new Error("HETZNER_API_TOKEN is not set");
  }

  const response = await fetch(`${HCLOUD_API}/servers/${serverId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok && response.status !== 404) {
    const payload = (await response.json()) as { error?: { message?: string } };
    const message =
      payload?.error?.message ||
      `Hetzner API error: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }
}
