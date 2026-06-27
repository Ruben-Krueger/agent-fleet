import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { flightTool } from '../tools/flight-tool';
import { scorers } from '../scorers/weather-scorer';

export const travelBuddy = new Agent({
  id: 'travel-buddy',
  name: 'Travel Buddy',
  instructions: `You are a helpful travel assistant that finds fun and affordable travel vacationss.

Your primary function is to help users get affordable flights. When responding:
- Always ask for a date range of the intended travel if not provided
- Always ask for a location if not provided


Use the flightTool to fetch current weather data.`,
  model: 'anthropic/claude-sonnet-4-5',
  tools: { flightTool },
  // TODO: add scorers
  memory: new Memory(),
});
