import { createTool } from '@mastra/core/tools';
import nullThrows from 'capital-t-null-throws';
import { Resend } from 'resend';
import z from 'zod';

import { ItineraryOutputSchema } from './create-itinerary-tool';
// Email-safe itinerary builder.
// Design direction: a "concierge note / boarding pass" — deep forest + brass on warm
// paper, serif headline, monospaced flight data. All styling is INLINE because email
// clients (notably Outlook & Gmail) strip <head>/<style> and ignore modern CSS.

// --- design tokens -----------------------------------------------------------
const INK = '#14342B'; // deep forest — header band, section labels
const ACCENT = '#B9882E'; // brass — CTA + emphasized total
const PAPER = '#F4F2EC'; // page background
const CARD = '#FFFFFF';
const TEXT = '#2C3A34';
const MUTED = '#6B7A72';
const LINE = '#E2DFD6';
const ZEBRA = '#FAF9F5';

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'SF Mono', 'Roboto Mono', Menlo, Consolas, monospace";

// --- helpers -----------------------------------------------------------------

// Escape interpolated values — hotel names, airlines, URLs etc. are data and
// should never be trusted as raw HTML.
function esc(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// Small "label over value" stat cell used in the flight info strip.
function stat(label: string, value: string): string {
  return `
    <td align="center" style="padding:14px 8px;">
      <div style="font-family:${SANS};font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${esc(
        label,
      )}</div>
      <div style="font-family:${SANS};font-size:16px;font-weight:700;color:${TEXT};margin-top:4px;">${value}</div>
    </td>`;
}

function sectionLabel(text: string): string {
  return `
    <tr><td style="padding:32px 32px 0 32px;">
      <div style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${ACCENT};border-bottom:2px solid ${LINE};padding-bottom:8px;">${esc(
        text,
      )}</div>
    </td></tr>`;
}

// --- main --------------------------------------------------------------------

function buildItineraryHtml(itinerary: z.infer<typeof ItineraryOutputSchema>): string {
  const { destination, destinationCountry, dates, flight, hotels, costs } = itinerary;

  const place = `${esc(destination)}${destinationCountry ? `, ${esc(destinationCountry)}` : ''}`;
  const dateLine = `${esc(dates.outbound)}${dates.return ? ` &ndash; ${esc(dates.return)}` : ''}${
    dates.nights != null ? `  ·  ${dates.nights} night${dates.nights === 1 ? '' : 's'}` : ''
  }`;

  // Hero route: first departure → last arrival.
  const origin = flight.segments[0]?.departureAirport ?? '';
  const final = flight.segments[flight.segments.length - 1]?.arrivalAirport ?? '';

  const segmentRows = flight.segments
    .map(
      (s, i) => `
      <tr>
        <td style="padding:${i === 0 ? '0' : '14px'} 0 14px 0;border-top:${
          i === 0 ? 'none' : `1px solid ${LINE}`
        };">
          <div style="font-family:${MONO};font-size:13px;font-weight:700;color:${INK};">${esc(
            s.airline,
          )} ${esc(s.flightNumber)}</div>
          <div style="font-family:${SANS};font-size:15px;color:${TEXT};margin-top:4px;">
            <span style="font-family:${MONO};font-weight:700;">${esc(s.departureAirport)}</span>
            <span style="color:${ACCENT};">&nbsp;→&nbsp;</span>
            <span style="font-family:${MONO};font-weight:700;">${esc(s.arrivalAirport)}</span>
          </div>
          <div style="font-family:${SANS};font-size:13px;color:${MUTED};margin-top:2px;">${esc(
            s.departure,
          )} → ${esc(s.arrival)}</div>
        </td>
      </tr>`,
    )
    .join('');

  const hotelRows = hotels
    .map((h, i) => {
      const bg = i % 2 === 1 ? ZEBRA : CARD;
      return `
      <tr>
        <td style="padding:12px 14px;background:${bg};border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14px;color:${TEXT};font-weight:600;">${esc(
          h.name,
        )}</td>
        <td style="padding:12px 14px;background:${bg};border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14px;color:${TEXT};white-space:nowrap;">${
          h.rating != null ? `${esc(h.rating)} ★` : '—'
        }</td>
        <td style="padding:12px 14px;background:${bg};border-bottom:1px solid ${LINE};font-family:${SANS};font-size:13px;color:${MUTED};white-space:nowrap;">${esc(
          h.checkIn,
        )} → ${esc(h.checkOut)}</td>
        <td align="right" style="padding:12px 14px;background:${bg};border-bottom:1px solid ${LINE};font-family:${MONO};font-size:13px;color:${TEXT};white-space:nowrap;">${
          h.pricePerNight != null ? `$${fmtMoney(h.pricePerNight)}/night` : '—'
        }</td>
        <td align="right" style="padding:12px 14px;background:${bg};border-bottom:1px solid ${LINE};font-family:${MONO};font-size:13px;font-weight:700;color:${INK};white-space:nowrap;">${
          h.totalPrice != null ? `$${fmtMoney(h.totalPrice)}` : '—'
        }</td>
      </tr>`;
    })
    .join('');

  const th = (text: string, align: 'left' | 'right' = 'left') =>
    `<th align="${align}" style="padding:10px 14px;background:${INK};font-family:${SANS};font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#ffffff;font-weight:600;">${text}</th>`;

  const costRow = (label: string, value: string, opts: { strong?: boolean } = {}) => `
    <tr>
      <td style="padding:8px 0;font-family:${SANS};font-size:14px;color:${MUTED};">${esc(label)}</td>
      <td align="right" style="padding:8px 0;font-family:${MONO};font-size:14px;color:${
        opts.strong ? INK : TEXT
      };font-weight:${opts.strong ? 700 : 400};">${value}</td>
    </tr>`;

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};margin:0;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${CARD};border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(20,52,43,.08);">

      <!-- HEADER -->
      <tr>
        <td style="background:${INK};padding:36px 32px;">
          <div style="font-family:${SANS};font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${ACCENT};">Your itinerary</div>
          <div style="font-family:${SERIF};font-size:30px;line-height:1.2;color:#ffffff;margin-top:8px;">${place}</div>
          <div style="font-family:${SANS};font-size:14px;color:#C9D4CE;margin-top:10px;">${dateLine}</div>
        </td>
      </tr>

      <!-- FLIGHT -->
      ${sectionLabel('Flight')}
      <tr><td style="padding:16px 32px 0 32px;">
        <!-- route hero -->
        <div style="font-family:${MONO};font-size:26px;font-weight:700;color:${INK};text-align:center;padding:8px 0 18px 0;">
          ${esc(origin)} <span style="color:${ACCENT};">✈</span> ${esc(final)}
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${segmentRows}
        </table>
      </td></tr>

      <!-- flight info strip -->
      <tr><td style="padding:18px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${ZEBRA};border:1px solid ${LINE};border-radius:8px;">
          <tr>
            ${stat('Duration', fmtDuration(flight.durationMinutes))}
            ${stat('Stops', flight.stops === 0 ? 'Nonstop' : esc(String(flight.stops)))}
            ${stat('Per person', `$${fmtMoney(flight.pricePerPerson)}`)}
            ${stat('Total', `$${fmtMoney(flight.totalFlightCost)}`)}
          </tr>
        </table>
      </td></tr>

      ${
        flight.bookingUrl
          ? `<tr><td align="center" style="padding:22px 32px 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-radius:8px;background:${ACCENT};">
                  <a href="${esc(
                    flight.bookingUrl,
                  )}" style="display:inline-block;padding:14px 32px;font-family:${SANS};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:.02em;">Book this flight&nbsp;→</a>
                </td></tr>
              </table>
            </td></tr>`
          : ''
      }

      <!-- HOTELS -->
      ${sectionLabel('Hotel options')}
      <tr><td style="padding:16px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:8px;overflow:hidden;">
          <thead><tr>
            ${th('Name')}${th('Rating')}${th('Dates')}${th('Per night', 'right')}${th('Total', 'right')}
          </tr></thead>
          <tbody>${hotelRows}</tbody>
        </table>
      </td></tr>

      <!-- COST SUMMARY -->
      ${sectionLabel('Cost summary')}
      <tr><td style="padding:16px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${costRow('Flight subtotal', `${esc(costs.currency)} $${fmtMoney(costs.flightSubtotal)}`)}
          ${
            costs.cheapestHotelSubtotal != null
              ? costRow(
                  'Cheapest hotel subtotal',
                  `${esc(costs.currency)} $${fmtMoney(costs.cheapestHotelSubtotal)}`,
                )
              : ''
          }
          ${costRow('Travelers', `${costs.adults} adult${costs.adults === 1 ? '' : 's'}`)}
          <tr><td colspan="2" style="padding-top:6px;border-top:2px solid ${LINE};"></td></tr>
          <tr>
            <td style="padding:10px 0;font-family:${SANS};font-size:16px;font-weight:700;color:${INK};">Estimated total</td>
            <td align="right" style="padding:10px 0;font-family:${MONO};font-size:20px;font-weight:700;color:${ACCENT};">${esc(
              costs.currency,
            )} $${fmtMoney(costs.cheapestTotal)}</td>
          </tr>
        </table>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="padding:28px 32px 32px 32px;">
        <div style="border-top:1px solid ${LINE};padding-top:18px;font-family:${SANS};font-size:12px;color:${MUTED};line-height:1.5;">
          Prices and availability are estimates and may change at booking. Total reflects the cheapest hotel option for ${costs.adults} traveler${
            costs.adults === 1 ? '' : 's'
          }.
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>`;
}
export const sendItinerary = async (input: {
  address: string;
  itinerary: z.infer<typeof ItineraryOutputSchema>;
}): Promise<{ success: boolean }> => {
  const resend = new Resend(nullThrows(process.env.RESEND_API_KEY, 'Missing Resend API key'));

  const { data, error } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: input.address,
    subject: `Your trip to ${input.itinerary.destination}`,
    html: buildItineraryHtml(input.itinerary),
  });

  if (error) {
    console.error(error);
  }

  return { success: data != null && error == null };
};

export const sendItineraryTool = createTool({
  id: 'send-itinerary',
  description:
    'Send a travel itinerary via email. Call this after build-itinerary to email the trip plan to the user.',
  inputSchema: z.object({
    address: z.string().email().describe('Recipient email address'),
    itinerary: ItineraryOutputSchema.describe(
      'Itinerary object produced by the build-itinerary tool',
    ),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ address, itinerary }) => sendItinerary({ address, itinerary }),
});
