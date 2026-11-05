import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ownerMessagePolished,
  quote,
  safetyMarkedFrame,
  suggestBusiness,
  whatAreYouLookingFor,
} from "../src/index.ts";

// RED phase (T1): the builders above do not exist yet, so every test fails
// on the missing export. Overflow behavior copies apps/api today: copy.ts
// clips header/footer/body (HEADER_MAX, FOOTER_MAX, BUTTON_BODY_MAX) and
// outbox.ts falls back to text for 12 over INTERACTIVE_BODY_MAX.

const TO = "15551234567";
const BUSINESS_NAME = "Northside Plumbing";
const SHORT_NAME = "Northside";

const demoMatch = {
  businessId: "10000000-0000-4000-8000-000000000001",
  businessName: BUSINESS_NAME,
  rating: 4.9,
  reviews: 128,
  distanceKm: 1.2,
  openNow: true,
  visit: 45,
  nightFee: { amount: 25, window: "10 PM-7 AM" },
  repairFrom: 60,
  repairLabel: "Leak repair",
  etaMinutes: 40,
  currency: "USD",
  takesNightJobs: true,
};

describe("Cloud API limits (S2)", () => {
  it("clips an over-long header to 60 characters (S2)", () => {
    const message = suggestBusiness({ to: TO, category: "plumbing", match: { ...demoMatch, businessName: "N".repeat(80) } });
    assert.deepEqual(headerOf(message), { type: "text", text: `${"N".repeat(59)}…` });
  });

  it("clips an over-long footer to 60 characters (S2)", () => {
    const message = ownerMessagePolished({
      to: TO,
      businessName: BUSINESS_NAME,
      senderFirstName: "Mario",
      polishedText: "On my way.",
      businessShortName: "N".repeat(70),
    });
    const footer = footerOf(message);
    assert.equal(footer.length, 60);
    assert.equal(footer, `Written with Zukki, approved by ${"N".repeat(27)}…`);
  });

  it("keeps every button title within 20 characters (S2)", () => {
    const bodies = [
      safetyMarkedFrame({ to: TO, markedFrameUrl: "https://example.supabase.co/marked.jpg" }),
      suggestBusiness({ to: TO, category: "plumbing", match: demoMatch }),
      ownerMessagePolished({
        to: TO,
        businessName: BUSINESS_NAME,
        senderFirstName: "Mario",
        polishedText: "On my way.",
        businessShortName: SHORT_NAME,
      }),
      quote({
        to: TO,
        quoteId: "90000000-0000-4000-8000-000000000001",
        businessName: BUSINESS_NAME,
        technician: "Mario R.",
        arrivalWindow: "12:55–1:25 AM",
        lines: [{ label: "Visit", min: 45, max: 45 }],
        totalMin: 45,
        totalMax: 45,
        currency: "USD",
      }),
    ];
    for (const message of bodies) {
      for (const title of buttonTitlesOf(message)) {
        assert.ok(title.length <= 20, `button title over 20 chars: ${title}`);
      }
    }
  });

  it("clips an over-long interactive body to 1024 characters (S2)", () => {
    const message = quote({
      to: TO,
      quoteId: "90000000-0000-4000-8000-000000000001",
      businessName: BUSINESS_NAME,
      technician: "Mario R.",
      arrivalWindow: "12:55–1:25 AM",
      lines: Array.from({ length: 60 }, (_unused, index) => ({ label: `Line ${index}`, min: 10, max: 20 })),
      totalMin: 600,
      totalMax: 1200,
      currency: "USD",
    });
    const body = bodyOf(message);
    assert.equal(body.length, 1024);
    assert.ok(body.endsWith("…"));
  });

  it("keeps every list row title within 24 characters (S2)", () => {
    const message = whatAreYouLookingFor({ to: TO });
    const rows = rowsOf(message);
    assert.ok(rows.length > 0);
    for (const title of rows) {
      assert.ok(title.length <= 24, `row title over 24 chars: ${title}`);
    }
  });

  it("falls back to text with the footer as the last line when 12 is too long (S2)", () => {
    const message = ownerMessagePolished({
      to: TO,
      businessName: BUSINESS_NAME,
      senderFirstName: "Mario",
      polishedText: "a".repeat(1100),
      businessShortName: SHORT_NAME,
    }) as { type: string; text?: { body: string } };
    assert.equal(message.type, "text");
    assert.match(message.text?.body ?? "", /_Written with Zukki, approved by Northside_$/);
  });
});

function interactiveOf(message: unknown): Record<string, unknown> {
  return (message as { interactive: Record<string, unknown> }).interactive;
}

function headerOf(message: unknown): unknown {
  return interactiveOf(message).header;
}

function footerOf(message: unknown): string {
  return ((interactiveOf(message).footer as { text: string }).text);
}

function bodyOf(message: unknown): string {
  return ((interactiveOf(message).body as { text: string }).text);
}

function buttonTitlesOf(message: unknown): string[] {
  const action = interactiveOf(message).action as { buttons: Array<{ reply: { title: string } }> };
  return action.buttons.map((button) => button.reply.title);
}

function rowsOf(message: unknown): string[] {
  const action = interactiveOf(message).action as { sections: Array<{ rows: Array<{ title: string }> }> };
  return action.sections.flatMap((section) => section.rows.map((row) => row.title));
}
