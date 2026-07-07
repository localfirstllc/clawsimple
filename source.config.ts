import { defineCollections, defineConfig } from 'fumadocs-mdx/config';
import { z } from 'zod';

export const blog = defineCollections({
  dir: 'content/blog',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.date().or(z.string()).optional(),
  }),
  type: 'doc',
});

export default defineConfig();
