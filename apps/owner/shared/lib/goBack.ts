type BackRouter<Href> = { canGoBack(): boolean; back(): void; replace(href: Href): void };

// Reloading a screen on the web leaves no history, and a plain router.back() then does nothing.
export function goBackOr<Href>(router: BackRouter<Href>, fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
