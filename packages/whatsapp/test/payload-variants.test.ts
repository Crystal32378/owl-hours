import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  finding,
  locationRequest,
  nextBusiness,
  noNextBusiness,
  ownerMessageAsWritten,
  ownerMessagePolished,
  quote,
  suggestBusiness,
} from "../src/index.ts";

// GREEN-phase regression pins for producer variants with no JSON
// counterpart (handoff L5). Expected bodies are literals taken from
// apps/api's copy/outbox behavior today, not recomputed by the builders.

const TO = "15551234567";
const BUSINESS_NAME = "Northside Plumbing";

const bareMatch = {
  businessId: "10000000-0000-4000-8000-000000000001",
  businessName: BUSINESS_NAME,
  rating: null,
  reviews: null,
  distanceKm: null,
  openNow: false,
  visit: null,
  nightFee: null,
  repairFrom: null,
  repairLabel: null,
  etaMinutes: null,
  currency: "USD",
  takesNightJobs: false,
};

const demoMatch = {
  ...bareMatch,
  rating: 4.9,
  reviews: 128,
  distanceKm: 1.2,
  openNow: true,
  visit: 45,
  nightFee: { amount: 25, window: "10 PM-7 AM" },
  repairFrom: 60,
  repairLabel: "Leak repair",
  etaMinutes: 40,
  takesNightJobs: true,
};

describe("producer variants without a JSON counterpart (S5)", () => {
  it("07 with no facts or prices falls back to the business name", () => {
    assert.deepEqual(suggestBusiness({ to: TO, category: "plumbing", match: bareMatch }), {
      to: TO,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: BUSINESS_NAME },
        action: {
          buttons: [
            { type: "reply", reply: { id: "connect:10000000-0000-4000-8000-000000000001", title: "Connect me" } },
            { type: "reply", reply: { id: "another_option", title: "Show another option" } },
          ],
        },
        header: { type: "text", text: BUSINESS_NAME },
        footer: { text: "Closest plumber open right now" },
      },
    });
  });

  it("05 uses the food noun with that for a non-urgent need", () => {
    assert.deepEqual(locationRequest({ to: TO, category: "food", waterOff: false }), {
      to: TO,
      type: "interactive",
      interactive: {
        type: "location_request_message",
        body: {
          text: "Share your location so I can find a place that is open near you. The business only sees the exact address after you approve a visit.",
        },
        action: { name: "send_location" },
      },
    });
  });

  it("06 uses an electrician for electrical", () => {
    assert.deepEqual(finding({ to: TO, category: "electrical" }), {
      to: TO,
      type: "text",
      text: { preview_url: false, body: "Thanks. I'm finding an electrician who is open near you." },
    });
  });

  it("07 after a timeout carries the video footer", () => {
    const message = suggestBusiness({ to: TO, category: "plumbing", match: demoMatch, afterTimeout: true });
    const interactive = (message as { interactive: { footer: { text: string } } }).interactive;
    assert.equal(interactive.footer.text, "Your video and details go with the request");
  });

  it("09 declined says the business can't take this one", () => {
    assert.deepEqual(nextBusiness({ to: TO, businessName: BUSINESS_NAME, reason: "declined" }), {
      to: TO,
      type: "text",
      text: {
        preview_url: false,
        body: "Northside Plumbing can't take this one, so I won't keep you waiting. This business is free now:",
      },
    });
  });

  it("09 with no next business says nobody else is open", () => {
    assert.deepEqual(noNextBusiness({ to: TO, businessName: BUSINESS_NAME, reason: "declined", category: "plumbing" }), {
      to: TO,
      type: "text",
      text: {
        preview_url: false,
        body: "Northside Plumbing can't take this one, and no other plumber is open near you right now. Message me anytime and I'll look again.",
      },
    });
  });

  it("11 without a sender name signs with the business only", () => {
    assert.deepEqual(ownerMessageAsWritten({ to: TO, businessName: BUSINESS_NAME, senderFirstName: null, ownerText: "On my way." }), {
      to: TO,
      type: "text",
      text: { preview_url: false, body: `*${BUSINESS_NAME}*\nOn my way.` },
    });
  });

  it("12 without a short name approves with the full business name", () => {
    const message = ownerMessagePolished({
      to: TO,
      businessName: BUSINESS_NAME,
      senderFirstName: null,
      polishedText: "On my way.",
      businessShortName: null,
    });
    const interactive = (message as { interactive: { footer: { text: string }; body: { text: string } } }).interactive;
    assert.equal(interactive.footer.text, "Written with Zukki, approved by Northside Plumbing");
    assert.equal(interactive.body.text, `*${BUSINESS_NAME}*\nOn my way.`);
  });

  it("13 without a technician or arrival window pays the business", () => {
    const message = quote({
      to: TO,
      quoteId: "90000000-0000-4000-8000-000000000001",
      businessName: BUSINESS_NAME,
      technician: null,
      arrivalWindow: null,
      lines: [{ label: "Visit", min: 45, max: 45 }],
      totalMin: 45,
      totalMax: 45,
      currency: "USD",
    });
    const interactive = (message as { interactive: { body: { text: string } } }).interactive;
    assert.equal(
      interactive.body.text,
      "Northside Plumbing\n\nVisit: $45\n*Estimated total: $45*\n\nYou pay Northside Plumbing after the repair.",
    );
  });
});
