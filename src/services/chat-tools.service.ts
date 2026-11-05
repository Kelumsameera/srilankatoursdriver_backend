import { z } from "zod";
import { ChatKnowledge, FAQ, Tour } from "../models/index.js";
import { bookingCreate } from "../validations/crm.js";
import { escapeRegex } from "../utils/helpers.js";
import { groupPriceFor, type GroupPrice } from "../utils/group-price.js";
import { getPublicBySlug, listPublicLocalized } from "./public.service.js";

/*
 * The only things the AI assistant can do. Gemini asks for a tool by name; the server checks the arguments
 * with Zod and runs fixed, read-only code. The one "write" (prepare_booking) only stores a draft on the
 * visitor's own chat – a Booking is created later, only when the visitor presses Confirm.
 */

export interface ToolContext {
  locale: string;
  // The visitor's ChatConversation document (mongoose)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chat: any;
}

type AnyRecord = Record<string, unknown>;

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,160}$/);
const query = z.string().trim().max(100);

// The JSON schemas Gemini sees (kept small: fewer tokens per request)
export const TOOL_DECLARATIONS = [
  {
    name: "search_tours",
    description: "Find published tours on our website. Use before recommending any tour.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to search in tour titles, e.g. 'honeymoon' or 'Ella'" },
        days: { type: "integer", description: "Exact tour length in days, if the visitor gave one" },
      },
    },
  },
  {
    name: "get_tour",
    description: "Details of one published tour (highlights, included, itinerary) by its slug from search_tours.",
    parametersJsonSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
  },
  {
    name: "search_destinations",
    description: "Find destinations (places) described on our website.",
    parametersJsonSchema: { type: "object", properties: { query: { type: "string" } } },
  },
  {
    name: "search_knowledge",
    description: "Company facts and FAQs (policies, pick-up, payments, what is included). Use before answering any company question.",
    parametersJsonSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "get_tour_price",
    description: "The website price list for a tour and group size. The only allowed source of prices.",
    parametersJsonSchema: {
      type: "object",
      properties: { slug: { type: "string" }, adults: { type: "integer" }, children: { type: "integer" } },
      required: ["slug", "adults"],
    },
  },
  {
    name: "prepare_booking",
    description:
      "Prepare a tour booking REQUEST for the visitor to review. It is NOT sent until the visitor presses Confirm in the chat, and our team confirms it afterwards. Ask for every required field first.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        tourSlug: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        adults: { type: "integer" },
        children: { type: "integer" },
        childrenAges: { type: "array", items: { type: "integer" } },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        whatsapp: { type: "string" },
        country: { type: "string" },
        pickupLocation: { type: "string" },
        message: { type: "string" },
      },
      required: ["tourSlug", "startDate", "adults", "name", "email"],
    },
  },
  {
    name: "request_human",
    description: "The visitor wants a person, or the question needs our team (custom quotes, complaints, changes to a booking).",
    parametersJsonSchema: { type: "object", properties: { reason: { type: "string" } } },
  },
];

const tourUrl = (locale: string, s: unknown) => `/${locale}/tours/${String(s)}`;

// ---- Tool handlers ----

async function searchTours(args: unknown, ctx: ToolContext) {
  const a = z.object({ query: query.optional(), days: z.number().int().min(1).max(60).optional() }).parse(args ?? {});
  const result = await listPublicLocalized("tours", { locale: ctx.locale, search: a.query || undefined, days: a.days ? String(a.days) : undefined, limit: 6 });
  return {
    tours: (result.items as AnyRecord[]).map((t) => ({
      title: t.title,
      slug: t.slug,
      days: t.durationDays,
      nights: t.durationNights,
      summary: String(t.shortDescription ?? "").slice(0, 200),
      url: tourUrl(ctx.locale, t.slug),
    })),
  };
}

async function getTour(args: unknown, ctx: ToolContext) {
  const a = z.object({ slug }).parse(args);
  const { item } = await getPublicBySlug("tours", a.slug, ctx.locale);
  const t = item as AnyRecord;
  return {
    title: t.title,
    slug: t.slug,
    days: t.durationDays,
    nights: t.durationNights,
    start: t.startLocation,
    end: t.endLocation,
    highlights: t.highlights,
    included: t.included,
    excluded: t.excluded,
    itinerary: ((t.itinerary as AnyRecord[]) ?? []).map((d) => ({ day: d.day, title: d.title, location: d.location })),
    url: tourUrl(ctx.locale, t.slug),
  };
}

async function searchDestinations(args: unknown, ctx: ToolContext) {
  const a = z.object({ query: query.optional() }).parse(args ?? {});
  const result = await listPublicLocalized("destinations", { locale: ctx.locale, search: a.query || undefined, limit: 6 });
  return {
    destinations: (result.items as AnyRecord[]).map((d) => ({
      name: d.name,
      region: d.region,
      summary: String(d.shortDescription ?? "").slice(0, 200),
      url: `/${ctx.locale}/destinations/${String(d.slug)}`,
    })),
  };
}

