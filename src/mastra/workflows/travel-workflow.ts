import { createWorkflow, createStep } from '@mastra/core/workflows';
import { createRequire } from 'module';
import nullThrows from 'capital-t-null-throws';
import { getJson } from 'serpapi';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const airportData = require('airport-codes/airports.json') as Array<{
  iata: string;
  name: string;
  city: string;
  country: string;
}>;

// ── Shared schemas ──────────────────────────────────────────────────────────

const DealSchema = z.object({
  destinationName: z.string(),
  destinationCountry: z.string().optional(),
  arrivalAirportCode: z.string(),
  price: z.number(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  flightDurationMinutes: z.number().optional(),
  stops: z.number().optional(),
  airline: z.string().optional(),
});

const ItinerarySchema = z.object({
  destination: z.string(),
  destinationCountry: z.string().optional(),
  arrivalAirportCode: z.string(),
  flightPrice: z.number(),
  flightAirline: z.string().optional(),
  flightDurationMinutes: z.number().optional(),
  stops: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  hotelName: z.string().optional(),
  hotelRating: z.number().optional(),
  hotelPricePerNight: z.number().optional(),
  hotelTotalPrice: z.number().optional(),
  totalCost: z.number(),
});

// ── Region aliases (fallback to primary IATA) ───────────────────────────────

const REGION_ALIASES: Record<string, string> = {
  'bay area': 'SFO',
  'san francisco': 'SFO',
  nyc: 'JFK',
  'new york': 'JFK',
  dc: 'DCA',
  'washington dc': 'DCA',
  'los angeles': 'LAX',
  la: 'LAX',
  chicago: 'ORD',
  boston: 'BOS',
  miami: 'MIA',
  seattle: 'SEA',
  dallas: 'DFW',
  houston: 'IAH',
  denver: 'DEN',
  atlanta: 'ATL',
  phoenix: 'PHX',
  'las vegas': 'LAS',
  minneapolis: 'MSP',
  detroit: 'DTW',
  portland: 'PDX',
  philadelphia: 'PHL',
  charlotte: 'CLT',
};

// ── Step 1: Resolve starting city → IATA code ──────────────────────────────

const resolveOriginStep = createStep({
  id: 'resolve-origin',
  inputSchema: z.object({
    start: z.string().describe('Starting city, region, or IATA airport code'),
  }),
  outputSchema: z.object({
    originCode: z.string(),
    originCity: z.string(),
  }),
  execute: async ({ inputData }) => {
    const raw = inputData.start.trim();

    // Already an IATA code
    if (/^[A-Z]{3}$/i.test(raw)) {
      const match = airportData.find((a) => a.iata?.toUpperCase() === raw.toUpperCase());
      return { originCode: raw.toUpperCase(), originCity: match?.city ?? raw };
    }

    const query = raw.toLowerCase();

    const aliasKey = Object.keys(REGION_ALIASES).find(
      (k) => query === k || query.includes(k) || k.includes(query),
    );
    if (aliasKey) {
      const code = REGION_ALIASES[aliasKey];
      const match = airportData.find((a) => a.iata === code);
      return { originCode: code, originCity: match?.city ?? raw };
    }

    const match = airportData.find((a) => a.iata && a.city.toLowerCase().includes(query));
    if (!match?.iata) {
      throw new Error(`Could not resolve an airport for: ${inputData.start}`);
    }

    return { originCode: match.iata, originCity: match.city };
  },
});

// ── Step 2: Discover cheap flight deals ────────────────────────────────────

const discoverDealsStep = createStep({
  id: 'discover-deals',
  inputSchema: z.object({
    originCode: z.string(),
    originCity: z.string(),
  }),
  outputSchema: z.object({
    deals: z.array(DealSchema),
    originCity: z.string(),
  }),
  execute: async ({ inputData }) => {
    const apiKey = nullThrows(
      process.env.SERPAPI_API_KEY,
      'SERPAPI_API_KEY environment variable is not set',
    );

    const data = await getJson({
      engine: 'google_flights_deals',
      api_key: apiKey,
      departure_id: inputData.originCode,
      currency: 'USD',
      gl: 'us',
      hl: 'en',
      travel_duration: '1', // 1-week trips
    });

    const rawDeals = (data.deals as Record<string, unknown>[]) ?? [];
    const deals = rawDeals.map((deal) => ({
      destinationName: (deal.name as string) ?? '',
      destinationCountry: (deal.country as string) ?? undefined,
      arrivalAirportCode: (deal.arrival_airport_code as string) ?? '',
      price: (deal.price as number) ?? 0,
      startDate: (deal.start_date as string) ?? undefined,
      endDate: (deal.end_date as string) ?? undefined,
      flightDurationMinutes: (deal.flight_duration as number) ?? undefined,
      stops: (deal.stops as number) ?? undefined,
      airline: (deal.airline as string) ?? undefined,
    }));

    return { deals, originCity: inputData.originCity };
  },
});

// ── Step 3: Search hotels for top deals and build itineraries ──────────────

const buildItinerariesStep = createStep({
  id: 'build-itineraries',
  inputSchema: z.object({
    deals: z.array(DealSchema),
    originCity: z.string(),
  }),
  outputSchema: z.object({
    itineraries: z.array(ItinerarySchema),
    originCity: z.string(),
  }),
  execute: async ({ inputData }) => {
    const apiKey = nullThrows(
      process.env.SERPAPI_API_KEY,
      'SERPAPI_API_KEY environment variable is not set',
    );

    // Take the 5 cheapest deals by flight price
    const topDeals = [...inputData.deals].sort((a, b) => a.price - b.price).slice(0, 5);

    const itineraryResults = await Promise.all(
      topDeals.map(async (deal) => {
        const checkIn =
          deal.startDate ?? new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0];
        const checkOut =
          deal.endDate ?? new Date(Date.now() + 14 * 86_400_000).toISOString().split('T')[0];

        try {
          const hotelData = await getJson({
            engine: 'google_hotels',
            q: deal.destinationName,
            check_in_date: checkIn,
            check_out_date: checkOut,
            adults: 1,
            currency: 'USD',
            sort_by: 3, // lowest price first
            api_key: apiKey,
          });

          const properties = (hotelData.properties as Record<string, unknown>[]) ?? [];
          const cheapest = properties[0] as Record<string, unknown> | undefined;

          const hotelPricePerNight = cheapest?.rate_per_night
            ? parseFloat(
                ((cheapest.rate_per_night as Record<string, string>).lowest ?? '0').replace(
                  /[^0-9.]/g,
                  '',
                ),
              )
            : undefined;

          const hotelTotalPrice = cheapest?.total_rate
            ? parseFloat(
                ((cheapest.total_rate as Record<string, string>).lowest ?? '0').replace(
                  /[^0-9.]/g,
                  '',
                ),
              )
            : undefined;

          return {
            destination: deal.destinationName,
            destinationCountry: deal.destinationCountry,
            arrivalAirportCode: deal.arrivalAirportCode,
            flightPrice: deal.price,
            flightAirline: deal.airline,
            flightDurationMinutes: deal.flightDurationMinutes,
            stops: deal.stops,
            startDate: deal.startDate,
            endDate: deal.endDate,
            hotelName: (cheapest?.name as string) ?? undefined,
            hotelRating: (cheapest?.overall_rating as number) ?? undefined,
            hotelPricePerNight,
            hotelTotalPrice,
            totalCost: deal.price + (hotelTotalPrice ?? 0),
          };
        } catch {
          // Hotel search failed — include the deal without hotel data
          return {
            destination: deal.destinationName,
            destinationCountry: deal.destinationCountry,
            arrivalAirportCode: deal.arrivalAirportCode,
            flightPrice: deal.price,
            flightAirline: deal.airline,
            flightDurationMinutes: deal.flightDurationMinutes,
            stops: deal.stops,
            startDate: deal.startDate,
            endDate: deal.endDate,
            totalCost: deal.price,
          };
        }
      }),
    );

    const itineraries = itineraryResults.sort((a, b) => a.totalCost - b.totalCost);

    return { itineraries, originCity: inputData.originCity };
  },
});

const travelWorkflow = createWorkflow({
  id: 'travel-workflow',
  inputSchema: z.object({
    start: z.string().describe('Starting city, region, or IATA airport code'),
  }),
  outputSchema: z.object({
    itineraries: z.array(ItinerarySchema),
    originCity: z.string(),
  }),
})
  .then(resolveOriginStep)
  .then(discoverDealsStep)
  .then(buildItinerariesStep)
  .commit();

export default travelWorkflow;
