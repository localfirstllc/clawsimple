function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
}

function getBearerToken(request) {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function getRunnerToken(request) {
  const protocol = request.headers.get("sec-websocket-protocol") || "";
  for (const item of protocol.split(",")) {
    const trimmed = item.trim();
    if (trimmed.startsWith("token.")) return trimmed.slice("token.".length);
  }
  return "";
}

function getRoom(env, sid) {
  const id = env.RUNNER_NOTIFY_ROOM.idFromName(sid);
  return env.RUNNER_NOTIFY_ROOM.get(id);
}

function getVerifyCacheTtlMs(env) {
  const raw = Number.parseInt(env.RUNNER_NOTIFY_VERIFY_CACHE_TTL_SECONDS || "", 10);
  const seconds = Number.isFinite(raw) && raw >= 0 ? raw : 24 * 60 * 60;
  return Math.min(seconds, 7 * 24 * 60 * 60) * 1000;
}

async function sha256Hex(value) {
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyRunnerWithControlPlane(token, env, sid) {
  const baseUrl = (env.CONTROL_PLANE_URL || "https://example.com").replace(/\/+$/, "");
  const response = await fetch(
    `${baseUrl}/api/deploy/${encodeURIComponent(sid)}/runner/auth/verify`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    }
  );
  return response.ok;
}

export class RunnerNotifyRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async verifyRunner(request, sid) {
    const token = getRunnerToken(request);
    if (!sid || !token) return false;

    const tokenHash = await sha256Hex(token);
    const cacheKey = `runner-verify:${sid}:${tokenHash}`;
    const cached = await this.state.storage.get(cacheKey);
    if (cached && typeof cached.expiresAt === "number" && cached.expiresAt > Date.now()) {
      return true;
    }

    const ok = await verifyRunnerWithControlPlane(token, this.env, sid);
    if (!ok) {
      await this.state.storage.delete(cacheKey);
      return false;
    }

    const ttlMs = getVerifyCacheTtlMs(this.env);
    if (ttlMs > 0) {
      await this.state.storage.put(cacheKey, { expiresAt: Date.now() + ttlMs });
    }
    return true;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/connect") {
      const sid = (url.searchParams.get("sid") || "").trim();
      const verified = await this.verifyRunner(request, sid);
      if (!verified) return json({ ok: false, error: "unauthorized" }, { status: 401 });

      if (request.headers.get("upgrade") !== "websocket") {
        return json({ ok: false, error: "websocket_required" }, { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      server.send(JSON.stringify({ type: "connected" }));
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: { "sec-websocket-protocol": "clawsimple.runner" },
      });
    }

    if (url.pathname === "/notify") {
      let payload = {};
      try {
        payload = await request.json();
      } catch {
        payload = {};
      }
      const message = JSON.stringify({
        type: "job_available",
        job_id: typeof payload.job_id === "string" ? payload.job_id : undefined,
        ts: Date.now(),
      });
      let delivered = 0;
      for (const socket of this.state.getWebSockets()) {
        try {
          socket.send(message);
          delivered += 1;
        } catch {
          try {
            socket.close(1011, "send_failed");
          } catch {
            // ignore close failures
          }
        }
      }
      return json({ ok: true, delivered });
    }

    return json({ ok: false, error: "not_found" }, { status: 404 });
  }

  webSocketMessage(socket, message) {
    if (message === "ping") socket.send("pong");
  }

  webSocketClose() {
    // Hibernation tracks attached sockets for us.
  }

  webSocketError() {
    // Hibernation tracks attached sockets for us.
  }
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true });
    }

    if (url.pathname === "/connect") {
      const sid = (url.searchParams.get("sid") || "").trim();
      if (!sid) return json({ ok: false, error: "missing_sid" }, { status: 400 });
      return getRoom(env, sid).fetch(request);
    }

    const notifyMatch = url.pathname.match(/^\/notify\/([^/]+)$/);
    if (request.method === "POST" && notifyMatch) {
      const secret = env.RUNNER_NOTIFY_SECRET || "";
      if (!secret || getBearerToken(request) !== secret) {
        return json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
      const sid = decodeURIComponent(notifyMatch[1] || "").trim();
      if (!sid) return json({ ok: false, error: "missing_sid" }, { status: 400 });
      return getRoom(env, sid).fetch(
        new Request("https://runner-notify.internal/notify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: await request.text(),
        })
      );
    }

    return json({ ok: false, error: "not_found" }, { status: 404 });
  },
};

export default worker;
