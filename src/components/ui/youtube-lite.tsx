'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Play } from 'lucide-react';

const isValidYouTubeId = (value: string) => /^[a-zA-Z0-9_-]{11}$/.test(value);

type YouTubeLiteProps = {
  videoId: string;
  title: string;
  className?: string;
};

export function YouTubeLite({ videoId, title, className }: YouTubeLiteProps) {
  const [activated, setActivated] = useState(false);

  const validId = isValidYouTubeId(videoId);
  const thumbnailUrl = useMemo(() => {
    if (!validId) return '';
    // Use a light thumbnail request and only load the iframe after user intent.
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }, [validId, videoId]);

  const embedUrl = useMemo(() => {
    if (!validId) return '';
    const params = new URLSearchParams({
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
      autoplay: activated ? '1' : '0',
    });
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
  }, [activated, validId, videoId]);

  if (!validId) {
    return (
      <div
        className={[
          'flex aspect-video items-center justify-center rounded-2xl border border-[#efe4d9] bg-[#171512] text-[#f8f5f0]',
          className ?? '',
        ].join(' ')}
      >
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-[#f5d5c5]">
            Invalid YouTube ID
          </p>
          <p className="mt-2 text-sm opacity-80">{videoId}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        'relative aspect-video overflow-hidden rounded-2xl border border-[#efe4d9] bg-[#fdf9f3]',
        className ?? '',
      ].join(' ')}
    >
      {activated ? (
        <iframe
          className="h-full w-full"
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      ) : (
        <button
          type="button"
          className="group absolute inset-0"
          onClick={() => setActivated(true)}
          aria-label={`Play video: ${title}`}
        >
          <Image
            src={thumbnailUrl}
            alt=""
            fill
            className="object-cover"
            loading="lazy"
            decoding="async"
          />

          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent opacity-90 transition group-hover:opacity-100" />

          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-[#171512] shadow-[0_24px_60px_-40px_rgba(23,21,18,0.6)] transition group-hover:scale-[1.03]">
              <Play className="h-5 w-5" />
            </span>
          </span>

          <span className="pointer-events-none absolute bottom-3 left-3 right-3 text-left text-xs font-medium text-white/95 drop-shadow">
            {title}
          </span>
        </button>
      )}
    </div>
  );
}

