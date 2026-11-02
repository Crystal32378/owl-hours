// Owner app endpoints. Every route needs the owner's Supabase token and runs
// as that user, so each business only ever reaches its own data.
import { Hono } from "hono";
import { z } from "zod";
import { storyPackCreateSchema, storyPackUpdateSchema, storyPackReviewSchema } from "@owl-hours/shared";
import { ownerContentPhotoRoutes } from "./owner-content-photos.ts";
import { requireOwner, type OwnerEnv } from "../http/auth.ts";
import { rateLimit } from "../http/rate-limit.ts";
import { errorResponse, ok, readId, readJson, readQuery } from "../http/respond.ts";
import * as owner from "../services/owner-service.ts";
import { metaConnectUrl, unlinkAccount } from "../services/owner-meta.ts";
import type { V1Deps } from "./v1.ts";

const limit = z.coerce.number().int().min(1).max(100).optional();
const text = z.string().trim().min(1).max(4096);
const isoTime = z.string().datetime({ offset: true });

const offerQuery = z.object({
  status: z.enum(["offered", "accepted", "declined", "expired", "closed"]).default("offered"),
  limit,
});
const declineBody = z
  // The app's decline button sends no reason; the sheet sends one.
  .object({ reason: z.enum(["busy", "too_far", "not_offered", "other"]).default("other"), note: z.string().trim().max(500).optional() })
  .strict();
const messagesQuery = z.object({ before: isoTime.optional(), limit: z.coerce.number().int().min(1).max(200).optional() });
const quoteBody = z
  .object({
    lines: z
      .array(
        z
          .object({ label: z.string().trim().min(1).max(60), min: z.number().int().min(0), max: z.number().int().min(0) })
          .strict()
          .refine((line) => line.max >= line.min, "max must be at least min"),
      )
      .min(1)
      .max(12),
    arrivalFrom: isoTime,
    arrivalTo: isoTime,
    technicianId: z.string().uuid().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((quote) => Date.parse(quote.arrivalTo) >= Date.parse(quote.arrivalFrom), "arrivalTo is before arrivalFrom");
const transitionBody = z
  .object({ to: z.enum(["owner_confirmed", "en_route", "on_site", "done", "declined", "cancelled"]), reason: z.string().trim().min(1).max(500) })
  .strict();
const testZukkiBody = z
  .object({
    question: z.string().trim().min(1).max(1000),
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }).strict())
      .max(10)
      .optional(),
    businessId: z.string().uuid().optional(),
  })
  .strict();
const pushTokenBody = z
  .object({
    expoToken: z.string().regex(/^Expo(nent)?PushToken\[.+\]$/, "must be an Expo push token"),
    platform: z.enum(["ios", "android", "web"]),
  })
  .strict();
const businessName = z.string().trim().min(1).max(120);
// An empty website clears it.
// "Http://" is still http: the scheme is stored lowercase, as the tenants check expects.
const website = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .transform((typed) => typed.replace(/^https?:\/\//i, (scheme) => scheme.toLowerCase()))
    .pipe(z.string().url().max(200).regex(/^https?:\/\//, "must start with http(s)://")),
]);
// The owner types "Water Heaters" or "Plomería"; the business stores its key, water_heaters or plomeria.
const category = z
  .string()
  .transform(categoryKey)
  .pipe(z.string().regex(/^[a-z_]{2,32}$/, "must be 2-32 letters"));
const newBusinessBody = z
  .object({ name: businessName, category, website: website.optional(), ownerName: z.string().trim().min(1).max(80).optional() })
  .strict();
const businessBody = z
  .object({
    name: businessName.optional(),
    shortName: z.string().trim().min(1).max(28).optional(),
    website: website.optional(),
    takingRequests: z.boolean().optional(),
    nightJobs: z.boolean().optional(),
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, "nothing to change");
// Prices are whole currency units stored in an integer column; this keeps them far below its limit.
const MAX_PRICE = 1_000_000;
const pricesBody = z
  .object({
    prices: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64).optional(),
            label: z.string().trim().min(1).max(80),
            amount: z.number().int().positive().max(MAX_PRICE),
          })
          .strict(),
      )
      .max(50)
      .refine(hasDistinctIds, "each price id appears once"),
  })
  .strict();
