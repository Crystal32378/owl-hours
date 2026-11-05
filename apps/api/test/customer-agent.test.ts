// The customer-facing copy must match the WhatsApp payloads in
// handoff-ui/whatsapp/payloads, which the WhatsApp integration sends.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AI_DISCLOSURE, CUSTOMER_SYSTEM_PROMPT, OFF_TOPIC_REPLY, nextSafetyQuestion } from "../src/agent/customer-agent.ts";

describe("customer agent copy", () => {
  it("discloses the AI with the exact payload 01 text", async () => {
    assert.equal(
      AI_DISCLOSURE,
      "Hi, I'm Zukki, an AI assistant that finds you a local business and connects you with it. A person from the business confirms every request.",
    );
  });

  it("uses the exact payload 14 text for off-topic messages", async () => {
    assert.equal(OFF_TOPIC_REPLY, "I can only help you find and contact local businesses. What do you need today?");
    assert.ok(CUSTOMER_SYSTEM_PROMPT.includes(OFF_TOPIC_REPLY));
  });

  it("leaves the disclosure to our code, not the model", () => {
    assert.ok(!CUSTOMER_SYSTEM_PROMPT.includes(AI_DISCLOSURE));
    assert.match(CUSTOMER_SYSTEM_PROMPT, /already been sent/);
  });

  it("presents Zukki as a directory, not one business's assistant", () => {
    assert.match(CUSTOMER_SYSTEM_PROMPT, /^You are Zukki/);
    assert.doesNotMatch(CUSTOMER_SYSTEM_PROMPT, /assistant for a small local plumbing business/);
  });

  it("knows every directory category and keeps safety steps to home emergencies", () => {
    for (const category of ["plumbing", "food", "beauty", "pets"]) {
      assert.ok(CUSTOMER_SYSTEM_PROMPT.includes(category), category);
    }
    assert.match(CUSTOMER_SYSTEM_PROMPT, /Only for urgent home problems \(plumbing, electrical, locksmith\)/);
    assert.match(CUSTOMER_SYSTEM_PROMPT, /Skip this for everything else/);
    assert.match(CUSTOMER_SYSTEM_PROMPT, /call emergency services/);
  });

  it("never says a job is booked", () => {
    assert.match(CUSTOMER_SYSTEM_PROMPT, /Never say a job is booked/);
  });
});

describe("nextSafetyQuestion", () => {
  it("asks one safety question at a time, then stops", () => {
    assert.match(nextSafetyQuestion({ water_flowing: null, cables_near_water: null, valve_closed: null }) ?? "", /water/);
    assert.match(nextSafetyQuestion({ water_flowing: true, cables_near_water: null, valve_closed: null }) ?? "", /cables/);
    assert.match(nextSafetyQuestion({ water_flowing: true, cables_near_water: false, valve_closed: null }) ?? "", /valve/);
    assert.equal(nextSafetyQuestion({ water_flowing: true, cables_near_water: false, valve_closed: true }), null);
  });
});
