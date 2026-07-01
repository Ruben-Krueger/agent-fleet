import { createTool } from '@mastra/core/tools';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';

const STACK_COMMANDS: Record<string, { bin: string; args: (name: string) => string[] }> = {
  'next-app-router': {
    bin: 'npx',
    args: (name) => [
      'create-next-app@latest', name,
      '--typescript', '--tailwind', '--app', '--eslint',
      '--src-dir', '--import-alias', '@/*', '--yes',
    ],
  },
  't3': {
    bin: 'npx',
    args: (name) => [
      'create-t3-app@latest', name,
      '--CI', '--trpc', '--prisma', '--tailwind', '--nextAuth',
    ],
  },
};

export const scaffoldProjectTool = createTool({
  id: 'scaffold-project',
  description:
    'Bootstraps a new project using a standard CLI (create-next-app or create-t3-app). Runs in the specified directory.',
  requireApproval: true,
  inputSchema: z.object({
    projectName: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/, 'Project name must only contain letters, numbers, hyphens, or underscores')
      .describe('Name of the project directory to create'),
    stack: z.enum(['next-app-router', 't3']).describe(
      'next-app-router: plain Next.js with App Router + Tailwind. t3: Next.js + tRPC + Prisma + NextAuth + Tailwind.',
    ),
    outputDir: z.string().describe('Absolute path to the parent directory where the project will be created'),
  }),
  outputSchema: z.object({
    projectPath: z.string(),
    stack: z.string(),
  }),
  execute: async ({ projectName, stack, outputDir }) => {
    const { bin, args } = STACK_COMMANDS[stack];

    const result = spawnSync(bin, args(projectName), {
      cwd: outputDir,
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, npm_config_yes: 'true' },
    });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || `${bin} failed`);

    return { projectPath: `${outputDir}/${projectName}`, stack };
  },
});
