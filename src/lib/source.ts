import { blog } from '../../.source/server';
import { loader } from 'fumadocs-core/source';
import type { InferPageType } from 'fumadocs-core/source';

const LOCALE_SUFFIXES = ['zh-Hant', 'zh-Hans', 'ja'];

/**
 * Extract the content locale from the filename and return a path prefixed
 * with the locale to avoid duplicate slugs across language variants.
 *
 * content/blog/agent-deployment-strategies.mdx       → en/agent-deployment-strategies
 * content/blog/agent-deployment-strategies.ja.mdx    → ja/agent-deployment-strategies
 * content/blog/agent-deployment-strategies.zh-Hans.mdx → zh-Hans/agent-deployment-strategies
 */
function resolveLocalePath(rawPath: string): string {
  let stripped = rawPath.replace(/\.mdx$/, '');
  let locale = 'en';

  for (const suffix of LOCALE_SUFFIXES) {
    if (stripped.endsWith(`.${suffix}`)) {
      locale = suffix;
      stripped = stripped.slice(0, -(suffix.length + 1));
      break;
    }
  }

  return `${locale}/${stripped}`;
}

export const blogSource = loader({
  baseUrl: '/blog',
  source: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    files: Array.isArray(blog) ? blog.map((item: any) => ({
      path: resolveLocalePath(item.info.path),
      type: 'page' as const,
      data: item,
    })) : [],
  },
});

export type BlogPage = InferPageType<typeof blogSource>;
