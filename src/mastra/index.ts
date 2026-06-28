import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from '@mastra/duckdb';
import { MastraCompositeStore } from '@mastra/core/storage';
import {
  Observability,
  MastraStorageExporter,
  MastraPlatformExporter,
  SensitiveDataFilter,
} from '@mastra/observability';
import { travelAgent } from './agents/travel-agent';

import travelWorkflow from './workflows/travel-workflow';
import { flightDealsTool } from './tools/flight-deals-tool';
import { airportTool } from './tools/airport-tool';
import { flightTool } from './tools/flight-tool';
import { hotelTool } from './tools/hotel-tool';
import { sendItineraryTool } from './tools/send-itinerary-tool';

export const mastra = new Mastra({
  workflows: { travelWorkflow },
  agents: { travelAgent },
  tools: { flightDealsTool, airportTool, flightTool, hotelTool, sendItineraryTool },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: 'mastra-storage',
      url: 'file:./mastra.db',
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    },
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
