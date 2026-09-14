import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EVENTS, formatEventDate, getEvent } from "@/lib/events";
import SeatPicker from "./SeatPicker";

export function generateStaticParams() {
  return EVENTS.map((event) => ({ slug: event.slug }));
}

export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: getEvent(slug)?.title ?? "Event" };
}

export default async function EventPage({ params }: PageProps<"/events/[slug]">) {
  const { slug } = await params;
  const event = getEvent(slug);
  if (!event) notFound();

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_400px]">
      <article>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">{event.kind}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{event.title}</h1>
        <p className="text-lg text-zinc-600">{event.subtitle}</p>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">When</dt>
            <dd className="font-medium">{formatEventDate(event)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Where</dt>
            <dd className="font-medium">
              {event.venue}, {event.city}
            </dd>
          </div>
        </dl>

        <p className="mt-6 max-w-prose text-zinc-700">{event.blurb}</p>
      </article>

      <SeatPicker event={event} />
    </div>
  );
}
