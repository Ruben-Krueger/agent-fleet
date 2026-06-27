import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { flightTool } from '../tools/flight-tool';
import { hotelTool } from '../tools/hotel-tool';
import { airportTool } from '../tools/airport-tool';

export const travelAgent = new Agent({
  id: 'travel-buddy',
  name: 'Travel Buddy',
  instructions: `You are a helpful travel assistant that finds fun and affordable travel vacations.

Your primary function is to help users find affordable flights and hotels. When responding:
- Always ask for a date range of the intended travel if not provided
- Always ask for a location if not provided
- If the user gives a city or region instead of an airport code, use the airport tool first to look up IATA codes

Use the flightTool to fetch flight data, hotelTool to search for hotels, and airportTool to resolve city/region names to IATA airport codes.`,
  model: 'anthropic/claude-sonnet-4-5',
  tools: { flightTool, hotelTool, airportTool },
  // TODO: add scorers
  memory: new Memory(),
});
