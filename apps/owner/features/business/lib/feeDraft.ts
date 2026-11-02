// Extra fees on the prices screens (odd/tasks/owner-area-map-fees-dark.md S2):
// the fees with an amount are edited like prices; "at cost" fees are shown as
// they are, because PUT /business/fees never touches them.
import type { ExtraFee, FeeInput } from "../../../shared/data/types.ts";
import { isValidPrice } from "./priceValidation.ts";

export function editableFees(fees: ExtraFee[]): FeeInput[] {
  return fees.flatMap((fee) => (fee.amount === "at_cost" ? [] : [toFeeInput(fee, fee.amount)]));
}

export function fixedFees(fees: ExtraFee[]): ExtraFee[] {
  return fees.filter((fee) => fee.amount === "at_cost");
}

export function hasNoFees(drafts: FeeInput[], fixed: ExtraFee[]): boolean {
  return drafts.length === 0 && fixed.length === 0;
}

// The same limits PUT /business/fees and owner_save_fees enforce.
export const MAX_FEES = 20;
export const MAX_FEE_LABEL = 80;

export function isCompleteFee(fee: FeeInput): boolean {
  const label = fee.label.trim();
  return label !== "" && label.length <= MAX_FEE_LABEL && isValidPrice(fee.amount);
}

export function canAddFee(drafts: FeeInput[]): boolean {
  return drafts.length < MAX_FEES;
}

// A fee opened with "Add a fee" and left blank, or named but still at $0, is never saved.
export function completeFees(drafts: FeeInput[]): FeeInput[] {
  return drafts.map((fee) => ({ ...fee, label: fee.label.trim() })).filter(isCompleteFee);
}

// The fee list after a save, as the database answers it (owner_save_fees): the
// saved fees, a night fee keeping its window, then the untouched at-cost fees.
// The demo clients store their fees through here.
export function withSavedFees(current: ExtraFee[], saved: FeeInput[]): ExtraFee[] {
  const windows = new Map(current.flatMap((fee) => (fee.window ? [[fee.id, fee.window] as const] : [])));
  const stored = saved.map((fee): ExtraFee => {
    const window = fee.atNight ? windows.get(fee.id) : undefined;
    return window ? { ...fee, window } : { ...fee };
  });
  return [...stored, ...fixedFees(current)];
}

function toFeeInput(fee: ExtraFee, amount: number): FeeInput {
  return { id: fee.id, label: fee.label, amount, atNight: fee.atNight ?? fee.window !== undefined };
}
