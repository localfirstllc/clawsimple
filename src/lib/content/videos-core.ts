export const VIDEO_SURFACES = ["home_openclaw", "deploy_clawsimple"] as const;

export type VideoSurface = (typeof VIDEO_SURFACES)[number];

export type VideoEntry = {
  id: string;
  title: string;
};

export const defaultVideos: Record<VideoSurface, VideoEntry[]> = {
  home_openclaw: [
    {
      id: "LV6Juz0xcrY",
      title: "OpenClaw Use Cases that are Actually Helpful! (ClawdBot)",
    },
    {
      id: "8kNv3rjQaVA",
      title: "21 INSANE Use Cases For OpenClaw...",
    },
    {
      id: "bzWI3Dil9Ig",
      title: "My Multi-Agent Team with OpenClaw",
    },
    {
      id: "ssYt09bCgUY",
      title: "The wild rise of OpenClaw...",
    },
    {
      id: "Qkqe-uRhQJE",
      title: "ClawdBot is the most powerful AI tool I've ever used in my life. Here's how to set it up",
    },
  ],
  deploy_clawsimple: [
    { id: "RDXonMd33M8", title: "How to Set Up OpenClaw" },
    { id: "bXTI0Rg04m8", title: "OpenClaw Setup Walkthrough" },
  ],
};

export function isVideoSurface(value: unknown): value is VideoSurface {
  return typeof value === "string" && VIDEO_SURFACES.includes(value as VideoSurface);
}

export function normalizeYouTubeVideoId(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
    }
    if (url.hostname.includes("youtube.com")) {
      const videoParam = url.searchParams.get("v")?.trim() ?? "";
      if (/^[A-Za-z0-9_-]{11}$/.test(videoParam)) return videoParam;
      const segments = url.pathname.split("/").filter(Boolean);
      const candidate = segments[1] ?? "";
      if (
        (segments[0] === "embed" || segments[0] === "shorts" || segments[0] === "live") &&
        /^[A-Za-z0-9_-]{11}$/.test(candidate)
      ) {
        return candidate;
      }
    }
  } catch {
    return "";
  }
  return "";
}

export function getDefaultVideoTitle(
  surface: VideoSurface,
  youtubeVideoId: string | null | undefined
) {
  if (!youtubeVideoId) return null;
  const normalized = normalizeYouTubeVideoId(youtubeVideoId);
  if (!normalized) return null;
  const matched = defaultVideos[surface].find((video) => video.id === normalized);
  return matched?.title ?? null;
}
