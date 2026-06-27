import { createTool } from '@mastra/core/tools';
import { z } from 'zod';


export const flightTool = createTool({
  id: 'get-weather',
  description: 'Get the flight data for a location',
  inputSchema: z.object({
    location: z.string().describe('City name'),
  }),
  outputSchema: z.object({
    temperature: z.number(),
  }),
  execute: async (inputData) => {
    return await getFlight(inputData.location);
  },
});

const getFlight = async (location: string) => {
  return null
};


