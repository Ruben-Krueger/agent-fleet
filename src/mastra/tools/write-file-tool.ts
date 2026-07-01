import { createTool } from '@mastra/core/tools';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { z } from 'zod';

export const writeFileTool = createTool({
  id: 'write-file',
  description:
    'Writes a file (e.g. prisma/schema.prisma, .env.example, README.md) to a path inside the project directory. Path must be relative and cannot escape the project root.',
  requireApproval: true,
  inputSchema: z.object({
    projectDir: z.string().describe('Absolute path to the project root'),
    relativePath: z
      .string()
      .describe('Relative path within the project, e.g. "prisma/schema.prisma" or ".env.example"'),
    content: z.string().describe('Full file content to write'),
  }),
  outputSchema: z.object({
    writtenPath: z.string(),
  }),
  execute: async ({ projectDir, relativePath, content }) => {
    if (!isAbsolute(projectDir)) throw new Error('projectDir must be an absolute path');

    const resolvedTarget = resolve(projectDir, relativePath);
    const normalizedRoot = normalize(projectDir);

    // Prevent path traversal outside the project root
    if (!resolvedTarget.startsWith(normalizedRoot + '/') && resolvedTarget !== normalizedRoot) {
      throw new Error(`Path "${relativePath}" escapes the project root`);
    }

    await mkdir(dirname(resolvedTarget), { recursive: true });
    await writeFile(resolvedTarget, content, 'utf8');

    return { writtenPath: join(projectDir, relativePath) };
  },
});
