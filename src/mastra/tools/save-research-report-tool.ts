import { createTool } from '@mastra/core/tools';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const RESEARCH_DIR = 'research';

export const saveResearchReportTool = createTool({
  id: 'save-research-report',
  description:
    'Saves a completed market research report as a markdown file in the research/ directory of the project.',
  inputSchema: z.object({
    title: z.string().describe('Short title for the report, e.g. "AI Code Review Tools"'),
    content: z.string().describe('Full markdown content of the research report'),
  }),
  outputSchema: z.object({
    writtenPath: z.string(),
  }),
  execute: async ({ title, content }) => {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `${date}-${slug || 'report'}.md`;
    const relativePath = join(RESEARCH_DIR, fileName);

    await mkdir(join(process.cwd(), RESEARCH_DIR), { recursive: true });
    await writeFile(join(process.cwd(), relativePath), content, 'utf8');

    return { writtenPath: relativePath };
  },
});
