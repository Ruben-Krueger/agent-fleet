import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { flightTool } from '../tools/flight-tool';
import { flightDealsTool } from '../tools/flight-deals-tool';
import { hotelTool } from '../tools/hotel-tool';
import { airportTool } from '../tools/airport-tool';

export const travelAgent = new Agent({
  id: 'travel-buddy',
  name: 'Travel Buddy',
  instructions: `You are a helpful travel assistant that finds fun and affordable travel vacations.

Your primary function is to help users find affordable flights and hotels. When responding:
- If the user does NOT have a destination in mind, use the flightDealsTool to discover cheap destinations from their origin, then use hotelTool for the top picks
- If the user HAS a destination in mind, use the airportTool to resolve city names to IATA codes, then use flightTool and hotelTool
- Always ask for a starting location if not provided
- Ask for travel dates if the user has specific ones; otherwise use flightDealsTool which handles flexible dates automatically`,
  model: 'anthropic/claude-sonnet-4-5',
  tools: { flightTool, flightDealsTool, hotelTool, airportTool },
  memory: new Memory(),
});
