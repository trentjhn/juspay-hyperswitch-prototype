const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Every amount in this app is an integer number of cents until it is shown.
export function formatUsd(cents: number): string {
  return usd.format(cents / 100);
}
