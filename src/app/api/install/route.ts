import { NextRequest, NextResponse } from 'next/server';
import { getInstallScript } from '@/lib/install/install-script';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const version = searchParams.get('v') || '1.0.0';
  const rawLang = searchParams.get('lang');
  const rawSid = searchParams.get('sid');
  const rawNoninteractive = searchParams.get('noninteractive');
  const channel = searchParams.get('channel') || 'stable';

  const langPattern = /^[A-Za-z0-9-]+$/;
  const sidPattern = /^[A-Za-z0-9]{12}$/;

  if (rawSid && !sidPattern.test(rawSid)) {
    return new NextResponse('Invalid sid', { status: 400 });
  }

  if (rawLang && !langPattern.test(rawLang)) {
    return new NextResponse('Invalid lang', { status: 400 });
  }

  const sid = rawSid ?? '';
  const lang = rawLang ?? 'en';
  const noninteractive = rawNoninteractive === '1';

  const injectedLines = [
    sid ? `SID="${sid}"` : '',
    `LANG="${lang}"`,
    noninteractive ? 'NONINTERACTIVE="1"' : '',
  ].filter(Boolean);

  const injectedBlock =
    injectedLines.length > 0 ? `${injectedLines.join('\n')}\n` : '';
  const rawScript = getInstallScript();

  let script = rawScript;
  if (injectedBlock) {
    const lines = rawScript.split('\n');
    if (lines[0]?.startsWith('#!')) {
      script = [lines[0], injectedBlock.trimEnd(), ...lines.slice(1)].join(
        '\n'
      );
    } else {
      script = `${injectedBlock}${rawScript}`;
    }
  }

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control':
        rawSid || searchParams.has('lang') || searchParams.has('noninteractive')
          ? 'no-store'
          : 'public, max-age=3600',
      'X-MoltBot-Version': version,
      'X-MoltBot-Channel': channel,
    },
  });
}
