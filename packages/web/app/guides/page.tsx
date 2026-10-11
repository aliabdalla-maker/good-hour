import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "City guides: getting around by the hour",
  description:
    "Short guides to London, Manchester, Edinburgh, Birmingham, Glasgow and Liverpool: airports, main stations and when an hourly room, car or transfer helps.",
  alternates: { canonical: "/guides" },
};

interface CityGuide {
  city: string;
  intro: string;
  arrive: string;
  around: string;
  hourly: string;
  wikivoyage: string;
}

// Written for Good Hours. Facts are kept to stable essentials (airports,
// main stations, transport); travellers should check live times before going.
const GUIDES: CityGuide[] = [
  {
    city: "London",
    intro: "The UK capital and its biggest travel hub, with five main airports and fast rail links to the rest of the country and to Europe.",
    arrive: "Heathrow, Gatwick, Stansted, Luton and London City airports. St Pancras International handles Eurostar trains to Paris and Brussels.",
    around: "The Underground, Overground, Elizabeth line and buses all take contactless payment, so you rarely need a paper ticket.",
    hourly: "An hourly room near an airport or a major station is handy for long layovers, early flights or freshening up before a meeting.",
    wikivoyage: "https://en.wikivoyage.org/wiki/London",
  },
  {
    city: "Manchester",
    intro: "The biggest city in the North West, known for music, football and a busy business district around Spinningfields.",
    arrive: "Manchester Airport is the largest outside London. Piccadilly is the main station, with direct trains to London and the airport.",
    around: "Metrolink trams cover the city centre and suburbs; the centre itself is compact and easy to walk.",
    hourly: "Hourly car hire suits trips out to the Peak District, and a meeting room by the hour works well for visiting teams.",
    wikivoyage: "https://en.wikivoyage.org/wiki/Manchester",
  },
  {
    city: "Edinburgh",
    intro: "Scotland's capital, famous for its castle, the medieval Old Town and Georgian New Town, and the festivals every August.",
    arrive: "Edinburgh Airport is linked to the centre by tram and bus. Waverley station sits right between the Old and New Towns.",
    around: "Most sights are walkable, though the streets are steep and cobbled; Lothian buses and the tram fill the gaps.",
    hourly: "A guided walk or an airport transfer by the hour saves time, and festival season makes short daytime room stays useful.",
    wikivoyage: "https://en.wikivoyage.org/wiki/Edinburgh",
  },
  {
    city: "Birmingham",
    intro: "The UK's second-largest city, at the centre of the national rail network, with a big convention and exhibition scene.",
    arrive: "Birmingham Airport has its own station on the main line. New Street is the central station; the NEC is next to the airport.",
    around: "Trains, the West Midlands Metro tram and buses connect the centre, and the canal towpaths make pleasant walking routes.",
    hourly: "Between conference sessions at the NEC, an hourly room or meeting space nearby is often easier than going back to a hotel.",
    wikivoyage: "https://en.wikivoyage.org/wiki/Birmingham",
  },
  {
    city: "Glasgow",
    intro: "Scotland's largest city, with a lively music scene, Victorian architecture and the leafy West End around the university.",
    arrive: "Glasgow Airport is a short bus ride from the centre. Central and Queen Street are the two main rail stations.",
    around: "The Subway runs in a simple loop through the centre and West End, and frequent trains reach the coast and Loch Lomond.",
    hourly: "Hourly car hire is a good fit for a day trip to the Highlands or Loch Lomond without committing to a full rental.",
    wikivoyage: "https://en.wikivoyage.org/wiki/Glasgow",
  },
  {
    city: "Liverpool",
    intro: "A historic port city on the River Mersey, known for its waterfront, museums, football and Beatles heritage.",
    arrive: "Liverpool John Lennon Airport is south of the city. Lime Street is the main station, with direct trains to London and Manchester.",
    around: "The centre and waterfront are walkable, and Merseyrail trains link the city with the Wirral and the coast.",
    hourly: "For match days and concerts, a room for a few hours near the centre can be simpler than an overnight stay.",
    wikivoyage: "https://en.wikivoyage.org/wiki/Liverpool",
  },
];

export default function GuidesPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">City guides</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Quick essentials for the cities our travellers visit most, and where booking by the hour helps. Always check
        live travel times before you set off.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {GUIDES.map((g) => (
          <section key={g.city} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl font-semibold">{g.city}</h2>
            <p className="mt-2 text-sm text-slate-600">{g.intro}</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-medium text-slate-800">Arriving</dt>
                <dd className="text-slate-600">{g.arrive}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-800">Getting around</dt>
                <dd className="text-slate-600">{g.around}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-800">When hourly helps</dt>
                <dd className="text-slate-600">{g.hourly}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
              <Link href="/search" className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white transition hover:bg-brand-700">
                Search {g.city}
              </Link>
              <a href={g.wikivoyage} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">
                More on Wikivoyage
              </a>
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 text-xs text-slate-500">
        Guides written by Good Hours. For in-depth travel information see{" "}
        <a href="https://en.wikivoyage.org" target="_blank" rel="noopener noreferrer" className="underline">
          Wikivoyage
        </a>
        , the free, community-written travel guide.
      </p>
    </div>
  );
}
