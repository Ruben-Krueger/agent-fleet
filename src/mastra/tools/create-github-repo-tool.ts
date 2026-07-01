import { createTool } from '@mastra/core/tools';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';

export const createGithubRepoTool = createTool({
  id: 'create-github-repo',
  description:
    'Creates a new GitHub repository using the gh CLI. Requires gh to be authenticated. Returns the repo URL.',
  requireApproval: true,
  inputSchema: z.object({
    name: z
      .string()
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Repo name must only contain letters, numbers, hyphens, underscores, or dots')
      .describe('Repository name (no spaces)'),
    description: z.string().max(200).describe('Short description of the repository'),
    visibility: z.enum(['public', 'private']).default('private'),
    cloneDir: z
      .string()
      .describe('Absolute path to the directory where the repo should be cloned after creation'),
  }),
  outputSchema: z.object({
    repoUrl: z.string(),
    clonePath: z.string(),
  }),
  execute: async ({ name, description, visibility, cloneDir }) => {
    const result = spawnSync(
      'gh',
      ['repo', 'create', name, `--${visibility}`, '--description', description, '--clone'],
      { cwd: cloneDir, encoding: 'utf8', timeout: 30_000 },
    );

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || 'gh repo create failed');

    const repoUrl = `https://github.com/${result.stdout.trim().split('/').slice(-2).join('/')}`;
    return { repoUrl, clonePath: `${cloneDir}/${name}` };
  },
});
