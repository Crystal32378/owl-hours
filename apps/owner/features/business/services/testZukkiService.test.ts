// Spec: odd/tasks/owner-notification-test-zukki.md T2 (S5, S6). Asking Test Zukki:
// the demo fake reproduces the two OwTestZukki design exchanges verbatim, the live
// client posts question + history to POST /v1/owner/test-zukki and maps the reply,
// a failed ask keeps the question with a retry, and history accumulates across turns.
// Every test builds its own session so state never leaks between tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TestZukkiClient, TestZukkiHistoryItem } from "./testZukkiService.ts";
import {
  createFakeTestZukkiClient,
  createLiveTestZukkiClient,
  createTestZukkiSession,
} from "./testZukkiService.ts";

const KITCHEN_SINK_QUESTION = "How much to unclog a kitchen sink tonight?";
const KITCHEN_SINK_ANSWER =
  "Northside Plumbing can help tonight. The visit is $45, plus a $25 night fee after 10 PM. " +
  "Unclogging a drain starts at $80. They usually arrive in about 40 minutes.";
const GAS_HEATER_QUESTION = "Do you repair gas heaters?";
const GAS_HEATER_ANSWER = "Gas heaters aren't in Northside's services, so I'd suggest another business for that.";

function recordingFetch(answer: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const push = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Response.json(answer);
  }) as typeof fetch;
  return { calls, push };
}

function lastTurnOf(session: ReturnType<typeof createTestZukkiSession>) {
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.status, "ready");
  const turns = snapshot.turns;
  const last = turns[turns.length - 1];
  assert.ok(last, "expected at least one turn");
  return last;
}

describe("testZukki demo fake (S6: the two design exchanges, verbatim)", () => {
  it("answers the kitchen-sink question with its prices and sources", async () => {
    const session = createTestZukkiSession(createFakeTestZukkiClient());
    session.setDraft(KITCHEN_SINK_QUESTION);

    await session.ask();

    const last = lastTurnOf(session);
    assert.equal(last.question, KITCHEN_SINK_QUESTION);
    assert.equal(last.answer?.text, KITCHEN_SINK_ANSWER);
    assert.deepEqual(last.answer?.sources, ["Visit", "Night fee", "Unclog a drain"]);
    assert.equal(session.getSnapshot().draft, "", "a sent question leaves the composer");
  });

  for (const [label, question, expected, sources] of [
    ["a leak and the night", "How much is a leak repair and are you open at night?", /Leak repair starts at \$60.*\$25/, ["Visit", "Leak repair", "Night fee"]],
    ["a clogged drain, in Spanish", "¿Cuánto cuesta destapar un drenaje?", /Unclog a drain starts at \$80/, ["Visit", "Unclog a drain"]],
    ["a water heater", "Do you install water heaters?", /Water heater install starts at \$350/, ["Visit", "Water heater install"]],
    ["the hours", "What are your hours?", /Mon–Sat, 8 AM–8 PM/, ["Hours"]],
  ] as const) {
    it(`answers ${label} from the demo business`, async () => {
      const session = createTestZukkiSession(createFakeTestZukkiClient());
      session.setDraft(question);

      await session.ask();

      const last = lastTurnOf(session);
      assert.match(last.answer?.text ?? "", expected);
      assert.deepEqual(last.answer?.sources, sources);
    });
  }

  it("gives the visit price without promising a service nobody named", async () => {
    const session = createTestZukkiSession(createFakeTestZukkiClient());
    session.setDraft("How much does it cost to fix my car?");

    await session.ask();

    const answer = lastTurnOf(session).answer;
    assert.equal(answer?.text, "A visit from Northside Plumbing is $45. Tell me what needs fixing and I'll give you its price.");
    assert.deepEqual(answer?.sources, ["Visit"]);
  });

  it("still says a service it does not offer is not offered", async () => {
    const session = createTestZukkiSession(createFakeTestZukkiClient());
    session.setDraft("Can you fix my car?");

    await session.ask();

    assert.match(lastTurnOf(session).answer?.text ?? "", /not in Northside Plumbing's services/);
    assert.deepEqual(lastTurnOf(session).answer?.sources, []);
  });

  it("answers the gas-heater question as not offered, with no sources", async () => {
    const session = createTestZukkiSession(createFakeTestZukkiClient());
    session.setDraft(GAS_HEATER_QUESTION);

    await session.ask();

    const last = lastTurnOf(session);
    assert.equal(last.answer?.text, GAS_HEATER_ANSWER);
    assert.deepEqual(last.answer?.sources, []);
  });
});

describe("testZukki live client (S6: POST /v1/owner/test-zukki)", () => {
  it("posts the question with its history and maps reply/sources to the answer", async () => {
    const { calls, push } = recordingFetch({
      success: true,
      data: { businessId: "biz_northside", reply: KITCHEN_SINK_ANSWER, sources: ["Visit"] },
    });
    const client = createLiveTestZukkiClient({
      baseUrl: "https://api.example",
      getToken: async () => "session-token-for-tests",
      push,
    });
    const history = [{ role: "user", content: GAS_HEATER_QUESTION }] as const;

    const answer = await client.ask(KITCHEN_SINK_QUESTION, [...history]);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api.example/v1/owner/test-zukki");
    assert.equal(calls[0]?.init.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
      question: KITCHEN_SINK_QUESTION,
      history: [{ role: "user", content: GAS_HEATER_QUESTION }],
    });
    assert.deepEqual(answer, { text: KITCHEN_SINK_ANSWER, sources: ["Visit"] });
  });
});

describe("testZukki failure and history (S6)", () => {
  it("keeps the question in the composer with an error state, and retry sends it", async () => {
    let calls = 0;
    const flaky: TestZukkiClient = {
      ask: async () => {
        calls += 1;
        if (calls === 1) throw new Error("network down");
        return { text: KITCHEN_SINK_ANSWER, sources: ["Visit"] };
      },
    };
    const session = createTestZukkiSession(flaky);
    session.setDraft(KITCHEN_SINK_QUESTION);

    await session.ask();

    assert.equal(session.getSnapshot().error, "network down");
    assert.equal(session.getSnapshot().draft, KITCHEN_SINK_QUESTION, "the question stays for retry");
    assert.equal(session.getSnapshot().turns.length, 0, "no answer stored for a failed ask");

    await session.retry();

    assert.equal(session.getSnapshot().error, null);
    assert.equal(lastTurnOf(session).answer?.text, KITCHEN_SINK_ANSWER);
  });

  it("accumulates history across turns: the second ask sees the first exchange", async () => {
    const seen: { question: string; history: { role: string; content: string }[] }[] = [];
    const client: TestZukkiClient = {
      ask: async (question: string, history: TestZukkiHistoryItem[]) => {
        seen.push({ question, history: history.map((item) => ({ role: item.role, content: item.content })) });
        return { text: "reply", sources: [] };
      },
    };
    const session = createTestZukkiSession(client);
    session.setDraft(KITCHEN_SINK_QUESTION);
    await session.ask();
    session.setDraft(GAS_HEATER_QUESTION);

    await session.ask();

    assert.equal(seen.length, 2);
    assert.deepEqual(seen[0]?.history, []);
    assert.deepEqual(seen[1]?.history, [
      { role: "user", content: KITCHEN_SINK_QUESTION },
      { role: "assistant", content: "reply" },
    ]);
  });
});
