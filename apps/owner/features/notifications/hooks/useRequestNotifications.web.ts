// Web has no push (expo-notifications throws UnavailabilityError there), so the
// owner web app registers no request category and handles no push responses.
export function useRequestNotifications(): void {}
