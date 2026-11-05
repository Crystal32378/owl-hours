import { DEMO_NOW } from "../../../shared/data/mock.ts";
import type { ISODate } from "../../../shared/data/types.ts";
import { localIsoString } from "../../../shared/lib/localIsoString.ts";

// The Chats list's "now": live, the wall clock in the device's offset, so its days match the owner's
// calendar like the message times do; the demo's night otherwise, so the timestamps match the design.
export function chatsNowFor(isLive: boolean, instant: Date): ISODate {
  return isLive ? localIsoString(instant) : DEMO_NOW;
}
