// Reloading a screen on the web leaves no history, and a plain router.back() then does nothing.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { goBackOr } from "./goBack.ts";

function fakeRouter(canGoBack: boolean) {
  const calls: string[] = [];
  return {
    calls,
    canGoBack: () => canGoBack,
    back: () => calls.push("back"),
    replace: (href: string) => calls.push(`replace ${href}`),
  };
}

describe("goBackOr", () => {
  it("goes back when there is history", () => {
    const router = fakeRouter(true);

    goBackOr(router, "/(tabs)/chats");

    assert.deepEqual(router.calls, ["back"]);
  });

  it("goes to the fallback when there is none", () => {
    const router = fakeRouter(false);

    goBackOr(router, "/(tabs)/chats");

    assert.deepEqual(router.calls, ["replace /(tabs)/chats"]);
  });
});
