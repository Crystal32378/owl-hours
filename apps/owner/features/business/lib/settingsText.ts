import type { LinkedAccount } from "../../../shared/data/types.ts";
import { settingsCopys } from "../copys/settingsCopys.ts";

// Spec: odd/tasks/owner-business.md S4: the time to accept comes from
// business.acceptWindowMin, the connected count from accounts. Expected strings
// are the composed forms in handoff-ui/owner-app/HANDOFF-RN-UI.md § "Settings".
// The glue words live in copys/settingsCopys.ts (pattern:
// features/requests/lib/mediaAltText.ts), so this module holds no visible
// strings: the value helpers own the right-hand values the screens show, and
// the joined lines compose label + value from those same pieces.
export function acceptWindowValueText(acceptWindow: { urgent: number; other: number }): string {
  return `${acceptWindow.urgent} / ${acceptWindow.other} ${settingsCopys.minuteUnit}`;
}

export function acceptWindowDetailText(acceptWindow: { urgent: number; other: number }): string {
  const { urgentWindowWord, otherWindowWord, minuteUnit, afterWindowSentence } = settingsCopys;
  return `${urgentWindowWord} ${acceptWindow.urgent} ${minuteUnit} · ${otherWindowWord} ${acceptWindow.other} ${minuteUnit}. ${afterWindowSentence}`;
}

export function linkedAccountsValueText(accounts: LinkedAccount[]): string {
  return `${connectedCount(accounts)} ${settingsCopys.connectedWord}`;
}

export function acceptWindowText(acceptWindow: { urgent: number; other: number }): string {
  return `${settingsCopys.timeToAccept}: ${acceptWindowValueText(acceptWindow)}`;
}

export function linkedAccountsText(accounts: LinkedAccount[]): string {
  return `${settingsCopys.linkedAccounts} · ${linkedAccountsValueText(accounts)}`;
}

function connectedCount(accounts: LinkedAccount[]): number {
  return accounts.filter((account) => account.status === "connected").length;
}
