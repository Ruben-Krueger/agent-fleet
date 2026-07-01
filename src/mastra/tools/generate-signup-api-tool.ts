import { createTool } from '@mastra/core/tools';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize } from 'node:path';
import { z } from 'zod';

export const generateSignupApiTool = createTool({
  id: 'generate-signup-api',
  description:
    'Generates a Vercel serverless function (api/signup.js) that captures landing page signups: logs each submission, persists it to a local JSON file during local dev, and optionally forwards it to a webhook URL in production. Also writes .env.example documenting the webhook variable.',
  requireApproval: true,
  inputSchema: z.object({
    projectDir: z
      .string()
      .describe('Absolute path to the landing page project directory (same one passed to generate-landing-page)'),
    ideaName: z.string().describe('Short name of the idea, used as the fallback label for signups'),
  }),
  outputSchema: z.object({
    apiPath: z.string(),
    envExamplePath: z.string(),
  }),
  execute: async ({ projectDir, ideaName }) => {
    if (!isAbsolute(projectDir)) throw new Error('projectDir must be an absolute path');

    const normalizedRoot = normalize(projectDir);
    const apiDir = join(normalizedRoot, 'api');
    const apiPath = join(apiDir, 'signup.js');
    const envExamplePath = join(normalizedRoot, '.env.example');

    const signupJs = `const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};

  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  const signup = { email, idea: ${JSON.stringify(ideaName)}, timestamp: new Date().toISOString() };

  // Always log so signups are visible in the Vercel dashboard function logs.
  console.log('SIGNUP', JSON.stringify(signup));

  // Local dev only: Vercel's production filesystem is read-only outside /tmp,
  // so this file only accumulates signups when run via \`vercel dev\`.
  if (!process.env.VERCEL) {
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const dataDir = path.join(process.cwd(), 'data');
      const dataFile = path.join(dataDir, 'signups.json');
      fs.mkdirSync(dataDir, { recursive: true });
      const existing = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : [];
      existing.push(signup);
      fs.writeFileSync(dataFile, JSON.stringify(existing, null, 2));
    } catch (err) {
      console.error('Failed to persist signup locally', err);
    }
  }

  // Optional: forward to a webhook (Slack, Discord, Zapier, etc.) for real-time
  // notifications once deployed, since production writes don't persist.
  if (process.env.SIGNUP_WEBHOOK_URL) {
    try {
      await fetch(process.env.SIGNUP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signup),
      });
    } catch (err) {
      console.error('Failed to forward signup to webhook', err);
    }
  }

  return res.status(200).json({ ok: true });
};
`;

    const envExample = `# Optional: POST each signup to this URL (Slack/Discord/Zapier incoming webhook)
# for real-time notifications once the page is deployed. Without it, signups
# are only visible in the Vercel function logs (and locally in data/signups.json).
SIGNUP_WEBHOOK_URL=
`;

    await mkdir(apiDir, { recursive: true });
    await writeFile(apiPath, signupJs, 'utf8');
    await writeFile(envExamplePath, envExample, 'utf8');

    return { apiPath, envExamplePath };
  },
});
