// A live thread carries every message Zukki sent the customer; "View job and evidence" belongs under the last one.
export function messageWithJobLink(thread: ReadonlyArray<{ id: string; from: string }>): string | null {
  return thread.filter((message) => message.from === "zukki").at(-1)?.id ?? null;
}
