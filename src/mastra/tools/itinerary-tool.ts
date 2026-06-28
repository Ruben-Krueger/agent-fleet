import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

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

const HotelResultSchema = z.object({
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

const HotelSearchResultSchema = z.object({
  hotels: z.array(HotelResultSchema),
  location: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
});

const ItineraryOutputSchema = z.object({
  destination: z.string(),
  destinationCountry: z.string().optional(),
  dates: z.object({
    outbound: z.string(),
    return: z.string().optional(),
    nights: z.number().optional(),
  }),
  flight: z.object({
    pricePerPerson: z.number(),
    totalFlightCost: z.number(),
    durationMinutes: z.number(),
    stops: z.number(),
    airline: z.string().optional(),
    segments: z.array(FlightSegmentSchema),
    bookingUrl: z.string().optional(),
  }),
  hotels: z.array(
    z.object({
      name: z.string(),
      rating: z.number().optional(),
      checkIn: z.string(),
      checkOut: z.string(),
      pricePerNight: z.number().optional(),
      totalPrice: z.number().optional(),
      amenities: z.array(z.string()).optional(),
      link: z.string().optional(),
    }),
  ),
  costs: z.object({
    flightSubtotal: z.number(),
    cheapestHotelSubtotal: z.number().optional(),
    cheapestTotal: z.number(),
    currency: z.string(),
    adults: z.number(),
  }),
});

export const itineraryTool = createTool({
  id: 'build-itinerary',
  description:
    'Combine flight and hotel search results into a complete vacation itinerary with itemized and total cost estimates. Call this after using search-flights and get-hotels to assemble a final trip plan.',
  inputSchema: z.object({
    destination: z.string().describe('Destination city or area name for display'),
    destinationCountry: z.string().optional().describe('Destination country'),
    outboundDate: z.string().describe('Departure date in YYYY-MM-DD format'),
    returnDate: z.string().optional().describe('Return date in YYYY-MM-DD format'),
    flightResults: FlightSearchResultSchema.describe('Full output from the search-flights tool'),
    hotelResults: HotelSearchResultSchema.describe('Full output from the get-hotels tool'),
    adults: z.number().int().min(1).default(1).describe('Number of adult travelers'),
    currency: z.string().default('USD').describe('Currency code for cost display'),
  }),
  outputSchema: ItineraryOutputSchema,
  execute: async ({
    destination,
    destinationCountry,
    outboundDate,
    returnDate,
    flightResults,
    hotelResults,
    adults,
    currency,
  }) => {
    // Pick cheapest available flight (bestFlights first, then otherFlights)
    const allFlights = [...flightResults.bestFlights, ...flightResults.otherFlights];
    const selectedFlight = allFlights.sort((a, b) => a.price - b.price)[0];
    if (!selectedFlight) throw new Error('No flights found in the provided flight results');

    // Pick 3 cheapest hotels by total price
    const topHotels = [...hotelResults.hotels]
      .filter((h) => h.totalPrice != null)
      .sort((a, b) => (a.totalPrice ?? Infinity) - (b.totalPrice ?? Infinity))
      .slice(0, 3);

    // Nights between hotel check-in and check-out dates
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const nights =
      hotelResults.checkIn && hotelResults.checkOut
        ? Math.round((+new Date(hotelResults.checkOut) - +new Date(hotelResults.checkIn)) / MS_PER_DAY)
        : undefined;

    const airline = selectedFlight.segments[0]?.airline;
    const originCode = selectedFlight.segments[0]?.departureAirport;
    const destCode = selectedFlight.segments[selectedFlight.segments.length - 1]?.arrivalAirport;
    const bookingUrl = selectedFlight.bookingToken
      ? `https://www.google.com/flights?booking_token=${selectedFlight.bookingToken}`
      : originCode && destCode
        ? `https://www.google.com/flights#flt=${originCode}.${destCode}.${outboundDate}${returnDate ? `*${destCode}.${originCode}.${returnDate}` : ''};c:${currency ?? 'USD'};e:1;sd:1;t:f`
        : undefined;
    const resolvedAdults = adults ?? 1;
    const flightSubtotal = selectedFlight.price * resolvedAdults;
    const cheapestHotelSubtotal = topHotels[0]?.totalPrice;

    return {
      destination,
      destinationCountry,
      dates: {
        outbound: outboundDate,
        return: returnDate,
        nights,
      },
      flight: {
        pricePerPerson: selectedFlight.price,
        totalFlightCost: flightSubtotal,
        durationMinutes: selectedFlight.totalDurationMinutes,
        stops: selectedFlight.stops,
        airline,
        segments: selectedFlight.segments,
        bookingUrl,
      },
      hotels: topHotels.map((h) => ({
        name: h.name,
        rating: h.rating,
        checkIn: hotelResults.checkIn,
        checkOut: hotelResults.checkOut,
        pricePerNight: h.pricePerNight,
        totalPrice: h.totalPrice,
        amenities: h.amenities,
        link: h.link,
      })),
      costs: {
        flightSubtotal,
        cheapestHotelSubtotal,
        cheapestTotal: flightSubtotal + (cheapestHotelSubtotal ?? 0),
        currency: currency ?? 'USD',
        adults: resolvedAdults,
      },
    };
  },
});
