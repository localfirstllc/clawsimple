import { describe, expect, it } from "vitest";
import { isVideoSurface, normalizeYouTubeVideoId } from "./videos-core";

describe("normalizeYouTubeVideoId", () => {
  it("accepts a raw video id", () => {
    expect(normalizeYouTubeVideoId("bXTI0Rg04m8")).toBe("bXTI0Rg04m8");
  });

  it("extracts from watch urls", () => {
    expect(
      normalizeYouTubeVideoId("https://www.youtube.com/watch?v=bXTI0Rg04m8&feature=youtu.be")
    ).toBe("bXTI0Rg04m8");
  });

  it("extracts from youtu.be urls", () => {
    expect(normalizeYouTubeVideoId("https://youtu.be/bXTI0Rg04m8")).toBe("bXTI0Rg04m8");
  });

  it("returns empty string for invalid values", () => {
    expect(normalizeYouTubeVideoId("https://example.com/video")).toBe("");
    expect(normalizeYouTubeVideoId("not-a-valid-video")).toBe("");
  });
});

describe("isVideoSurface", () => {
  it("recognizes supported surfaces", () => {
    expect(isVideoSurface("home_openclaw")).toBe(true);
    expect(isVideoSurface("deploy_clawsimple")).toBe(true);
    expect(isVideoSurface("other")).toBe(false);
  });
});
