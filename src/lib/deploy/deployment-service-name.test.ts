import { describe, expect, it } from "vitest";
import { resolveDeploymentServiceName } from "./deployment-service-name";

describe("resolveDeploymentServiceName", () => {
  it("returns the requested service name", () => {
    expect(
      resolveDeploymentServiceName("clawsimple", null, "SID123")
    ).toBe("clawsimple");
  });

  it("returns whatever string is passed", () => {
    expect(
      resolveDeploymentServiceName("other-service", {}, "")
    ).toBe("other-service");
  });

  it("ignores serverFingerprint and sid", () => {
    expect(
      resolveDeploymentServiceName(
        "my-service",
        { runtime_mode: "dedicated-hetzner" },
        "C27FMHJU7UUY"
      )
    ).toBe("my-service");
  });
});
