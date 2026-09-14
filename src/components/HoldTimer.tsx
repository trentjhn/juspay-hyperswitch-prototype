"use client";

import { useEffect, useState } from "react";

function secondsLeft(expiresAt: string): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

// Counts down the seat hold. The expiry is the payment's created timestamp
// plus HOLD_MINUTES, computed on the server, so a refresh shows the same
// clock. onExpire fires once when it reaches zero.
export default function HoldTimer({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const left = secondsLeft(expiresAt);
      setRemaining(left);
      if (left === 0) {
        clearInterval(interval);
        onExpire();
      }
    };
    const interval = setInterval(tick, 1000);
    tick();
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  if (remaining === null) return null;

  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");
  const urgent = remaining < 120;

  return (
    <p className={`text-sm ${urgent ? "text-accent" : "text-zinc-600"}`}>
      Seats held for{" "}
      <span className="font-mono font-medium tabular-nums">
        {minutes}:{seconds}
      </span>
    </p>
  );
}
