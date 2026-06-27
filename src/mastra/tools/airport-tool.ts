import { createTool } from '@mastra/core/tools';
import { createRequire } from 'module';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const airportData = require('airport-codes/airports.json') as RawAirport[];

type RawAirport = {
    iata: string;
    name: string;
    city: string;
    country: string;
    tz: string;
};

const AirportSchema = z.object({
    iata: z.string(),
    name: z.string(),
    city: z.string(),
    country: z.string(),
    timezone: z.string(),
});

const AirportSearchResultSchema = z.object({
    airports: z.array(AirportSchema),
    total: z.number(),
});

// Common multi-airport regions not captured by a single city name
const REGION_ALIASES: Record<string, string[]> = {
    'bay area': ['SFO', 'OAK', 'SJC'],
    'san francisco': ['SFO', 'OAK', 'SJC'],
    'nyc': ['JFK', 'LGA', 'EWR'],
    'new york': ['JFK', 'LGA', 'EWR'],
    'dc': ['DCA', 'IAD', 'BWI'],
    'washington dc': ['DCA', 'IAD', 'BWI'],
    'los angeles': ['LAX', 'BUR', 'LGB', 'SNA'],
    'socal': ['LAX', 'BUR', 'LGB', 'SNA'],
    'south florida': ['MIA', 'FLL', 'PBI'],
    'dallas': ['DFW', 'DAL'],
    'houston': ['IAH', 'HOU'],
    'chicago': ['ORD', 'MDW'],
    'boston': ['BOS', 'MHT', 'PVD'],
    'seattle': ['SEA', 'BFI'],
};

export const airportTool = createTool({
    id: 'find-airports',
    description:
        'Find airports near a given city, region, or country. Returns IATA codes suitable for use with the flight search tool.',
    inputSchema: z.object({
        location: z
            .string()
            .describe(
                'City, region, or country to search for airports (e.g. "San Francisco", "Bay Area", "Japan", "New York")',
            ),
        country: z
            .string()
            .optional()
            .describe('Optional country name to narrow results (e.g. "United States", "France")'),
        maxResults: z
            .number()
            .int()
            .min(1)
            .max(20)
            .default(5)
            .describe('Maximum number of airports to return'),
    }),
    outputSchema: AirportSearchResultSchema,
    execute: async (input) => {
        const query = input.location.toLowerCase().trim();

        // Check region aliases first
        const aliasKey = Object.keys(REGION_ALIASES).find(
            k => query === k || query.includes(k) || k.includes(query),
        );
        if (aliasKey) {
            const iataCodes = REGION_ALIASES[aliasKey];
            const results = airportData
                .filter(a => a.iata && iataCodes.includes(a.iata))
                .map(a => ({ iata: a.iata, name: a.name, city: a.city, country: a.country, timezone: a.tz }));
            return { airports: results, total: results.length };
        }

        // Full-text search on city, airport name, and country
        const countryFilter = input.country?.toLowerCase();
        const matches = airportData.filter(a => {
            if (!a.iata) return false;
            const matchesLocation =
                a.city.toLowerCase().includes(query) ||
                a.name.toLowerCase().includes(query) ||
                a.country.toLowerCase().includes(query);
            const matchesCountry = !countryFilter || a.country.toLowerCase().includes(countryFilter);
            return matchesLocation && matchesCountry;
        });

        const airports = matches.slice(0, input.maxResults).map(a => ({
            iata: a.iata,
            name: a.name,
            city: a.city,
            country: a.country,
            timezone: a.tz,
        }));

        return AirportSearchResultSchema.parse({ airports, total: matches.length });
    },
});
