import { createTool } from '@mastra/core/tools';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { z } from 'zod';

const LANDING_PAGES_DIR = 'landing-pages';

export const deployLandingPageTool = createTool({
  id: 'deploy-landing-page',
  description:
    'Deploys the landing page project to production using the Vercel CLI. Requires a VERCEL_TOKEN environment variable (no interactive `vercel login` needed) — see https://vercel.com/account/tokens. Returns the live deployment URL.',
  requireApproval: true,
  inputSchema: z.object({
    ideaSlug: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'ideaSlug must be lowercase letters, numbers, and hyphens only')
      .describe('Same slug passed to generate-landing-page, identifying the project folder under landing-pages/'),
    orgId: z
      .string()
      .optional()
      .describe('Optional Vercel org/team ID (VERCEL_ORG_ID) to pin the deploy to, for repeat non-interactive deploys'),
    projectId: z
      .string()
      .optional()
      .describe('Optional Vercel project ID (VERCEL_PROJECT_ID) to pin the deploy to, for repeat non-interactive deploys'),
  }),
  outputSchema: z.object({
    deploymentUrl: z.string(),
  }),
  execute: async ({ ideaSlug, orgId, projectId }) => {
    if (!process.env.VERCEL_TOKEN) {
      throw new Error(
        'VERCEL_TOKEN is not set. Generate a token at https://vercel.com/account/tokens and set it as an ' +
          'environment variable — the Vercel CLI reads it automatically, no `vercel login` required.',
      );
    }

    const projectDir = resolve('/tmp', LANDING_PAGES_DIR, ideaSlug);

    const result = spawnSync('npx', ['vercel', '--prod', '--yes'], {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 180_000,
      env: {
        ...process.env,
        ...(orgId ? { VERCEL_ORG_ID: orgId } : {}),
        ...(projectId ? { VERCEL_PROJECT_ID: projectId } : {}),
      },
    });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || 'vercel deploy failed');

    const lines = result.stdout.trim().split('\n').filter(Boolean);
    const deploymentUrl = lines[lines.length - 1]?.trim();
    if (!deploymentUrl || !deploymentUrl.startsWith('http')) {
      throw new Error(`Could not parse deployment URL from vercel output: ${result.stdout}`);
    }

    return { deploymentUrl };
  },
});
