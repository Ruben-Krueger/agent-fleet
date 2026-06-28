import { createWorkflow, createStep } from '@mastra/core/workflows';
import { createRequire } from 'module';
import { z } from 'zod';
import { FlightDealSchema, discoverFlightDeals } from '../tools/flight-deals-tool';
import { hotelResultSchema, searchHotels } from '../tools/hotel-tool';
import { ItinerarySchema, REGION_ALIASES } from '../types';

const require = createRequire(import.meta.url);
const airportData = require('airport-codes/airports.json') as Array<{
  iata: string;
  name: string;
  city: string;
  country: string;
}>;

const DealWithHotelsSchema = z.object({
  deal: FlightDealSchema,
  hotels: z.array(hotelResultSchema),
  checkIn: z.string(),
  checkOut: z.string(),
});

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
    deals: z.array(FlightDealSchema),
    originCity: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { deals } = await discoverFlightDeals({ originCode: inputData.originCode });
    return { deals, originCity: inputData.originCity };
  },
});

// ── Step 3: Search hotels for each destination ─────────────────────────────

const searchHotelsStep = createStep({
  id: 'search-hotels',
  inputSchema: z.object({
    deals: z.array(FlightDealSchema),
    originCity: z.string(),
  }),
  outputSchema: z.object({
    dealsWithHotels: z.array(DealWithHotelsSchema),
    originCity: z.string(),
  }),
  execute: async ({ inputData }) => {
    const topDeals = [...inputData.deals]
      .filter((deal) => deal.outboundDate && deal.returnDate)
      .sort((a, b) => a.price - b.price)
      .slice(0, 5);

    const dealsWithHotels = await Promise.all(
      topDeals.map(async (deal) => {
        const checkIn = deal.outboundDate!;
        const checkOut = deal.returnDate!;

        try {
          const { hotels } = await searchHotels({
            location: deal.destinationName,
            checkIn,
            checkOut,
            adults: 1,
            currency: 'USD',
            vacationRentals: false,
          });
          return { deal, hotels, checkIn, checkOut };
        } catch {
          return { deal, hotels: [], checkIn, checkOut };
        }
      }),
    );

    return { dealsWithHotels, originCity: inputData.originCity };
  },
});

// ── Step 4: Build itineraries from deals + hotel results ───────────────────

const buildItinerariesStep = createStep({
  id: 'build-itineraries',
  inputSchema: z.object({
    dealsWithHotels: z.array(DealWithHotelsSchema),
    originCity: z.string(),
  }),
  outputSchema: z.object({
    itineraries: z.array(ItinerarySchema),
    originCity: z.string(),
  }),
  execute: async ({ inputData }) => {
    const itineraries = inputData.dealsWithHotels
      .map(({ deal, hotels }) => {
        const sorted = [...hotels].sort((a, b) => (a.totalPrice ?? 0) - (b.totalPrice ?? 0));
        const budget = sorted[0];
        const midRange =
          sorted.length > 1 ? sorted[Math.floor((sorted.length - 1) / 2)] : undefined;
        const luxury = sorted.length > 1 ? sorted[sorted.length - 1] : undefined;

        const toOption = (h: typeof budget | undefined) =>
          h
            ? {
                name: h.name,
                rating: h.rating,
                pricePerNight: h.pricePerNight,
                totalPrice: h.totalPrice,
                link: h.link,
              }
            : undefined;

        return {
          destination: deal.destinationName,
          destinationCountry: deal.destinationCountry,
          arrivalAirportCode: deal.arrivalAirportCode,
          flightPrice: deal.price,
          flightAirline: deal.airline,
          flightDurationMinutes: deal.flightDurationMinutes,
          stops: deal.stops,
          startDate: deal.outboundDate,
          endDate: deal.returnDate,
          flightLink: deal.flightLink,
          hotels: {
            budget: toOption(budget),
            midRange: toOption(midRange),
            luxury: toOption(luxury),
          },
          totalCost: deal.price + (budget?.totalPrice ?? 0),
        };
      })
      .sort((a, b) => a.totalCost - b.totalCost);

    return { itineraries, originCity: inputData.originCity };
  },
});

const travelWorkflow = createWorkflow({
  id: 'travel-workflow',
  description: 'Find affordable vacations',
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
  .then(searchHotelsStep)
  .then(buildItinerariesStep)
  .commit();

export default travelWorkflow;
