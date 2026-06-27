import { createTool } from '@mastra/core/tools';
import nullThrows from 'capital-t-null-throws';
import { getJson } from 'serpapi';
import { z } from 'zod';

const hotelResultSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  pricePerNight: z.number().optional(),
  totalPrice: z.number().optional(),
  rating: z.number().optional(),
  reviews: z.number().optional(),
  description: z.string().optional(),
  amenities: z.array(z.string()).optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  link: z.string().optional(),
});

export const hotelTool = createTool({
  id: 'get-hotels',
  description: 'Search for hotels and lodging at a destination using Google Hotels via SerpAPI',
  inputSchema: z.object({
    location: z.string().describe('Destination city or area (e.g. "Paris, France")'),
    checkIn: z.string().describe('Check-in date in YYYY-MM-DD format'),
    checkOut: z.string().describe('Check-out date in YYYY-MM-DD format'),
    adults: z.number().int().min(1).default(2).describe('Number of adult guests'),
    currency: z.string().default('USD').describe('Currency code for prices'),
    vacationRentals: z.boolean().default(false).describe('Include vacation rentals (Airbnb-style)'),
  }),
  outputSchema: z.object({
    hotels: z.array(hotelResultSchema),
    location: z.string(),
    checkIn: z.string(),
    checkOut: z.string(),
  }),
  execute: async ({
    location,
    checkIn,
    checkOut,
    adults = 2,
    currency = 'USD',
    vacationRentals = false,
  }) => {
    return await searchHotels({ location, checkIn, checkOut, adults, currency, vacationRentals });
  },
});

const serpApiPropertySchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
  overall_rating: z.number().optional(),
  reviews: z.number().optional(),
  amenities: z.array(z.string()).optional(),
  check_in_time: z.string().optional(),
  check_out_time: z.string().optional(),
  rate_per_night: z.object({ lowest: z.number().optional() }).optional(),
  total_rate: z.object({ lowest: z.number().optional() }).optional(),
  link: z.string().optional(),
});

const serpApiResponseSchema = z.object({
  properties: z.array(serpApiPropertySchema).optional(),
});

const searchHotels = async ({
  location,
  checkIn,
  checkOut,
  adults,
  currency,
  vacationRentals,
}: {
  location: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  currency: string;
  vacationRentals: boolean;
}) => {
  const apiKey = nullThrows(
    process.env.SERPAPI_API_KEY,
    'SERPAPI_API_KEY environment variable is not set',
  );

  const raw = await getJson({
    engine: 'google_hotels',
    q: location,
    check_in_date: checkIn,
    check_out_date: checkOut,
    adults: adults,
    currency: currency,
    vacation_rentals: vacationRentals,
    sort_by: 3, // lowest price first
    api_key: apiKey,
  });

  const response = serpApiResponseSchema.parse(raw);
  const properties = response.properties ?? [];

  const hotels = properties.map((p) => ({
    name: p.name,
    type: p.type,
    pricePerNight: p.rate_per_night?.lowest,
    totalPrice: p.total_rate?.lowest,
    rating: p.overall_rating,
    reviews: p.reviews,
    description: p.description,
    amenities: p.amenities,
    checkIn: p.check_in_time,
    checkOut: p.check_out_time,
    link: p.link,
  }));

  return { hotels, location, checkIn, checkOut };
};
