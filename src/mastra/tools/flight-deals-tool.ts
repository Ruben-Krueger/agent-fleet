import { createTool } from '@mastra/core/tools';
import nullThrows from 'capital-t-null-throws';
import { getJson } from 'serpapi';
import { z } from 'zod';

const RawDealSchema = z.object({
  name: z.string(),
  country: z.string().optional(),
  arrival_airport_code: z.string(),
  departure_airport_code: z.string(),
  price: z.number(),
  average_price: z.number().optional(),
  discount_percentage: z.number().optional(),
  outbound_date: z.string().optional(),
  return_date: z.string().optional(),
  flight_duration: z.number().optional(),
  stops: z.number().optional(),
  airline: z.string().optional(),
  flight_link: z.string().optional(),
  description: z.string().optional(),
  highlights: z.string().optional(),
});

const RawResponseSchema = z.object({
  deals: z.array(RawDealSchema).default([]),
  departure_informations: z.object({ airport_name: z.string().optional() }).optional(),
});

export const FlightDealSchema = z.object({
  destinationName: z.string(),
  destinationCountry: z.string().optional(),
  arrivalAirportCode: z.string(),
  departureAirportCode: z.string(),
  price: z.number(),
  averagePrice: z.number().optional(),
  discountPercentage: z.number().optional(),
  outboundDate: z.string().optional(),
  returnDate: z.string().optional(),
  flightDurationMinutes: z.number().optional(),
  stops: z.number().optional(),
  airline: z.string().optional(),
  flightLink: z.string().optional(),
  description: z.string().optional(),
  highlights: z.string().optional(),
});

export type FlightDeal = z.infer<typeof FlightDealSchema>;

export const flightDealsTool = createTool({
  id: 'discover-flight-deals',
  description:
    'Discover cheap flight deals from an origin airport to various destinations using Google Flights Deals. Returns a ranked list of affordable destinations without requiring a specific destination — great for "where should I go?" queries.',
  inputSchema: z.object({
    originCode: z.string().describe('Origin airport IATA code (e.g. JFK, LAX)'),
    outboundDate: z
      .string()
      .optional()
      .describe('Departure date in YYYY-MM-DD format. Omit for flexible dates.'),
    travelDuration: z
      .enum(['weekend', 'one-week', 'two-weeks'])
      .optional()
      .describe('Trip length: weekend (2-3 days), one-week, or two-weeks'),
    maxPrice: z.number().optional().describe('Maximum ticket price in USD'),
    currency: z.string().default('USD'),
    adults: z.number().int().min(1).default(1),
  }),
  outputSchema: z.object({
    deals: z.array(FlightDealSchema),
    originName: z.string().optional(),
  }),
  execute: async (input) => discoverFlightDeals(input),
});

// SerpAPI google_flights_deals travel_duration values
const TRAVEL_DURATION_MAP = {
  weekend: '2',
  'one-week': '1',
  'two-weeks': '3',
} as const;

export const discoverFlightDeals = async (input: {
  originCode: string;
  outboundDate?: string;
  travelDuration?: 'weekend' | 'one-week' | 'two-weeks';
  maxPrice?: number;
  currency?: string;
  adults?: number;
}) => {
  const apiKey = nullThrows(
    process.env.SERPAPI_API_KEY,
    'SERPAPI_API_KEY environment variable is not set',
  );

  const params: Record<string, string | number | undefined> = {
    engine: 'google_flights_deals',
    api_key: apiKey,
    departure_id: input.originCode.toUpperCase(),
    currency: input.currency ?? 'USD',
    gl: 'us',
    hl: 'en',
    adults: input.adults ?? 1,
    outbound_date: input.outboundDate,
    travelDuration: input.travelDuration ? TRAVEL_DURATION_MAP[input.travelDuration] : undefined,
    max_price: input.maxPrice,
  };

  const raw = RawResponseSchema.parse(await getJson(params));

  const deals = raw.deals.map((deal) => ({
    destinationName: deal.name,
    destinationCountry: deal.country,
    arrivalAirportCode: deal.arrival_airport_code,
    departureAirportCode: deal.departure_airport_code,
    price: deal.price,
    averagePrice: deal.average_price,
    discountPercentage: deal.discount_percentage,
    outboundDate: deal.outbound_date,
    returnDate: deal.return_date,
    flightDurationMinutes: deal.flight_duration,
    stops: deal.stops,
    airline: deal.airline,
    flightLink: deal.flight_link,
    description: deal.description,
    highlights: deal.highlights,
  }));

  return {
    deals,
    originName: raw.departure_informations?.airport_name,
  };
};
