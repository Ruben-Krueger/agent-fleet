import { createTool } from '@mastra/core/tools';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';

const LANDING_PAGES_DIR = 'landing-pages';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const generateLandingPageTool = createTool({
  id: 'generate-landing-page',
  description:
    'Generates a self-contained static landing page (index.html) with a hero, value props, and an email signup form that POSTs to /api/signup. Used to validate demand for a microSaaS idea before committing to a full build.',
  requireApproval: true,
  inputSchema: z.object({
    ideaSlug: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'ideaSlug must be lowercase letters, numbers, and hyphens only')
      .describe(
        `URL-safe slug for the idea (e.g. "appealmd-therapists"), used as the folder name under ${LANDING_PAGES_DIR}/. Use the same slug across generate-landing-page, generate-signup-api, deploy-landing-page, and read-signups so they operate on the same project.`,
      ),
    ideaName: z.string().describe('Short name of the idea, used as the page title'),
    headline: z.string().describe('Main hero headline, one sentence'),
    subheadline: z.string().describe('Supporting sentence under the headline'),
    problemStatement: z
      .string()
      .describe('The pain point in the customer\'s own words, e.g. "I wish I didn\'t have to..."'),
    valueProps: z
      .array(z.string())
      .min(2)
      .max(5)
      .describe('2-5 short bullet points describing what the product does for the user'),
    ctaText: z.string().default('Get early access').describe('Signup button text'),
    socialProof: z
      .string()
      .optional()
      .describe('Optional short trust line, e.g. "Join 40 people already on the waitlist"'),
  }),
  outputSchema: z.object({
    writtenPath: z.string(),
  }),
  execute: async ({
    ideaSlug,
    ideaName,
    headline,
    subheadline,
    problemStatement,
    valueProps,
    ctaText,
    socialProof,
  }) => {
    const projectDir = resolve('/tmp', LANDING_PAGES_DIR, ideaSlug);
    const resolvedTarget = join(projectDir, 'index.html');

    const valuePropsHtml = valueProps
      .map((prop) => `          <li>${escapeHtml(prop)}</li>`)
      .join('\n');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(ideaName)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1a1a2e;
      background: #fafafa;
      line-height: 1.5;
    }
    .wrap {
      max-width: 640px;
      margin: 0 auto;
      padding: 4rem 1.5rem 3rem;
    }
    h1 { font-size: 2.25rem; margin: 0 0 0.75rem; }
    .sub { font-size: 1.15rem; color: #4a4a5a; margin: 0 0 2rem; }
    .problem {
      background: #f0f0fa;
      border-left: 4px solid #4f46e5;
      padding: 1rem 1.25rem;
      border-radius: 0.25rem;
      font-style: italic;
      margin-bottom: 2rem;
    }
    ul.props { list-style: none; padding: 0; margin: 0 0 2rem; }
    ul.props li {
      padding: 0.6rem 0 0.6rem 1.75rem;
      position: relative;
    }
    ul.props li::before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #4f46e5;
      font-weight: bold;
    }
    form {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    input[type="email"] {
      flex: 1;
      min-width: 200px;
      padding: 0.75rem 1rem;
      font-size: 1rem;
      border: 1px solid #ccc;
      border-radius: 0.4rem;
    }
    button {
      padding: 0.75rem 1.5rem;
      font-size: 1rem;
      font-weight: 600;
      color: #fff;
      background: #4f46e5;
      border: none;
      border-radius: 0.4rem;
      cursor: pointer;
    }
    button:disabled { opacity: 0.6; cursor: default; }
    button:hover:not(:disabled) { background: #4338ca; }
    .status { margin-top: 0.75rem; font-size: 0.95rem; }
    .status.ok { color: #15803d; }
    .status.err { color: #b91c1c; }
    .social { margin-top: 1rem; font-size: 0.9rem; color: #6a6a7a; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(headline)}</h1>
    <p class="sub">${escapeHtml(subheadline)}</p>
    <p class="problem">${escapeHtml(problemStatement)}</p>
    <ul class="props">
${valuePropsHtml}
    </ul>
    <form id="signup-form">
      <input type="email" name="email" placeholder="you@company.com" required />
      <button type="submit">${escapeHtml(ctaText ?? 'Get early access')}</button>
    </form>
    <p id="status" class="status" role="status"></p>
    ${socialProof ? `<p class="social">${escapeHtml(socialProof)}</p>` : ''}
  </div>
  <script>
    const form = document.getElementById('signup-form');
    const status = document.getElementById('status');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = form.querySelector('button');
      const email = form.email.value;
      button.disabled = true;
      status.textContent = '';
      status.className = 'status';
      try {
        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, idea: ${JSON.stringify(ideaName)} }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Something went wrong');
        status.textContent = "You're on the list. We'll be in touch.";
        status.className = 'status ok';
        form.reset();
      } catch (err) {
        status.textContent = err.message;
        status.className = 'status err';
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>
`;

    await mkdir(projectDir, { recursive: true });
    await writeFile(resolvedTarget, html, 'utf8');

    return { writtenPath: resolvedTarget };
  },
});
