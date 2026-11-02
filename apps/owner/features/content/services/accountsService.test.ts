// Spec: odd/tasks/owner-content.md, S5 requirement.
// Service tests for linked social accounts: Facebook Page and Instagram both connected.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accounts as mockAccounts } from "../../../shared/data/mock.ts";
import { createAccountsService, createFakeAccountsClient } from "./accountsService.ts";

function buildService() {
  return createAccountsService(createFakeAccountsClient());
}

describe("accountsService.getAccounts", () => {
  it("returns two accounts, both connected", async () => {
    const service = buildService();
    const accounts = await service.getAccounts();

    assert.equal(accounts.length, 2);
    assert.equal(
      accounts.every((account) => account.status === "connected"),
      true,
    );
  });

  it("includes Facebook Page as connected", async () => {
    const service = buildService();
    const accounts = await service.getAccounts();
    const facebook = accounts.find((a) => a.kind === "facebook_page");

    assert.notEqual(facebook, undefined);
    assert.equal(facebook?.status, "connected");
  });

  it("includes Instagram professional account as connected", async () => {
    const service = buildService();
    const accounts = await service.getAccounts();
    const instagram = accounts.find((a) => a.kind === "instagram");

    assert.notEqual(instagram, undefined);
    assert.equal(instagram?.name, "@northsideplumbing (professional)");
    assert.equal(instagram?.status, "connected");
  });
});

describe("accountsService isolation", () => {
  it("does not mutate the shared mock accounts", async () => {
    const snapshot = structuredClone(mockAccounts);
    const service = buildService();
    await service.getAccounts();

    assert.deepEqual(mockAccounts, snapshot);
  });
});

// odd/tasks/owner-meta-publishing.md S2, S4: the demo links and unlinks nothing.
describe("accountsService in the demo", () => {
  it("offers neither connecting nor unlinking", async () => {
    const service = buildService();

    assert.equal(service.canConnect, false);
    assert.equal(service.canUnlink, false);
    await assert.rejects(service.getConnectUrl("app"), /live owner API/);
    await assert.rejects(service.unlink("a1"), /live owner API/);
  });
});

describe("accountsService with the live client", () => {
  it("asks the client for the login link back to the native app and unlinks by id", async () => {
    const calls: string[] = [];
    const service = createAccountsService({
      listAccounts: async () => [],
      connectUrl: async (returnTo) => {
        calls.push(`connect ${returnTo}`);
        return "https://www.facebook.com/v26.0/dialog/oauth";
      },
      unlink: async (id) => {
        calls.push(`unlink ${id}`);
      },
    });

    assert.equal(service.canUnlink, true);
    assert.equal(await service.getConnectUrl("app"), "https://www.facebook.com/v26.0/dialog/oauth");
    await service.unlink("a1");
    assert.deepEqual(calls, ["connect app", "unlink a1"]);
  });
});
