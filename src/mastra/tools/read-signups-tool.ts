import { createTool } from '@mastra/core/tools';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';

export const readSignupsTool = createTool({
  id: 'read-signups',
  description:
    'Reads the local data/signups.json file captured by the signup API during local dev (via `vercel dev`), so the agent can report signup counts against a validation threshold.',
  inputSchema: z.object({
    projectDir: z.string().describe('Absolute path to the landing page project directory'),
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
  execute: async ({ projectDir }) => {
    if (!isAbsolute(projectDir)) throw new Error('projectDir must be an absolute path');

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
