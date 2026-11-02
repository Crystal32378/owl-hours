import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WhatsAppApiError,
  buttonMessage,
  createWhatsAppClient,
  listMessage,
  locationRequestMessage,
  textMessage,
} from "../src/index.ts";

type Call = { url: string; init: RequestInit };

function fakeFetch(reply: (call: Call) => Response) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return reply(call);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const TOKEN = "test-token-not-real";

describe("createWhatsAppClient", () => {
  it("sends to the phone number's messages endpoint and returns the wamid", async () => {
    const { impl, calls } = fakeFetch(() => json({ messages: [{ id: "wamid.OUT1" }] }));
    const client = createWhatsAppClient({ accessToken: TOKEN, phoneNumberId: "1234567890", fetch: impl });
    const id = await client.send(textMessage("15551234567", "Hello"));
    assert.equal(id, "wamid.OUT1");
    assert.equal(calls[0]?.url, "https://graph.facebook.com/v23.0/1234567890/messages");
    const headers = calls[0]?.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234567",
      type: "text",
      text: { preview_url: false, body: "Hello" },
    });
  });

  it("turns a Meta error into WhatsAppApiError without the token", async () => {
    const { impl } = fakeFetch(() => json({ error: { message: "Invalid OAuth access token.", code: 190 } }, 401));
    const client = createWhatsAppClient({ accessToken: TOKEN, phoneNumberId: "1", fetch: impl });
    await assert.rejects(client.send(textMessage("15551234567", "x")), (error: unknown) => {
      assert.ok(error instanceof WhatsAppApiError);
      assert.equal(error.status, 401);
      assert.equal(error.code, 190);
      assert.ok(!error.message.includes(TOKEN));
      return true;
    });
  });

  it("talks to a configured Graph host and downloads media only from that origin", async () => {
    const { impl, calls } = fakeFetch(({ url }) =>
      url.endsWith("/messages") ? json({ messages: [{ id: "wamid.LOCAL" }] }) : new Response(new Uint8Array([7])),
    );
    const client = createWhatsAppClient({ accessToken: TOKEN, phoneNumberId: "1234567890", graphHost: "http://127.0.0.1:4010", fetch: impl });

    assert.equal(await client.send(textMessage("15551234567", "Hello")), "wamid.LOCAL");
    assert.equal(calls[0]?.url, "http://127.0.0.1:4010/v23.0/1234567890/messages");
    assert.deepEqual([...(await client.download("http://127.0.0.1:4010/media/sink.mp4"))], [7]);
    await assert.rejects(client.download("http://127.0.0.1:9999/media/sink.mp4"), /refusing/);
    await assert.rejects(client.download("https://lookaside.fbsbx.com/x"), /refusing/);
  });

  it("refuses a loopback media URL when no Graph host is configured", async () => {
    const { impl, calls } = fakeFetch(() => new Response(new Uint8Array([1])));
    const client = createWhatsAppClient({ accessToken: TOKEN, phoneNumberId: "1234567890", fetch: impl });

    await assert.rejects(client.download("http://127.0.0.1:4010/media/sink.mp4"), /refusing/);
    assert.equal(calls.length, 0);
  });

  it("looks up media then downloads it from Meta's host", async () => {
    const { impl, calls } = fakeFetch((call) =>
      call.url.includes("/v23.0/MEDIA1")
        ? json({ url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1", mime_type: "video/mp4", file_size: 3 })
        : new Response(new Uint8Array([1, 2, 3])),
    );
    const client = createWhatsAppClient({ accessToken: TOKEN, phoneNumberId: "1", fetch: impl });
    const info = await client.getMedia("MEDIA1");
    assert.deepEqual(info, { url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1", mimeType: "video/mp4", sizeBytes: 3 });
    assert.deepEqual([...(await client.download(info.url))], [1, 2, 3]);
    assert.equal(calls.length, 2);
  });

  it("marks a message read with the typing indicator (payload 03)", async () => {
    const { impl, calls } = fakeFetch(() => json({ success: true }));
    const client = createWhatsAppClient({ accessToken: TOKEN, phoneNumberId: "1234567890", fetch: impl });
    await client.markRead("wamid.IN1", { typing: true });
    assert.equal(calls[0]?.url, "https://graph.facebook.com/v23.0/1234567890/messages");
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.IN1",
      typing_indicator: { type: "text" },
    });
  });

  it("never sends the token to a host outside Meta", async () => {
    const { impl, calls } = fakeFetch(() => new Response("x"));
    const client = createWhatsAppClient({ accessToken: TOKEN, phoneNumberId: "1", fetch: impl });
    await assert.rejects(client.download("https://evil.example/fbsbx.com"), /refusing/);
    await assert.rejects(client.download("https://notfbsbx.com/x"), /refusing/);
    assert.equal(calls.length, 0);
  });
});

describe("buttonMessage", () => {
  it("builds reply buttons with footer and header", () => {
    const message = buttonMessage("15551234567", {
      body: "Hi",
      buttons: [{ id: "reply_ok", title: "Sounds good" }],
      footer: "Written with Zukki, approved by Northside",
      headerText: "Quote",
    });
    assert.deepEqual(message, {
      to: "15551234567",
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Hi" },
        action: { buttons: [{ type: "reply", reply: { id: "reply_ok", title: "Sounds good" } }] },
        footer: { text: "Written with Zukki, approved by Northside" },
        header: { type: "text", text: "Quote" },
      },
    });
  });

  it("puts an image in the header (payload 04)", () => {
    const message = buttonMessage("15551234567", {
      body: "Turn this valve clockwise.",
      buttons: [{ id: "safety_done", title: "Done, no cables" }],
      headerImageUrl: "https://example.supabase.co/marked.jpg",
    });
    assert.deepEqual((message.interactive as Record<string, unknown>).header, {
      type: "image",
      image: { link: "https://example.supabase.co/marked.jpg" },
    });
  });
});

describe("listMessage", () => {
  it("builds a list with sections and a footer (payload 02)", () => {
    const message = listMessage("15551234567", {
      body: "What are you looking for?",
      button: "See options",
      sections: [{ title: "Home", rows: [{ id: "cat_plumbing", title: "Plumbing", description: "Leaks" }] }],
      footer: "Only businesses open now and near you",
    });
    assert.deepEqual(message, {
      to: "15551234567",
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: "What are you looking for?" },
        action: {
          button: "See options",
          sections: [{ title: "Home", rows: [{ id: "cat_plumbing", title: "Plumbing", description: "Leaks" }] }],
        },
        footer: { text: "Only businesses open now and near you" },
      },
    });
  });
});

describe("locationRequestMessage", () => {
  it("asks for the location with WhatsApp's own button (payload 05)", () => {
    assert.deepEqual(locationRequestMessage("15551234567", "Share your location."), {
      to: "15551234567",
      type: "interactive",
      interactive: {
        type: "location_request_message",
        body: { text: "Share your location." },
        action: { name: "send_location" },
      },
    });
  });
});
