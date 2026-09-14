// Static catalogue. A production ticketing system keeps inventory in a
// database behind a reservation service; the prototype only needs enough
// shape to price an order and describe it on the payment.

export type Section = {
  id: string;
  name: string;
  detail: string;
  priceCents: number;
  seatsLeft: number;
};

export type Event = {
  slug: string;
  title: string;
  subtitle: string;
  kind: "Football" | "Concert" | "Basketball" | "Comedy";
  venue: string;
  city: string;
  startsAt: string;
  timeZone: string;
  blurb: string;
  sections: Section[];
};

export const MAX_TICKETS_PER_ORDER = 8;

export const EVENTS: Event[] = [
  {
    slug: "yale-harvard-2026",
    title: "Yale vs. Harvard",
    subtitle: "The Game",
    kind: "Football",
    venue: "Yale Bowl",
    city: "New Haven, CT",
    startsAt: "2026-11-21T12:00:00-05:00",
    timeZone: "America/New_York",
    blurb:
      "The oldest rivalry in college football, back in the Bowl. Kickoff at noon, tailgates open at eight. Student sections sell out in the first hour of the on-sale.",
    sections: [
      { id: "endzone", name: "End Zone", detail: "Sections 1 to 4, bench seating", priceCents: 3500, seatsLeft: 412 },
      { id: "sideline", name: "Sideline", detail: "Sections 12 to 20, chairback", priceCents: 8500, seatsLeft: 138 },
      { id: "premium", name: "Premium Sideline", detail: "Rows A to F at midfield", priceCents: 14000, seatsLeft: 24 },
    ],
  },
  {
    slug: "the-longshore-forum",
    title: "The Longshore",
    subtitle: "Slow Signal Tour",
    kind: "Concert",
    venue: "Kia Forum",
    city: "Inglewood, CA",
    startsAt: "2026-10-09T20:00:00-07:00",
    timeZone: "America/Los_Angeles",
    blurb:
      "Second of two nights. Doors at seven, support act at eight, headliner around nine fifteen. Floor is general admission and standing only.",
    sections: [
      { id: "upper", name: "Upper Bowl", detail: "Sections 201 to 236", priceCents: 7900, seatsLeft: 1240 },
      { id: "lower", name: "Lower Bowl", detail: "Sections 101 to 130, reserved", priceCents: 16500, seatsLeft: 316 },
      { id: "floor", name: "Floor", detail: "General admission, standing", priceCents: 24500, seatsLeft: 90 },
    ],
  },
  {
    slug: "uconn-villanova-2026",
    title: "UConn vs. Villanova",
    subtitle: "Big East men's basketball",
    kind: "Basketball",
    venue: "XL Center",
    city: "Hartford, CT",
    startsAt: "2026-12-05T19:00:00-05:00",
    timeZone: "America/New_York",
    blurb:
      "Conference opener in Hartford. Courtside seats are released in pairs and rarely make it past the presale.",
    sections: [
      { id: "upper", name: "Upper Level", detail: "Sections 201 to 232", priceCents: 4200, seatsLeft: 620 },
      { id: "lower", name: "Lower Level", detail: "Sections 101 to 124", priceCents: 9800, seatsLeft: 210 },
      { id: "courtside", name: "Courtside", detail: "Row AA, sold in pairs", priceCents: 32000, seatsLeft: 6 },
    ],
  },
  {
    slug: "late-set-wilbur",
    title: "Late Set",
    subtitle: "Stand-up showcase, four comics, one night",
    kind: "Comedy",
    venue: "The Wilbur",
    city: "Boston, MA",
    startsAt: "2026-10-17T22:00:00-04:00",
    timeZone: "America/New_York",
    blurb: "Ten o'clock show. Two-item minimum at the tables, none in the balcony. Eighteen and over.",
    sections: [
      { id: "balcony", name: "Balcony", detail: "Reserved, rows A to H", priceCents: 3800, seatsLeft: 96 },
      { id: "orchestra", name: "Orchestra", detail: "Table seating, rows 1 to 12", priceCents: 6200, seatsLeft: 140 },
    ],
  },
];

export function getEvent(slug: string): Event | undefined {
  return EVENTS.find((event) => event.slug === slug);
}

export function formatEventDate(event: Pick<Event, "startsAt" | "timeZone">): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timeZone,
    timeZoneName: "short",
  }).format(new Date(event.startsAt));
}
