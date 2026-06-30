import { createTool } from '@mastra/core/tools';
import nullThrows from 'capital-t-null-throws';
import { getJson } from 'serpapi';
import { z } from 'zod';

const OrganicResultSchema = z.object({
  position: z.number(),
  title: z.string(),
  link: z.string(),
  snippet: z.string().optional(),
  source: z.string().optional(),
});

export const webSearchTool = createTool({
  id: 'web-search',
  description:
    'Search the web using Google and return organic results. Use for researching market trends, competitor analysis, Reddit/HN discussions, pain points, pricing, and any current information.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    numResults: z.number().int().min(1).max(10).default(5).describe('Number of results to return'),
  }),
  outputSchema: z.object({
    results: z.array(OrganicResultSchema),
    totalResults: z.string().optional(),
  }),
  execute: async ({ query, numResults }) => {
    const apiKey = nullThrows(
      process.env.SERPAPI_API_KEY,
      'SERPAPI_API_KEY environment variable is not set',
    );

    const raw = await getJson({
      engine: 'google',
      api_key: apiKey,
      q: query,
      num: numResults,
      gl: 'us',
      hl: 'en',
    });

    const results = (raw.organic_results ?? []).slice(0, numResults).map((r: Record<string, unknown>, i: number) => ({
      position: typeof r.position === 'number' ? r.position : i + 1,
      title: String(r.title ?? ''),
      link: String(r.link ?? ''),
      snippet: r.snippet ? String(r.snippet) : undefined,
      source: r.source ? String(r.source) : undefined,
    }));

    return {
      results,
      totalResults: raw.search_information?.total_results
        ? String(raw.search_information.total_results)
        : undefined,
    };
  },
});
