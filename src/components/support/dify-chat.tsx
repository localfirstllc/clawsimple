'use client';

import Script from 'next/script';

interface DifyChatProps {
  token: string;
  baseUrl?: string;
}

export function DifyChat({
  token,
  baseUrl = 'https://udify.app',
}: DifyChatProps) {
  if (!token) return null;

  return (
    <>
      <Script id="dify-config" strategy="afterInteractive">
        {`
          window.difyChatbotConfig = {
            token: '${token}',
            baseUrl: '${baseUrl}',
          };
        `}
      </Script>
      <Script
        src={`${baseUrl}/embed.min.js`}
        id={token}
        strategy="afterInteractive"
        defer
      />
      <style>{`
        #dify-chatbot-bubble-button {
          background-color: #e2542a !important;
        }
        #dify-chatbot-bubble-window {
          width: 24rem !important;
          height: 40rem !important;
        }
      `}</style>
    </>
  );
}
