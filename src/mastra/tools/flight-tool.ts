import { createTool } from '@mastra/core/tools';
import { getJson } from 'serpapi';
import { z } from 'zod';
import nullThrows from 'capital-t-null-throws';

const FlightSegmentSchema = z.object({
  airline: z.string(),
  flightNumber: z.string(),
  departure: z.string(),
  arrival: z.string(),
  departureAirport: z.string(),
  arrivalAirport: z.string(),
  durationMinutes: z.number(),
});

const FlightOfferSchema = z.object({
  price: z.number(),
  totalDurationMinutes: z.number(),
  stops: z.number(),
  segments: z.array(FlightSegmentSchema),
  bookingToken: z.string().optional(),
});

const FlightSearchResultSchema = z.object({
  bestFlights: z.array(FlightOfferSchema),
  otherFlights: z.array(FlightOfferSchema),
  priceInsights: z
    .object({
      lowestPrice: z.number().optional(),
      priceLevel: z.string().optional(),
      typicalRangeLow: z.number().optional(),
      typicalRangeHigh: z.number().optional(),
    })
    .optional(),
});

const TRAVEL_CLASS_MAP = {
  economy: '1',
  premium_economy: '2',
  business: '3',
  first: '4',
} as const;

type TravelClass = keyof typeof TRAVEL_CLASS_MAP;

export const flightTool = createTool({
  id: 'search-flights',
  description:
    'Search for flights between two airports using Google Flights. Returns best and other flight options with prices, durations, and stops.',
  inputSchema: z.object({
    originCode: z.string().describe('Origin airport IATA code (e.g. JFK, LAX)'),
    destinationCode: z.string().describe('Destination airport IATA code (e.g. CDG, NRT)'),
    outboundDateISO: z.string().describe('Departure date in YYYY-MM-DD format'),
    returnDate: z
      .string()
      .optional()
      .describe('Return date in YYYY-MM-DD format. Omit for one-way flights.'),
    adults: z.number().int().min(1).default(1).describe('Number of adult passengers'),
    travelClass: z
      .enum(Object.keys(TRAVEL_CLASS_MAP) as [TravelClass, ...TravelClass[]])
      .default('economy')
      .describe('Cabin class'),
    maxStops: z
      .enum(['0', '1', '2'])
      .optional()
      .describe('0=nonstop only, 1=1 stop max, 2=2 stops max'),
  }),
  outputSchema: FlightSearchResultSchema,
  execute: async (input) => {
    return await searchFlights(input);
  },
});

type FlightSearchInput = {
  originCode: string;
  destinationCode: string;
  outboundDateISO: string;
  returnDate?: string;
  adults?: number;
  travelClass?: TravelClass;
  maxStops?: '0' | '1' | '2';
};

const searchFlights = async (input: FlightSearchInput) => {
  const apiKey = nullThrows(
    process.env.SERPAPI_API_KEY,
    'SERPAPI_API_KEY environment variable is not set',
  );

  const params: Record<string, string | number> = {
    engine: 'google_flights',
    api_key: apiKey,
    departure_id: input.originCode.toUpperCase(),
    arrival_id: input.destinationCode.toUpperCase(),
    outbound_date: input.outboundDateISO,
    type: input.returnDate ? '1' : '2',
    adults: input.adults ?? 1,
    travel_class: TRAVEL_CLASS_MAP[input.travelClass ?? 'economy'],
  };

  if (input.returnDate) params.return_date = input.returnDate;
  if (input.maxStops !== undefined) params.stops = input.maxStops;

  const data = await getJson(params);

  const mapOffer = (flight: Record<string, unknown>): z.infer<typeof FlightOfferSchema> => {
    const segments = ((flight.flights as Record<string, unknown>[]) ?? []).map((seg) => ({
      airline: (seg.airline as string) ?? '',
      flightNumber: (seg.flight_number as string) ?? '',
      departure: (seg.departure_airport as Record<string, string>)?.time ?? '',
      arrival: (seg.arrival_airport as Record<string, string>)?.time ?? '',
      departureAirport: (seg.departure_airport as Record<string, string>)?.id ?? '',
      arrivalAirport: (seg.arrival_airport as Record<string, string>)?.id ?? '',
      durationMinutes: (seg.duration as number) ?? 0,
    }));

    return FlightOfferSchema.parse({
      price: flight.price,
      totalDurationMinutes: flight.total_duration,
      stops: Math.max(0, segments.length - 1),
      segments,
      bookingToken: flight.booking_token,
    });
  };

  const insights = data.price_insights as Record<string, unknown> | undefined;

  return FlightSearchResultSchema.parse({
    bestFlights: ((data.best_flights as Record<string, unknown>[]) ?? []).map(mapOffer),
    otherFlights: ((data.other_flights as Record<string, unknown>[]) ?? []).map(mapOffer),
    priceInsights: insights
      ? {
          lowestPrice: insights.lowest_price,
          priceLevel: insights.price_level,
          typicalRangeLow: (insights.typical_price_range as number[] | undefined)?.[0],
          typicalRangeHigh: (insights.typical_price_range as number[] | undefined)?.[1],
        }
      : undefined,
  });
};
