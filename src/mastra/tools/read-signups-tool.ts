import { createTool } from '@mastra/core/tools';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';

const LANDING_PAGES_DIR = 'landing-pages';

export const readSignupsTool = createTool({
  id: 'read-signups',
  description:
    'Reads the local data/signups.json file captured by the signup API during local dev (via `vercel dev`), so the agent can report signup counts against a validation threshold.',
  inputSchema: z.object({
    ideaSlug: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'ideaSlug must be lowercase letters, numbers, and hyphens only')
      .describe('Same slug passed to generate-landing-page, identifying the project folder under landing-pages/'),
  }),
  outputSchema: z.object({
    count: z.number(),
    signups: z.array(
      z.object({
        email: z.string(),
        idea: z.string(),
        timestamp: z.string(),
      }),
    ),
  }),
  execute: async ({ ideaSlug }) => {
    const projectDir = resolve('/tmp', LANDING_PAGES_DIR, ideaSlug);
    const dataFile = join(projectDir, 'data', 'signups.json');
    try {
      const raw = await readFile(dataFile, 'utf8');
      const signups = JSON.parse(raw);
      return { count: signups.length, signups };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { count: 0, signups: [] };
      }
      throw err;
    }
  },
});