// Published AI-knowledge entries and published FAQs that match any of the words
export async function searchKnowledge(args: unknown) {
  const a = z.object({ query }).parse(args);
  const words = a.query.split(/\s+/).filter((w) => w.length > 2).slice(0, 6);
  const rx = words.length ? new RegExp(words.map(escapeRegex).join("|"), "i") : /./;
  const [facts, faqs] = await Promise.all([
    ChatKnowledge.find({ status: "published", $or: [{ title: rx }, { content: rx }] }).select("title content").limit(5).lean(),
    FAQ.find({ status: "published", $or: [{ question: rx }, { answer: rx }] }).select("question answer").limit(5).lean(),
  ]);
  return {
    facts: [...facts.map((f) => ({ title: f.title, text: f.content })), ...faqs.map((f) => ({ title: f.question, text: String(f.answer).slice(0, 1500) }))],
  };
}

// The same price list and USD conversion the website's booking form shows
export async function getTourPrice(args: unknown, ctx: ToolContext) {
  const a = z.object({ slug, adults: z.number().int().min(1).max(100), children: z.number().int().min(0).max(100).default(0) }).parse(args);
  const { item } = await getPublicBySlug("tours", a.slug, ctx.locale);
  const t = item as AnyRecord;
  const persons = a.adults + a.children;
  const row = groupPriceFor(t.groupPrices as GroupPrice[] | undefined, persons);
  if (!row) return { tour: t.title, persons, price: null, note: "No automatic price for this group size. Our team will send a quote." };
  return { tour: t.title, persons, price: row.price, currency: t.currency, vehicle: row.vehicle || undefined, note: "Price for the whole group from the website price list. Final quote is confirmed by our team." };
}

// Checks the draft with the website booking form's own rules (validations/crm.ts) and keeps it on the chat
export async function prepareBooking(args: unknown, ctx: ToolContext) {
  const a = z.object({ tourSlug: slug }).passthrough().parse(args) as AnyRecord & { tourSlug: string };
  const tour = await Tour.findOne({ slug: a.tourSlug, status: "published" }).select("_id title").lean();
  if (!tour) return { ok: false, error: "Tour not found. Use search_tours first." };

  const parsed = bookingCreate.safeParse({
    type: "tour",
    tour: String(tour._id),
    customer: { name: a.name, email: a.email, phone: a.phone, whatsapp: a.whatsapp, country: a.country },
    startDate: a.startDate,
    adults: a.adults,
    children: a.children,
    childrenAges: a.childrenAges,
    pickupLocation: a.pickupLocation,
    message: a.message,
    locale: ctx.locale,
  });
  if (!parsed.success) {
    return { ok: false, error: "Some details are missing or invalid. Ask the visitor for them.", fields: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }

  const draft = { ...parsed.data, startDate: parsed.data.startDate.toISOString(), tourTitle: tour.title, tourSlug: a.tourSlug };
  ctx.chat.bookingDraft = draft;
  ctx.chat.contact = { name: parsed.data.customer.name, email: parsed.data.customer.email };
  if (ctx.chat.leadStatus === "none") ctx.chat.leadStatus = "new";
  return { ok: true, status: "draft_waiting_for_visitor", note: "Tell the visitor to check the details and press Confirm below. Nothing is booked yet." };
}

function requestHuman(args: unknown, ctx: ToolContext) {
  const a = z.object({ reason: z.string().trim().max(300).optional() }).parse(args ?? {});
  ctx.chat.handoff = { requested: true, reason: a.reason ?? "", at: new Date() };
  if (ctx.chat.leadStatus === "none") ctx.chat.leadStatus = "new";
  return { ok: true, note: "Our team has been notified in the admin inbox. The visitor can also use the WhatsApp button shown in the chat." };
}

const HANDLERS: Record<string, (args: unknown, ctx: ToolContext) => unknown> = {
  search_tours: searchTours,
  get_tour: getTour,
  search_destinations: searchDestinations,
  search_knowledge: searchKnowledge,
  get_tour_price: getTourPrice,
  prepare_booking: prepareBooking,
  request_human: requestHuman,
};

// Runs one tool. Unknown tools and bad arguments come back as an error object for the model, never as a crash.
export async function runTool(name: string, args: unknown, ctx: ToolContext): Promise<AnyRecord> {
  const handler = HANDLERS[name];
  if (!handler) return { error: `Unknown tool ${name}` };
  try {
    return (await handler(args, ctx)) as AnyRecord;
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "Invalid arguments" };
    if ((error as { statusCode?: number }).statusCode === 404) return { error: "Not found" };
    throw error;
  }
}
