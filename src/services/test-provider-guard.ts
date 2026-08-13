export function assertTestProviderAllowed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Production ortaminda test SMS provider kullanilamaz")
  }
}
