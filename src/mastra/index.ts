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
import { marketResearchAgent } from './agents/market-research-agent';

import travelWorkflow from './workflows/travel-workflow';
import { flightDealsTool } from './tools/flight-deals-tool';
import { airportTool } from './tools/airport-tool';
import { flightTool } from './tools/flight-tool';
import { hotelTool } from './tools/hotel-tool';
import { sendItineraryTool } from './tools/send-itinerary-tool';
import { webSearchTool } from './tools/web-search-tool';
import { saveResearchReportTool } from './tools/save-research-report-tool';
import { ceoAgent } from './agents/ceo-agent';
import {
  ideaScoringCriteriaScorer,
  delegationSpecificityScorer,
  mvpDisciplineScorer,
  phaseAwarenessScorer,
} from './scorers/ceo-scorers';
import { engineerAgent } from './agents/engineer-agent';
import { createGithubRepoTool } from './tools/create-github-repo-tool';
import { scaffoldProjectTool } from './tools/scaffold-project-tool';
import { installPackagesTool } from './tools/install-packages-tool';
import { writeFileTool } from './tools/write-file-tool';
import { landingPageAgent } from './agents/landing-page-agent';
import { generateLandingPageTool } from './tools/generate-landing-page-tool';
import { generateSignupApiTool } from './tools/generate-signup-api-tool';
import { deployLandingPageTool } from './tools/deploy-landing-page-tool';
import { readSignupsTool } from './tools/read-signups-tool';

export const mastra = new Mastra({
  workflows: { travelWorkflow },
  agents: { travelAgent, ceoAgent, marketResearchAgent, engineerAgent, landingPageAgent },
  tools: {
    flightDealsTool,
    airportTool,
    flightTool,
    hotelTool,
    sendItineraryTool,
    webSearchTool,
    saveResearchReportTool,
    createGithubRepoTool,
    scaffoldProjectTool,
    installPackagesTool,
    writeFileTool,
    generateLandingPageTool,
    generateSignupApiTool,
    deployLandingPageTool,
    readSignupsTool,
  },
  scorers: {
    ideaScoringCriteriaScorer,
    delegationSpecificityScorer,
    mvpDisciplineScorer,
    phaseAwarenessScorer,
  },
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
