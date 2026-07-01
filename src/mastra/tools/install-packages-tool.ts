import { createTool } from '@mastra/core/tools';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';

// Matches valid npm package names including scoped packages (@org/pkg)
const NPM_PACKAGE_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[\w.*^~-]+)?$/;

export const installPackagesTool = createTool({
  id: 'install-packages',
  description:
    'Runs npm install for a list of packages in the specified project directory. Validates package names before running.',
  requireApproval: true,
  inputSchema: z.object({
    projectDir: z.string().describe('Absolute path to the project root (where package.json lives)'),
    packages: z
      .array(z.string().regex(NPM_PACKAGE_RE, 'Invalid npm package name'))
      .min(1)
      .max(20)
      .describe('List of packages to install, e.g. ["stripe", "@auth/prisma-adapter", "resend"]'),
    dev: z.boolean().default(false).describe('Install as devDependencies'),
  }),
  outputSchema: z.object({
    installed: z.array(z.string()),
  }),
  execute: async ({ projectDir, packages, dev }) => {
    const args = ['install', ...packages];
    if (dev) args.push('--save-dev');

    const result = spawnSync('npm', args, {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 120_000,
    });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || 'npm install failed');

    return { installed: packages };
  },
});