const feesBody = z
  .object({
    fees: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64).optional(),
            label: z.string().trim().min(1).max(80),
            amount: z.number().int().positive().max(MAX_PRICE),
            atNight: z.boolean(),
          })
          .strict(),
      )
      .max(20)
      .refine(hasDistinctIds, "each fee id appears once"),
  })
  .strict();
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM");
const hoursBody = z
  .object({
    hours: z
      .array(
        z
          .object({ weekday: z.number().int().min(0).max(6), opens: clockTime, closes: clockTime })
          .strict()
          .refine((day) => day.opens !== day.closes, "opens and closes must differ"),
      )
      .max(21),
  })
  .strict();
const areaBody = z
  .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), radiusKm: z.number().positive().max(200) })
  .strict();
const pushTokenDeleteBody = z.object({ expoToken: pushTokenBody.shape.expoToken }).strict();

export function ownerRoutes(deps: V1Deps): Hono<OwnerEnv> {
  const app = new Hono<OwnerEnv>();
  app.onError((error, c) => errorResponse(c, error));
  app.use("*", requireOwner(deps.authenticate));
  app.use("*", rateLimit<OwnerEnv>({ limit: 120, windowMs: 60_000, key: (c) => `owner:${c.get("session").userId}`, now: deps.now }));

  app.route("/content/photo-jobs", ownerContentPhotoRoutes());

  app.get("/me", async (c) => ok(c, await owner.getMe(c.get("session"))));

  app.get("/business", async (c) => ok(c, await owner.getBusiness(c.get("session"))));
  // Onboarding's business step: creates the caller's business once, then updates it.
  app.post("/business", async (c) => {
    const body = await readJson(c, newBusinessBody);
    return ok(c, await owner.createBusiness(c.get("session"), body));
  });
  app.patch("/business", async (c) => {
    const body = await readJson(c, businessBody);
    return ok(c, await owner.updateBusiness(c.get("session"), body));
  });
  app.put("/business/prices", async (c) => {
    const body = await readJson(c, pricesBody);
    return ok(c, await owner.savePrices(c.get("session"), body.prices));
  });
  app.put("/business/fees", async (c) => {
    const body = await readJson(c, feesBody);
    return ok(c, await owner.saveFees(c.get("session"), body.fees));
  });
  app.put("/business/hours", async (c) => {
    const body = await readJson(c, hoursBody);
    return ok(c, await owner.saveHours(c.get("session"), body.hours));
  });
  app.put("/business/area", async (c) => {
    const body = await readJson(c, areaBody);
    return ok(c, await owner.saveArea(c.get("session"), body));
  });

  app.get("/offers", async (c) => {
    const query = readQuery(c, offerQuery);
    return ok(c, await owner.listOffers(c.get("session"), query.status, query.limit));
  });
  app.get("/offers/:id", async (c) => ok(c, await owner.getOffer(c.get("session"), readId(c))));
  app.post("/offers/:id/accept", async (c) => ok(c, await owner.acceptOffer(c.get("session"), readId(c))));
  app.post("/offers/:id/decline", async (c) => {
    const id = readId(c);
    const body = await readJson(c, declineBody);
    return ok(c, await owner.declineOffer(c.get("session"), id, body.reason, body.note));
  });

  app.get("/conversations", async (c) => {
    const query = readQuery(c, z.object({ limit }));
    return ok(c, await owner.listConversations(c.get("session"), query.limit));
  });
  app.get("/conversations/:id/messages", async (c) => {
    const id = readId(c);
    const query = readQuery(c, messagesQuery);
    return ok(c, await owner.listMessages(c.get("session"), id, query.before, query.limit));
  });
  app.post("/conversations/:id/messages", async (c) => {
    const id = readId(c);
    const body = await readJson(c, z.object({ text }).strict());
    return ok(c, await owner.sendMessage(c.get("session"), id, body.text), 201);
  });
  app.post("/conversations/:id/read", async (c) => ok(c, await owner.markRead(c.get("session"), readId(c))));
  app.post("/conversations/:id/drafts", async (c) => {
    const id = readId(c);
    const body = await readJson(c, z.object({ text }).strict());
    return ok(c, await owner.createDraft(c.get("session"), id, body.text, deps), 201);
  });
  app.post("/drafts/:id/send", async (c) => {
    const id = readId(c);
    const body = await readJson(c, z.object({ usePolished: z.boolean() }).strict());
    return ok(c, await owner.sendDraft(c.get("session"), id, body.usePolished), 201);
  });

  app.get("/jobs", async (c) => {
    const query = readQuery(c, z.object({ limit }));
    return ok(c, await owner.listJobs(c.get("session"), query.limit));
  });
  app.get("/jobs/:id", async (c) => ok(c, await owner.getJob(c.get("session"), readId(c))));
  app.post("/jobs/:id/quote", async (c) => {
    const id = readId(c);
    const body = await readJson(c, quoteBody);
    return ok(c, await owner.sendQuote(c.get("session"), id, body), 201);
  });
  app.post("/jobs/:id/transition", async (c) => {
    const id = readId(c);
    const body = await readJson(c, transitionBody);
    return ok(c, await owner.transitionJob(c.get("session"), id, body.to, body.reason));
  });

  app.get("/content/sources", async (c) => ok(c, await owner.listContentSources(c.get("session"))));
  app.get("/content/drafts", async (c) => ok(c, await owner.listContentDrafts(c.get("session"))));
  app.post("/content/drafts", async (c) => {
    const body = await readJson(c, storyPackCreateSchema);
    return ok(c, await owner.createContentDraft(c.get("session"), body), 201);
  });
  app.patch("/content/drafts/:id", async (c) => {
    const id = readId(c);
    const body = await readJson(c, storyPackUpdateSchema);
    return ok(c, await owner.updateContentDraft(c.get("session"), id, body));
  });
  app.post("/content/drafts/:id/review", async (c) => {
    const id = readId(c);
    const body = await readJson(c, storyPackReviewSchema);
    return ok(c, await owner.reviewContentDraft(c.get("session"), id, body));
  });

  app.post("/content/drafts/:id/handoff", async (c) =>
    ok(c, await owner.handoffContentDraft(c.get("session"), readId(c))));

  app.get("/linked-accounts", async (c) => ok(c, await owner.listLinkedAccounts(c.get("session"))));
  app.delete("/linked-accounts/:id", async (c) => ok(c, await unlinkAccount(c.get("session"), readId(c))));
  app.get("/meta/connect-url", async (c) => ok(c, await metaConnectUrl(c.get("session"), deps)));

  app.post("/test-zukki", async (c) => {
    const body = await readJson(c, testZukkiBody);
    return ok(c, await owner.testZukki(c.get("session"), body, deps));
  });

  app.post("/push-tokens", async (c) => {
    const body = await readJson(c, pushTokenBody);
    return ok(c, await owner.savePushToken(c.get("session"), body, deps));
  });
  app.delete("/push-tokens", async (c) => {
    const body = await readJson(c, pushTokenDeleteBody);
    return ok(c, await owner.deletePushToken(c.get("session"), body));
  });

  return app;
}

function hasDistinctIds(rows: { id?: string | undefined }[]): boolean {
  const ids = rows.flatMap((row) => (row.id ? [row.id] : []));
  return new Set(ids).size === ids.length;
}

// Accents dropped, every run of other characters one underscore, no underscore at either end.
function categoryKey(typed: string): string {
  return typed
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}
