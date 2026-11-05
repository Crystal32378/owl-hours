// What a screen has loaded: nothing yet, a rejected first load, or its data.
export type LoadState<T> = T | "loading" | "failed";

// A rejected first load fails the screen; a rejected reload keeps what the screen already shows.
export function afterFailedLoad<T>(shown: LoadState<T>): LoadState<T> {
  return shown === "loading" ? "failed" : shown;
}
