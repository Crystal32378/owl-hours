// Cloud API ceilings the builders enforce (payloads 02, 04, 07, 12, 13).
export const HEADER_MAX = 60;
export const FOOTER_MAX = 60;
export const BUTTON_BODY_MAX = 1024;
export const INTERACTIVE_BODY_MAX = 1024;

// Overflow behavior matches apps/api today: copy.ts clips with an ellipsis.
export function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
