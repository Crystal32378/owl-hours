import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accepted,
  disclosure,
  finding,
  locationRequest,
  nextBusiness,
  offTopic,
  ownerMessageAsWritten,
  ownerMessagePolished,
  quote,
  requestSent,
  safetyMarkedFrame,
  suggestBusiness,
  typingIndicator,
  whatAreYouLookingFor,
  zukkiIsBack,
} from "../src/index.ts";

// Expected bodies are the retired handoff-ui/whatsapp/payloads/NN-*.json,
// written inline with the demo values filled in.

const TO = "15551234567";
const INCOMING_WAMID = "wamid.IN1";
const MARKED_FRAME_URL = "https://example.supabase.co/marked.jpg";
const NORTHSIDE_ID = "10000000-0000-4000-8000-000000000001";
const BUSINESS_NAME = "Northside Plumbing";
const SHORT_NAME = "Northside";
const QUOTE_ID = "90000000-0000-4000-8000-000000000001";
const AS_WRITTEN_TEXT = "ok mario there 12:55, bringing the valve. 45 visit + 25 night, repair 60-90";
const POLISHED_TEXT =
  "Hi Ana, Mario can be there at 12:55 AM and he's bringing a new fill valve. The visit is $45 plus a $25 night fee, and the repair should be $60–90.";

