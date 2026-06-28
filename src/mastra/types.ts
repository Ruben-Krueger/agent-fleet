// ── Shared schemas ──────────────────────────────────────────────────────────

import z from 'zod';

export const DealSchema = z.object({
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

const HotelOptionSchema = z.object({
  name: z.string(),
  rating: z.number().optional(),
  pricePerNight: z.number().optional(),
  totalPrice: z.number().optional(),
  link: z.string().optional(),
});

export const ItinerarySchema = z.object({
  destination: z.string(),
  destinationCountry: z.string().optional(),
  arrivalAirportCode: z.string(),
  flightPrice: z.number(),
  flightAirline: z.string().optional(),
  flightDurationMinutes: z.number().optional(),
  stops: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  flightLink: z.string().optional(),
  hotels: z.object({
    budget: HotelOptionSchema.optional(),
    midRange: HotelOptionSchema.optional(),
    luxury: HotelOptionSchema.optional(),
  }),
  totalCost: z.number(),
});

export const REGION_ALIASES: Record<string, string> = {
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
