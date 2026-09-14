import Link from "next/link";
import { EVENTS, formatEventDate } from "@/lib/events";
import { formatUsd } from "@/lib/money";

export default function HomePage() {
  return (
    <>
      <section className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Upcoming events</h1>
        <p className="mt-2 max-w-xl text-zinc-600">
          Pick an event, choose a section, and pay in the Hyperswitch sandbox. Seats are held for ten minutes while you
          check out.
        </p>
      </section>

      <ul className="grid gap-4 sm:grid-cols-2">
        {EVENTS.map((event) => {
          const fromCents = Math.min(...event.sections.map((section) => section.priceCents));
          return (
            <li key={event.slug}>
              <Link
                href={`/events/${event.slug}`}
                className="block h-full rounded-lg border border-zinc-200 p-5 transition-colors hover:border-zinc-400"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-accent">{event.kind}</p>
                <h2 className="mt-1 text-xl font-semibold">{event.title}</h2>
                <p className="text-zinc-600">{event.subtitle}</p>
                <p className="mt-4 text-sm text-zinc-600">{formatEventDate(event)}</p>
                <p className="text-sm text-zinc-600">
                  {event.venue}, {event.city}
                </p>
                <p className="mt-4 text-sm font-medium">From {formatUsd(fromCents)}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
