import { describe, expect, it } from "vitest";
import { getManagedProxyToken } from "./managed-proxy-auth";

describe("getManagedProxyToken", () => {
  it("prefers x-api-key", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-api-key": "token-from-header",
        authorization: "Bearer ignored-token",
      },
    });

    expect(getManagedProxyToken(request as never)).toBe("token-from-header");
  });

  it("falls back to bearer authorization", () => {
    const request = new Request("https://example.com", {
      headers: {
        authorization: "Bearer token-from-bearer",
      },
    });

    expect(getManagedProxyToken(request as never)).toBe("token-from-bearer");
  });

  it("returns an empty string when no managed proxy token is present", () => {
    const request = new Request("https://example.com");

    expect(getManagedProxyToken(request as never)).toBe("");
  });
});