const northsideMatch = {
  businessId: NORTHSIDE_ID,
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

const demoQuote = {
  quoteId: QUOTE_ID,
  businessName: BUSINESS_NAME,
  technician: "Mario R.",
  arrivalWindow: "12:55–1:25 AM",
  lines: [
    { label: "Visit", min: 45, max: 45 },
    { label: "Night fee", min: 25, max: 25 },
    { label: "Fill valve repair", min: 60, max: 90 },
  ],
  totalMin: 130,
  totalMax: 160,
  currency: "USD",
};

describe("payload conformance with handoff-ui/whatsapp/payloads", () => {
  it("01 disclosure matches 01-disclosure.json (S1, S3)", async () => {
    assert.deepEqual(disclosure({ to: TO }), {
      to: "15551234567",
      type: "text",
      text: {
        preview_url: false,
        body: "Hi, I'm Zukki, an AI assistant that finds you a local business and connects you with it. A person from the business confirms every request.",
      },
    });
  });

  it("02 whatAreYouLookingFor matches 02-what-are-you-looking-for.json (S1, S3)", async () => {
    assert.deepEqual(whatAreYouLookingFor({ to: TO }), {
      to: "15551234567",
      type: "interactive",
      interactive: {
        type: "list",
        body: {
          text: "What are you looking for? You can also send a photo, a video or a voice note.",
        },
        action: {
          button: "See options",
          sections: [
            {
              title: "Home",
              rows: [
                { id: "cat_plumbing", title: "Plumbing", description: "Leaks, drains, toilets, water heaters" },
                { id: "cat_electrical", title: "Electrical", description: "Power, outlets, lights" },
                { id: "cat_locksmith", title: "Locksmith", description: "Locked out, lock changes" },
              ],
            },
            {
              title: "Everyday",
              rows: [
                { id: "cat_food", title: "Food and drinks", description: "Restaurants, bakeries, catering" },
                { id: "cat_beauty", title: "Beauty and care", description: "Salons, barbers, spas" },
                { id: "cat_auto", title: "Car and moto", description: "Mechanics, tires, car wash" },
                { id: "cat_pets", title: "Pets", description: "Vets, grooming, pet shops" },
              ],
            },
            {
              title: "Other",
              rows: [{ id: "cat_other", title: "Something else", description: "Tell me what you need" }],
            },
          ],
        },
        footer: {
          text: "Only businesses open now and near you",
        },
      },
    });
  });

  it("03 typingIndicator matches 03-typing-indicator.json (S1, S3)", async () => {
    assert.deepEqual(typingIndicator({ messageId: INCOMING_WAMID }), {
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.IN1",
      typing_indicator: {
        type: "text",
      },
    });
  });

  it("04 safetyMarkedFrame matches 04-safety-marked-frame.json (S1, S3)", async () => {
    assert.deepEqual(safetyMarkedFrame({ to: TO, markedFrameUrl: MARKED_FRAME_URL }), {
      to: "15551234567",
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "Let's stop the water first: turn this valve clockwise. Any outlets or cables near the water?",
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "safety_done", title: "Done, no cables" } },
            { type: "reply", reply: { id: "safety_cant_find", title: "I can't find it" } },
          ],
        },
        header: {
          type: "image",
          image: {
            link: "https://example.supabase.co/marked.jpg",
          },
        },
      },
    });
  });

  it("05 locationRequest matches 05-location-request.json for plumbing with water off (S1, S3)", async () => {
    assert.deepEqual(locationRequest({ to: TO, category: "plumbing", waterOff: true }), {
      to: "15551234567",
      type: "interactive",
      interactive: {
        type: "location_request_message",
        body: {
          text: "Good, the water is off. Now share your location so I can find a plumber who is open near you. The business only sees the exact address after you approve a visit.",
        },
        action: {
          name: "send_location",
        },
      },
    });
  });

  it("06 finding matches 06-finding.json for plumbing (S1, S3)", async () => {
    assert.deepEqual(finding({ to: TO, category: "plumbing" }), {
      to: "15551234567",
      type: "text",
      text: {
        preview_url: false,
        body: "Thanks. I'm finding a plumber who is open near you.",
      },
    });
  });

  it("07 suggestBusiness matches 07-suggest-business.json with the demo match (S1, S3)", async () => {
    assert.deepEqual(suggestBusiness({ to: TO, category: "plumbing", match: northsideMatch }), {
      to: "15551234567",
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "★ 4.9 (128) · 1.2 km · open now\n\nVisit: $45\nNight fee (10 PM–7 AM): +$25\nLeak repair: from $60\nCan arrive: in about 40 min",
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "connect:10000000-0000-4000-8000-000000000001", title: "Connect me" } },
            { type: "reply", reply: { id: "another_option", title: "Show another option" } },
          ],
        },
        footer: {
          text: "Closest plumber taking night jobs right now",
        },
        header: {
          type: "text",
          text: "Northside Plumbing",
        },
      },
    });
  });

  it("08 requestSent matches 08-request-sent.json with a 5 minute window (S1, S3)", async () => {
    assert.deepEqual(requestSent({ to: TO, businessName: BUSINESS_NAME, acceptMinutes: 5 }), {
      to: "15551234567",
      type: "text",
      text: {
        preview_url: false,
        body: "I sent your request to Northside Plumbing. They have up to 5 minutes to accept.",
      },
    });
  });

  it("09 nextBusiness matches 09-next-business.json for an expiry (S1, S3)", async () => {
    assert.deepEqual(nextBusiness({ to: TO, businessName: BUSINESS_NAME, reason: "expired" }), {
      to: "15551234567",
      type: "text",
      text: {
        preview_url: false,
        body: "Northside Plumbing didn't answer in time, so I won't keep you waiting. This business is free now:",
      },
    });
  });

  it("10 accepted matches 10-accepted.json (S1, S3)", async () => {
    assert.deepEqual(accepted({ to: TO, businessName: BUSINESS_NAME }), {
      to: "15551234567",
      type: "text",
      text: {
        preview_url: false,
        body: "Northside Plumbing accepted. You're now talking with their team. Type *Zukki* anytime to talk to me.",
      },
    });
  });

  it("11 ownerMessageAsWritten matches 11-owner-message-as-written.json (S1, S3)", async () => {
    assert.deepEqual(
      ownerMessageAsWritten({ to: TO, businessName: BUSINESS_NAME, senderFirstName: "Mario", ownerText: AS_WRITTEN_TEXT }),
      {
        to: "15551234567",
        type: "text",
        text: {
          preview_url: false,
          body: "*Northside Plumbing · Mario*\nok mario there 12:55, bringing the valve. 45 visit + 25 night, repair 60-90",
        },
      },
    );
  });

  it("12 ownerMessagePolished matches 12-owner-message-polished.json (S1, S3)", async () => {
    assert.deepEqual(
      ownerMessagePolished({
        to: TO,
        businessName: BUSINESS_NAME,
        senderFirstName: "Mario",
        polishedText: POLISHED_TEXT,
        businessShortName: SHORT_NAME,
      }),
      {
        to: "15551234567",
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: "*Northside Plumbing · Mario*\nHi Ana, Mario can be there at 12:55 AM and he's bringing a new fill valve. The visit is $45 plus a $25 night fee, and the repair should be $60–90.",
          },
          action: {
            buttons: [
              { type: "reply", reply: { id: "reply_ok", title: "Sounds good" } },
              { type: "reply", reply: { id: "reply_question", title: "Ask a question" } },
            ],
          },
          footer: {
            text: "Written with Zukki, approved by Northside",
          },
        },
      },
    );
  });

  it("13 quote matches 13-quote.json with the demo quote (S1, S3)", async () => {
    assert.deepEqual(quote({ to: TO, ...demoQuote }), {
      to: "15551234567",
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "Mario R. · arrives 12:55–1:25 AM\n\nVisit: $45\nNight fee: $25\nFill valve repair: $60–90\n*Estimated total: $130–160*\n\nYou pay Mario after the repair.",
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "quote_approve:90000000-0000-4000-8000-000000000001", title: "Approve visit" } },
            { type: "reply", reply: { id: "quote_question:90000000-0000-4000-8000-000000000001", title: "Ask a question" } },
          ],
        },
        footer: {
          text: "Nothing is booked until you approve",
        },
        header: {
          type: "text",
          text: "Quote from Northside Plumbing",
        },
      },
    });
  });

  it("14 offTopic matches 14-off-topic.json (S1, S3)", async () => {
    assert.deepEqual(offTopic({ to: TO }), {
      to: "15551234567",
      type: "text",
      text: {
        preview_url: false,
        body: "I can only help you find and contact local businesses. What do you need today?",
      },
    });
  });

  it("15 zukkiIsBack matches 15-zukki-is-back.json (S1, S3)", async () => {
    assert.deepEqual(zukkiIsBack({ to: TO, businessName: BUSINESS_NAME }), {
      to: "15551234567",
      type: "text",
      text: {
        preview_url: false,
        body: "I'm here. Your chat with Northside Plumbing stays open. What do you need?",
      },
    });
  });
});
