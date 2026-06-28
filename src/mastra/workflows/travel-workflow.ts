import { createWorkflow, createStep } from '@mastra/core/workflows';
import { createRequire } from 'module';
import { z } from 'zod';
import { FlightDealSchema, discoverFlightDeals } from '../tools/flight-deals-tool';
import { hotelResultSchema, searchHotels } from '../tools/hotel-tool';
import { buildItinerary, ItineraryOutputSchema } from '../tools/create-itinerary-tool';
import { sendItinerary } from '../tools/send-itinerary-tool';
import { REGION_ALIASES } from '../types';

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
    itineraries: z.array(ItineraryOutputSchema),
    originCity: z.string(),
  }),
  execute: async ({ inputData }) => {
    const itineraries = await Promise.all(
      inputData.dealsWithHotels.map(({ deal, hotels, checkIn, checkOut }) =>
        buildItinerary({
          destination: deal.destinationName,
          destinationCountry: deal.destinationCountry,
          outboundDate: checkIn,
          returnDate: checkOut,
          adults: 1,
          currency: 'USD',
          flightResults: {
            bestFlights: [
              {
                price: deal.price,
                totalDurationMinutes: deal.flightDurationMinutes ?? 0,
                stops: deal.stops ?? 0,
                segments: [
                  {
                    airline: deal.airline ?? '',
                    flightNumber: '',
                    departure: checkIn,
                    arrival: checkOut,
                    departureAirport: deal.departureAirportCode,
                    arrivalAirport: deal.arrivalAirportCode,
                    durationMinutes: deal.flightDurationMinutes ?? 0,
                  },
                ],
              },
            ],
            otherFlights: [],
          },
          hotelResults: {
            hotels,
            location: deal.destinationName,
            checkIn,
            checkOut,
          },
        }),
      ),
    );

    return {
      itineraries: itineraries.sort(
        (a: z.infer<typeof ItineraryOutputSchema>, b: z.infer<typeof ItineraryOutputSchema>) =>
          a.costs.cheapestTotal - b.costs.cheapestTotal,
      ),
      originCity: inputData.originCity,
    };
  },
});

// ── Step 5: Optionally email the top itinerary ────────────────────────────

type WorkflowInitData = { start: string; sendEmail?: boolean; emailAddress?: string };

const sendItineraryStep = createStep({
  id: 'send-itinerary',
  inputSchema: z.object({
    itineraries: z.array(ItineraryOutputSchema),
    originCity: z.string(),
  }),
  outputSchema: z.object({
    itineraries: z.array(ItineraryOutputSchema),
    originCity: z.string(),
  }),
  execute: async ({ inputData, getInitData }) => {
    const { sendEmail, emailAddress } = getInitData<WorkflowInitData>();
    const top = inputData.itineraries[0];

    if (sendEmail && emailAddress && top) {
      await sendItinerary({ address: emailAddress, itinerary: top });
    }

    return { itineraries: inputData.itineraries, originCity: inputData.originCity };
  },
});

const travelWorkflow = createWorkflow({
  id: 'travel-workflow',
  description: 'Find affordable vacations',
  inputSchema: z.object({
    start: z.string().describe('Starting city, region, or IATA airport code'),
    sendEmail: z.boolean().default(false).describe('Email the top itinerary'),
    emailAddress: z.string().optional().describe('Recipient email address'),
  }),
  outputSchema: z.object({
    itineraries: z.array(ItineraryOutputSchema),
    originCity: z.string(),
  }),
})
  .then(resolveOriginStep)
  .then(discoverDealsStep)
  .then(searchHotelsStep)
  .then(buildItinerariesStep)
  .then(sendItineraryStep)
  .commit();

export default travelWorkflow;
