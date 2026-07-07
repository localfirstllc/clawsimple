export const AUTH_HINT_KEY = "clawsimple.auth_hint";
export const AUTH_HINT_CHANGED_EVENT = "clawsimple.auth_hint_changed";

export function readAuthHint() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AUTH_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAuthHint() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTH_HINT_KEY, "1");
    window.dispatchEvent(new Event(AUTH_HINT_CHANGED_EVENT));
  } catch {
    // Ignore storage failures; protected routes still validate the session.
  }
}

export function clearAuthHint() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_HINT_KEY);
    window.dispatchEvent(new Event(AUTH_HINT_CHANGED_EVENT));
  } catch {
    // Ignore storage failures; protected routes still validate the session.
  }
}
