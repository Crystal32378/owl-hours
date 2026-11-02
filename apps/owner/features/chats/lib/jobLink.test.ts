// A live thread carries every message Zukki sent the customer; the link to the job belongs under
// the last one, not under each of them.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { messageWithJobLink } from "./jobLink.ts";

describe("messageWithJobLink", () => {
  it("is the last message from Zukki, even when others follow it", () => {
    const thread = [
      { id: "m1", from: "zukki" },
      { id: "m2", from: "customer" },
      { id: "m3", from: "zukki" },
      { id: "m4", from: "business" },
    ];

    assert.equal(messageWithJobLink(thread), "m3");
  });

  it("is nobody when Zukki sent nothing", () => {
    assert.equal(messageWithJobLink([{ id: "m1", from: "customer" }]), null);
  });
});
