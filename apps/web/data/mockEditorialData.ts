/**
 * PHASE 0 DEMONSTRATION DATA — NOT EDITORIAL CONTENT. Contains unverified claims, figures
 * and dates. Since Batch A it is never seeded, rendered or imported by public code; the only
 * remaining consumer is the local legacy-repair script scripts/seed-rodeo-links.mts, which
 * reads ids from it and never writes any of this text. Do not import it anywhere else
 * (enforced by tests/public-content.test.ts and tests/batchB.test.ts).
 */
import {
  Article,
  Discipline,
  QuickLinkItem,
  PlanGuide,
  EntertainmentFeature,
  ShoppingEvent,
  RodeoHub,
  RecurringRodeoEvent,
  LearningItem,
  PrimarySection,
} from '../types';

export const AUTHORS = {
  clayton: {
    name: 'Clayton Vance',
    role: 'Senior Rodeo Correspondent',
    credentials: 'PRCA Press Credentialed since 2014 & Former Intercollegiate Saddle Bronc Athlete',
    editorialBeat: 'Roughstock, Stock Contracting & Championship Aggregate Scoring',
    bio: 'Clayton Vance has covered the National Finals Rodeo and summer circuit for over twelve seasons. A former college rodeo athlete in Wyoming, his analytical reporting focuses on equine kinematics, scoring nuance, and the mental marathon of championship week.',
  },
  elena: {
    name: 'Elena Morales',
    role: 'Staff Editor & Historical Researcher',
    credentials: 'MA Sports Journalism, Western Sports Heritage Contributor',
    editorialBeat: 'WPRA Barrel Racing, Statistical Scoring & Circuit Qualification',
    bio: 'Elena Morales specializes in the statistical evolution of ProRodeo world standings, women’s western sports history, and timed-event mechanics across the North American circuits.',
  },
  marcus: {
    name: 'Marcus Sterling',
    role: 'Travel, Venue & Broadcast Editor',
    credentials: 'Las Vegas Hospitality & Broadcast Media Analyst',
    editorialBeat: 'Spectator Logistics, Television Rights & Arena Operations',
    bio: 'Marcus Sterling investigates the logistical reality behind major arena sports in Nevada, with an emphasis on consumer-first ticketing clarity, streaming rights, and venue transportation infrastructure.',
  },
  sarah: {
    name: 'Sarah Jenkins',
    role: 'Western Lifestyle & Culture Editor',
    credentials: 'Artisan Silversmithing & Heritage Leathercraft Historian',
    editorialBeat: 'Cowboy Christmas, Artisan Culture & Western Economics',
    bio: 'Sarah Jenkins tracks the artisanal heartbeat of the American West, reviewing custom saddlery, generational silversmiths, and the economic landscape of western lifestyle expos.',
  },
};

export const HERO_ARTICLE: Article = {
  id: 'hero-lead-01',
  slug: 'inside-the-chutes-nfr-roughstock-intensity',
  title: 'Inside the Chutes: Why the 8-Second Ride Remains Sport’s Purest Crucible',
  deck: 'Beyond the roar of 17,000 spectators at the Thomas & Mack Center lies the quiet, calculated preparation of world-class roughstock athletes defying physics and sheer animal power.',
  excerpt: 'A comprehensive technical look at roughstock riding at the National Finals Rodeo, examining how judges split 100 points, the rotation of livestock pens, and the physical demands of ten consecutive nights.',
  category: 'NFR Competition',
  subcategory: 'Championship Analysis',
  articleType: 'feature',
  status: 'published',
  readTime: '6 min read',
  author: AUTHORS.clayton,
  publishedAt: 'October 27, 2026',
  updatedAt: 'October 27, 2026',
  reviewedAt: 'October 27, 2026',
  heroImage: '/assets/images/hero_bull_riding_1793166440262.jpg',
  imageCredit: 'Editorial Staff Archives / NFRGuide Action Photography',
  isLeadHero: true,
  tags: ['NFR Competition', 'Bull Riding', 'Saddle Bronc', 'Roughstock Mechanics', 'Thomas & Mack'],
  takeaways: [
    'The 10-round format demands stamina unlike any single weekend rodeo on the ProRodeo tour.',
    'Stock contractors rotate pen tiers from "TV pen" to "eliminator pen" across designated go-rounds.',
    'Judges award up to 50 points to the rider and 50 points to the bucking animal, making the stock draw equally critical.',
  ],
  pullQuote: {
    quote: 'In those eight seconds, there is no playbook or timeout. It is pure instinct, raw physical equilibrium, and absolute respect between athlete and animal.',
    attribution: 'Clayton Vance, Senior Rodeo Correspondent',
  },
  content: [
    'When the metal gate swings open in the Thomas & Mack Center dirt arena, the collective breath of Las Vegas suspends. For eight seconds, world-class athletes engage in one of the most demanding physical contests in global athletics.',
    'The National Finals Rodeo is not a tournament of elimination; it is a ten-night marathon known throughout the industry as "The 10-Day Grind." Competitors who qualified in the top 15 of their respective world standings face the premier bucking stock assembled on North American soil.',
    'Unlike standard sporting events where the opponent is human, rodeo roughstock riders compete in synchronization with a partner that has no interest in cooperating. Bull riding and saddle bronc judging evaluates the animal’s degree of difficulty, kick height, and change of direction on a 50-point scale, matched against the contestant’s spurring rhythm and balance on an identical 50-point scale.',
    'As the championship rounds unfold each December, the aggregate race—the average score across all ten performances—often determines the coveted PRCA World Champion Gold Buckle, rewarding relentless consistency over flash.',
  ],
  structuredBody: [
    {
      type: 'paragraph',
      text: 'When the metal gate swings open in the Thomas & Mack Center dirt arena, the collective breath of Las Vegas suspends. For eight seconds, world-class athletes engage in one of the most demanding physical contests in global athletics.',
      isDropCap: true,
    },
    {
      type: 'heading',
      level: 2,
      id: 'the-ten-day-grind',
      text: 'The Ten-Day Grind: Why Las Vegas Is Unlike Any Other Arena',
    },
    {
      type: 'paragraph',
      text: 'The National Finals Rodeo is not an elimination bracket. It is a ten-performance test of endurance known across the industry as "The 10-Day Grind." Competitors who qualified in the top 15 of the PRCA world standings encounter premier bucking stock selected from over 40 distinct stock contracting firms across the United States and Canada.',
    },
    {
      type: 'quote',
      quote: 'In those eight seconds, there is no playbook or timeout. It is pure instinct, raw physical equilibrium, and absolute respect between athlete and animal.',
      attribution: 'Clayton Vance',
      role: 'Senior Rodeo Correspondent',
    },
    {
      type: 'heading',
      level: 2,
      id: 'scoring-breakdown',
      text: 'The 50/50 Evaluation: Dissecting the 100-Point Formula',
    },
    {
      type: 'paragraph',
      text: 'A common misconception among first-time viewers is that only the human athlete receives a score. In reality, two official PRCA judges each award up to 25 points for the rider’s form, spurring rhythm, and control, and 25 points for the bucking animal’s athletic difficulty, kick extension, and change of direction.',
    },
    {
      type: 'table',
      caption: 'Official PRCA Roughstock Scoring Model (100 Maximum Points)',
      headers: ['Judging Dimension', 'Assigned Value', 'Key Evaluation Factors'],
      rows: [
        ['Contestant Technique', '1–50 Points', 'Spur stroke cadence, free hand control, body balance, toe flare'],
        ['Livestock Difficulty', '1–50 Points', 'Bucking kick height, drop, directional spin, unpredictability'],
        ['Combined Score', '100 Points Max', '88+ indicates round contention; 90+ denotes legendary rides'],
      ],
    },
    {
      type: 'heading',
      level: 2,
      id: 'pen-rotation',
      text: 'The Pen Rotation: Eliminator Pens vs. The "TV Pen"',
    },
    {
      type: 'paragraph',
      text: 'Stock contractors do not randomly shuffle stock into the chutes. Go-rounds are systematically divided into specific pen tiers. Round 1 and Round 6 often showcase the "TV pen"—animals renowned for high-flying, rhythmic bucking that allow riders to showcase maximum spurring style. Rounds 3 and 8 traditionally feature the "eliminator pen"—notoriously difficult, hard-turning animals where simply making the 8-second whistle constitutes a major victory.',
    },
    {
      type: 'callout',
      variant: 'takeaway',
      title: 'Editorial Insight: Stock Draw Impact',
      text: 'An athlete drawing an animal from the eliminator pen may ride with flawless technical form yet score only 81 points if the animal stalls or fails to turn. The random chute draw remains rodeo’s most unpredictable variable.',
    },
    {
      type: 'heading',
      level: 2,
      id: 'aggregate-championship',
      text: 'The Aggregate Race: Consistency Over Single-Round Flash',
    },
    {
      type: 'paragraph',
      text: 'While individual go-round wins deliver lucrative nightly checks ($30,000+ per round), the championship gold buckle is overwhelmingly decided by the 10-round aggregate—colloquially called "the Average." Contestants who ride all ten head clean accumulate points that routinely vault them over single-round winners in the final world standings calculations.',
    },
    {
      type: 'disclosure',
      text: 'Independent Rodeo Editorial Notice: NFRGuide.com provides objective analysis and is not affiliated with the PRCA, Las Vegas Events, or official championship organizers.',
      variant: 'editorial',
    },
  ],
  sources: [
    {
      id: 'src-01',
      title: 'PRCA Rule Book & Judicial Handbook',
      publisher: 'Professional Rodeo Cowboys Association',
      date: '2026 Edition',
      note: 'Official rule specifications on roughstock scoring and mark-out guidelines.',
    },
    {
      id: 'src-02',
      title: 'Thomas & Mack Center Performance Archives',
      publisher: 'Las Vegas Events Statistical Records',
      date: '1985–2025 Historical Dataset',
      note: 'Historical 10-round aggregate benchmarks.',
    },
  ],
  associatedDisciplineId: 'disc-bull-riding',
  relatedArticleIds: ['art-01', 'hero-sec-01', 'art-03'],
};

export const SECONDARY_HERO_STORIES: Article[] = [
  {
    id: 'hero-sec-01',
    slug: 'the-anatomy-of-the-10-round-average',
    title: 'The Anatomy of the Average: How the Gold Buckle Is Truly Won in Round 10',
    deck: 'Why go-round paychecks make headlines, but the grueling 10-round aggregate check crowns the undisputed champion.',
    excerpt: 'An analytical dissection of the PRCA points and money distribution system that rewards 10-round aggregate consistency.',
    category: 'NFR Competition',
    subcategory: 'Scoring & Tactics',
    articleType: 'analysis',
    status: 'published',
    readTime: '4 min read',
    author: AUTHORS.elena,
    publishedAt: 'October 26, 2026',
    heroImage: '/assets/images/saddle_bronc_action_1793166440982.jpg',
    imageCredit: 'PRCA Photo Archives / Visual Demonstration',
    tags: ['Scoring', 'Aggregate', 'Gold Buckle', 'Round 10'],
    content: [
      'While individual go-round wins pay handsome nightly purses, the true mathematical leverage in Las Vegas belongs to the average.',
      'Riders who ride clean through all ten head consistently overcome go-round specialists when Sunday evening points are tallied.',
    ],
    structuredBody: [
      {
        type: 'paragraph',
        text: 'While individual go-round wins pay handsome nightly purses, the true mathematical leverage in Las Vegas belongs to the average.',
        isDropCap: true,
      },
      {
        type: 'heading',
        level: 2,
        id: 'average-points-structure',
        text: 'The High Stakes of the 10-Head Aggregate',
      },
      {
        type: 'paragraph',
        text: 'At the conclusion of Round 10, the total times or combined scores across all ten performances are tallied. The top eight contestants in each event split a colossal aggregate purse that often exceeds the earnings of winning three separate go-rounds combined.',
      },
      {
        type: 'quote',
        quote: 'You can win three rounds and go home third in the world if you buck off the other seven head. The average is the mountain you have to climb.',
        attribution: 'Elena Morales',
        role: 'Staff Editor',
      },
    ],
    relatedArticleIds: ['hero-lead-01', 'art-01'],
  },
  {
    id: 'hero-sec-02',
    slug: 'las-vegas-in-december-insiders-logistics',
    title: 'Las Vegas in December: A Tactical Guide to the Strip’s Busiest Ten Days',
    deck: 'From shuttle timing to ticket verification protocols, how to navigate the city when 200,000 western sports fans converge.',
    excerpt: 'Visitor logistics and transit strategies for navigating the Thomas & Mack Center, Tropicana corridor, and Las Vegas Convention Center during NFR.',
    category: 'NFR Plan & Watch',
    subcategory: 'Spectator Strategy',
    articleType: 'guide',
    status: 'published',
    readTime: '5 min read',
    author: AUTHORS.marcus,
    publishedAt: 'October 25, 2026',
    heroImage: '/assets/images/las_vegas_rodeo_night_1793166441250.jpg',
    imageCredit: 'NFRGuide Travel Photography / Editorial Archive',
    tags: ['Las Vegas', 'Travel Guide', 'Shuttle Routes', 'Thomas & Mack'],
    content: [
      'Traffic between Tropicana Avenue and Paradise Road reaches peak density two hours before the 5:45 PM grand entry.',
      'Smart visitors leverage hotel park-and-ride shuttles operated by major host resorts rather than navigating rideshare surge zones.',
    ],
    structuredBody: [
      {
        type: 'paragraph',
        text: 'Traffic between Tropicana Avenue and Paradise Road reaches peak density two hours before the 5:45 PM grand entry.',
        isDropCap: true,
      },
      {
        type: 'heading',
        level: 2,
        id: 'transit-tips',
        text: 'Avoiding the Swenson & Tropicana Bottleneck',
      },
      {
        type: 'paragraph',
        text: 'Rideshare queues at the Thomas & Mack Center post-performance can exceed 90 minutes. Dedicated hotel shuttles provided by host properties provide prioritized arterial lane access that returns fans to resorts in a fraction of the time.',
      },
    ],
    relatedArticleIds: ['art-03', 'art-04'],
  },
];

export const LATEST_COVERAGE_ARTICLES: Article[] = [
  {
    id: 'art-01',
    slug: 'saddle-bronc-riding-the-classic-event-evolution',
    title: 'Saddle Bronc Riding: The Pure Grace and Rhythmic Physics of Rodeo’s Classic Event',
    deck: 'Regarded as the cradle of competitive cowboy sport, saddle bronc demands a synchrony between spur stroke and horse descent that few outside the sport comprehend.',
    excerpt: 'An in-depth study of saddle bronc mechanics, examining the association saddle, spur stroke length, and the unforgiving mark-out rule.',
    category: 'NFR Competition',
    subcategory: 'Discipline Deep Dive',
    articleType: 'analysis',
    status: 'published',
    readTime: '5 min read',
    author: AUTHORS.clayton,
    publishedAt: 'October 27, 2026',
    heroImage: '/assets/images/saddle_bronc_action_1793166440982.jpg',
    imageCredit: 'Sports Media Pool / Demonstration Asset',
    tags: ['Saddle Bronc', 'Roughstock', 'Rodeo Physics', 'Equipment'],
    takeaways: [
      'The rider must keep spurs over the horse’s shoulders until the initial jump lands (the "mark out" rule).',
      'Loss of stirrup or touching animal with free hand results in immediate disqualification.',
    ],
    content: [
      'Rooted in the historical necessity of working ranch horse breaking, saddle bronc riding elevates horsepower into a rigorous athletic balance.',
      'Unlike bareback where riders pull against a rigid rigging handle, saddle bronc riders hold a single braided bucking rein attached to an unweighted halter.',
    ],
    structuredBody: [
      {
        type: 'paragraph',
        text: 'Rooted in the historical necessity of working ranch horse breaking, saddle bronc riding elevates horsepower into a rigorous athletic balance.',
        isDropCap: true,
      },
      {
        type: 'heading',
        level: 2,
        id: 'the-spur-stroke',
        text: 'The Cadence: Spurring from Neck to Cantle',
      },
      {
        type: 'paragraph',
        text: 'In saddle bronc riding, the competitor must synchronize their spur stroke with the horse’s bucking cycle. As the horse’s front hooves strike the dirt, the rider’s spurs must be forward on the horse’s neck. As the animal kicks out behind, the rider pulls the spurs upward toward the cantle of the saddle in an unbroken rhythmic sweep.',
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Rule Highlight: The Mark Out',
        text: 'Failure to have the spurs above the point of the horse’s shoulders when the horse’s front feet touch the arena dirt on the first jump out of the chute results in an immediate "no mark out" disqualification (zero score).',
      },
    ],
    associatedDisciplineId: 'disc-saddle-bronc',
    relatedArticleIds: ['hero-lead-01', 'hero-sec-01'],
  },
  {
    id: 'art-02',
    slug: 'cowboy-christmas-2026-buyers-handcrafted-curation',
    title: 'Cowboy Christmas Curated: Finding Master Silversmiths and Custom Hatmakers',
    deck: 'Covering 500,000 square feet inside the Las Vegas Convention Center, our editors highlight heirloom leatherwork and artisan makers worth discovering.',
    excerpt: 'An independent shopping and craftsmanship guide through the sprawling Cowboy Christmas convention halls in Las Vegas.',
    category: 'NFR Events & Shopping',
    subcategory: 'Exhibition & Tack',
    articleType: 'guide',
    status: 'published',
    readTime: '4 min read',
    author: AUTHORS.sarah,
    publishedAt: 'October 26, 2026',
    heroImage: '/assets/images/cowboy_christmas_market_1793166441923.jpg',
    imageCredit: 'Editorial Exhibition Coverage / Las Vegas',
    tags: ['Cowboy Christmas', 'Western Shopping', 'Artisans', 'Convention Center'],
    content: [
      'For ten days each December, the Las Vegas Convention Center transforms into the largest Western lifestyle marketplace on the continent.',
      'From 100X beaver felt hats hand-shaped on vintage wooden blocks to custom hand-engraved silver buckles, the craftsmanship spans generations.',
    ],
    structuredBody: [
      {
        type: 'paragraph',
        text: 'For ten days each December, the Las Vegas Convention Center transforms into the largest Western lifestyle marketplace on the continent.',
        isDropCap: true,
      },
      {
        type: 'heading',
        level: 2,
        id: 'artisan-standards',
        text: 'What Distinguishes Heirloom Western Craftsmanship',
      },
      {
        type: 'paragraph',
        text: 'While mass-produced imported goods exist on outer perimeter aisles, the core of Cowboy Christmas is defined by generational families crafting saddles, custom boots, and sterling silver filigree that endure for fifty years.',
      },
      {
        type: 'disclosure',
        text: 'Shopping Transparency: NFRGuide accepts no financial compensation or booth fees from featured makers. Curations are strictly editorial.',
        variant: 'editorial',
      },
    ],
    relatedArticleIds: ['art-05', 'hero-sec-02'],
  },
  {
    id: 'art-03',
    slug: 'how-to-watch-nfr-streaming-cable-cord-cutters',
    title: 'The Spectator’s Broadcast Guide: How to Stream Every Round Live and On Demand',
    deck: 'Clear, impartial instructions for linear cable subscribers, international viewers, and cord-cutters preparing their December viewing setup.',
    excerpt: 'Detailed broadcast intelligence on streaming passes, dedicated networks, replay restrictions, and international viewing access.',
    category: 'NFR Plan & Watch',
    subcategory: 'Broadcast Intelligence',
    articleType: 'guide',
    status: 'published',
    readTime: '4 min read',
    author: AUTHORS.marcus,
    publishedAt: 'October 25, 2026',
    heroImage: '/assets/images/las_vegas_rodeo_night_1793166441250.jpg',
    imageCredit: 'Broadcast Analysis / Editorial Guide',
    tags: ['Broadcast Guide', 'Streaming', 'Live TV', 'Cord Cutters'],
    content: [
      'Live coverage of all ten performances broadcasts primarily via dedicated Western sports television networks and streaming platforms.',
      'Fans outside North America should review regional geo-unlocked streaming passes well ahead of Round 1 to ensure seamless access.',
    ],
    structuredBody: [
      {
        type: 'paragraph',
        text: 'Live coverage of all ten performances broadcasts primarily via dedicated Western sports television networks and streaming platforms.',
        isDropCap: true,
      },
      {
        type: 'heading',
        level: 2,
        id: 'cable-vs-streaming',
        text: 'Linear Television vs. Digital Streaming Passes',
      },
      {
        type: 'paragraph',
        text: 'Subscribers with traditional satellite or cable providers typically receive the nightly 5:45 PM PST telecasts as part of sports packages. Cord cutters must secure an authorized streaming pass through the official rightsholders.',
      },
      {
        type: 'callout',
        variant: 'warning',
        title: 'Consumer Warning: Unauthorized Streaming Links',
        text: 'Beware of social media links promising free HD live streams of the NFR. These domains frequently host phishing attempts or subscription rebilling scams. Only purchase through verified broadcaster platforms.',
      },
    ],
    relatedArticleIds: ['hero-sec-02', 'art-04'],
  },
  {
    id: 'art-04',
    slug: 'hotel-district-breakdown-las-vegas-resort-corridor',
    title: 'The NFR Hotel Matrix: Comparing South Point, Strip Resorts, and Downtown Suites',
    deck: 'Analyzing shuttle availability, complimentary watch party environments, and proximity to the Thomas & Mack Center.',
    excerpt: 'Comparative analysis of Las Vegas hotel districts during NFR week, weighing shuttle routes, equestrian events, and price curves.',
    category: 'NFR Plan & Watch',
    subcategory: 'Accommodations',
    articleType: 'guide',
    status: 'published',
    readTime: '6 min read',
    author: AUTHORS.marcus,
    publishedAt: 'October 24, 2026',
    heroImage: '/assets/images/las_vegas_rodeo_night_1793166441250.jpg',
    imageCredit: 'Las Vegas Tourism Archive',
    tags: ['Hotels', 'Las Vegas Strip', 'South Point', 'Travel Matrix'],
    content: [
      'Every major Las Vegas property caters uniquely to the rodeo demographic during championship week.',
      'While the South Point Hotel serves as the equestrian headquarters with nightly buckle presentations, Strip properties provide direct monorail access.',
    ],
    structuredBody: [
      {
        type: 'paragraph',
        text: 'Every major Las Vegas property caters uniquely to the rodeo demographic during championship week.',
        isDropCap: true,
      },
      {
        type: 'heading',
        level: 2,
        id: 'district-comparisons',
        text: 'The Three Primary Lodging Hubs',
      },
      {
        type: 'table',
        caption: 'NFR Hotel District Strategic Comparison',
        headers: ['District', 'Atmosphere & Demographics', 'Shuttle Efficiency', 'Evening Vibe'],
        rows: [
          ['South Point & South Strip', 'Cowboy headquarters, equestrian events, buckle shows', 'Direct dedicated arena bus', '100% Western community'],
          ['Center Strip Mega-Resorts', 'Modern luxury, major country residencies, nightlife', 'Moderate shuttle wait times', 'High energy, broad audience'],
          ['Downtown Fremont', 'Historic vintage Vegas, value rates, casual dining', 'Longer transit distance', 'Classic neon and street party'],
        ],
      },
    ],
    relatedArticleIds: ['art-03', 'hero-sec-02'],
  },
  {
    id: 'art-05',
    slug: 'country-music-residencies-after-parties-roundup',
    title: 'Country Residencies & Late Night Saloons: What to Expect When the Chutes Close',
    deck: 'A comprehensive editorial overview of headlining country music concerts, ballroom watch parties, and live acoustic songwriter sessions.',
    excerpt: 'The complete nightlife and live music guide for rodeo week across Las Vegas theaters, ballrooms, and honky-tonks.',
    category: 'NFR Entertainment',
    subcategory: 'Concerts & Nightlife',
    articleType: 'feature',
    status: 'published',
    readTime: '4 min read',
    author: AUTHORS.elena,
    publishedAt: 'October 23, 2026',
    heroImage: '/assets/images/cowboy_christmas_market_1793166441923.jpg',
    imageCredit: 'Concert & Venue Archive',
    tags: ['Concerts', 'Nightlife', 'Residencies', 'South Point Buckles'],
    content: [
      'The rodeo action inside the arena ends around 8:30 PM, but the citywide entertainment slate kicks off almost immediately across resort ballrooms.',
      'Nightly buckle presentations remain open to the public at South Point, offering fans the rare opportunity to see world champions receive nightly honors.',
    ],
    structuredBody: [
      {
        type: 'paragraph',
        text: 'The rodeo action inside the arena ends around 8:30 PM, but the citywide entertainment slate kicks off almost immediately across resort ballrooms.',
        isDropCap: true,
      },
      {
        type: 'heading',
        level: 2,
        id: 'buckle-presentations',
        text: 'The South Point Buckle Presentations: Sport’s Most Candid Tradition',
      },
      {
        type: 'paragraph',
        text: 'Starting at 11:00 PM in the South Point Showroom, every nightly go-round winner takes the stage before a standing-room-only crowd to receive their Montana Silversmiths buckle and participate in unscripted, humorous interviews.',
      },
    ],
    relatedArticleIds: ['art-02', 'hero-sec-01'],
  },
  {
    id: 'art-06',
    slug: 'calgary-stampede-to-las-vegas-the-qualifying-pipeline',
    title: 'From Calgary to Cheyenne: How the World’s Richest Summer Rodeos Shape the NFR Top 15',
    deck: 'Examining the international pipeline of ProRodeo circuits and how premier events in Canada and the American West solidify qualification.',
    excerpt: 'An investigation into how high-purse summer crown jewel rodeos determine the final top 15 qualifiers heading to Las Vegas.',
    category: 'More Rodeo',
    subcategory: 'Global Rodeo Hubs',
    articleType: 'analysis',
    status: 'published',
    readTime: '5 min read',
    author: AUTHORS.clayton,
    publishedAt: 'October 22, 2026',
    heroImage: '/assets/images/hero_bull_riding_1793166440262.jpg',
    imageCredit: 'ProRodeo Summer Circuit Archive',
    tags: ['Calgary Stampede', 'Cheyenne Frontier Days', 'World Standings', 'Summer Run'],
    content: [
      'Earning a spot among the elite fifteen contestants in any PRCA discipline requires a grueling ten-month campaign logging over 70,000 highway miles.',
      'Summer stops at the Calgary Stampede and Cheyenne Frontier Days often deliver the decisive purse boosts that secure an autumn Las Vegas invitation.',
    ],
    structuredBody: [
      {
        type: 'paragraph',
        text: 'Earning a spot among the elite fifteen contestants in any PRCA discipline requires a grueling ten-month campaign logging over 70,000 highway miles.',
        isDropCap: true,
      },
      {
        type: 'heading',
        level: 2,
        id: 'summer-run',
        text: 'The "Cowboy Christmas" Summer Sprint',
      },
      {
        type: 'paragraph',
        text: 'Not to be confused with the Las Vegas convention expo, the Fourth of July run on the rodeo circuit—known among athletes as Cowboy Christmas—features dozens of simultaneous rodeos across the West. Contestants charter flights and drive all night to compete in three states in 24 hours.',
      },
    ],
    associatedHubId: 'hub-canada',
    relatedArticleIds: ['hero-lead-01', 'hero-sec-01'],
  },
  {
    id: 'art-07',
    slug: 'ticket-advisory-consumer-protection-guide',
    title: 'Ticket Advisory: Understanding Balcony vs Plaza, Seat Exchanges & Scam Warnings',
    deck: 'An independent consumer breakdown of primary UNLV box office allotments, secondary verified exchanges, and how plaza pass standing room functions.',
    excerpt: 'Navigating the tightest ticket in Western sports: legitimate box office allocations, secondary marketplace fees, and avoiding counterfeit passes.',
    category: 'NFR Plan & Watch',
    subcategory: 'Tickets',
    articleType: 'guide',
    status: 'published',
    readTime: '5 min read',
    author: AUTHORS.marcus,
    publishedAt: 'October 21, 2026',
    heroImage: '/assets/images/las_vegas_rodeo_night_1793166441250.jpg',
    imageCredit: 'Consumer Advisory Pool',
    tags: ['Tickets', 'Balcony vs Plaza', 'UNLV Box Office', 'Consumer Advisory'],
    content: [
      'With only 17,000 seats inside the historic Thomas & Mack Center, all ten rounds of the National Finals Rodeo sell out months in advance.',
      'Understanding the difference between Plaza seats (lower bowl), Balcony seats (upper bowl), and Plaza Passes (standing room viewing screens) is essential before buying.',
    ],
    structuredBody: [
      {
        type: 'paragraph',
        text: 'With only 17,000 seats inside the historic Thomas & Mack Center, all ten rounds of the National Finals Rodeo sell out months in advance.',
        isDropCap: true,
      },
      {
        type: 'heading',
        level: 2,
        id: 'seating-levels',
        text: 'Plaza vs. Balcony vs. Plaza Passes',
      },
      {
        type: 'paragraph',
        text: 'The Plaza level offers immediate proximity to the bucking chutes and roping boxes, with rows 1 through 15 providing an unobstructed dirt-level view. The Balcony level is elevated and steep, providing clear sightlines over the entire arena pattern. Plaza Passes, by contrast, are standing-room only credentials outside the arena bowl that provide access to live video screens and hospitality areas on the concourse.',
      },
      {
        type: 'callout',
        variant: 'warning',
        title: 'Crucial Notice: Plaza Passes Do Not Include An Arena Seat',
        text: 'Many first-time visitors mistakenly purchase lower-cost Plaza Passes expecting entry into the seating bowl. Plaza Passes do NOT provide a view of the live arena dirt.',
      },
    ],
    relatedArticleIds: ['art-03', 'art-04'],
  },
  {
    id: 'art-08',
    slug: 'navigating-thomas-and-mack-center-guide',
    title: 'Navigating the Thomas & Mack Center: Parking, Clear Bag Policy & Arrival Windows',
    deck: 'Arena policies, clear bag dimensions, metal detector throughput, and why you should arrive 90 minutes before grand entry.',
    excerpt: 'Arena rules, UNLV campus regulations, security walkthrough protocols, and seating advice for championship rodeo attendees.',
    category: 'NFR Plan & Watch',
    subcategory: 'Venue Navigation',
    articleType: 'guide',
    status: 'published',
    readTime: '4 min read',
    author: AUTHORS.marcus,
    publishedAt: 'October 20, 2026',
    heroImage: '/assets/images/hero_bull_riding_1793166440262.jpg',
    imageCredit: 'Thomas & Mack Venue Guide',
    tags: ['Thomas & Mack', 'Venue Guide', 'Clear Bag Policy', 'UNLV'],
    content: [
      'The UNLV Thomas & Mack Center has hosted the National Finals Rodeo since 1985, creating an intimate, pressure-cooker arena environment.',
      'Because of campus security rules, non-clear bags and backpacks are strictly prohibited at all entrance portals.',
    ],
    structuredBody: [
      {
        type: 'paragraph',
        text: 'The UNLV Thomas & Mack Center has hosted the National Finals Rodeo since 1985, creating an intimate, pressure-cooker arena environment.',
        isDropCap: true,
      },
      {
        type: 'heading',
        level: 2,
        id: 'clear-bag-rules',
        text: 'Strict Clear Bag Specifications',
      },
      {
        type: 'paragraph',
        text: 'All bags must be clear plastic, vinyl, or PVC and not exceed 12" x 6" x 12". Small clutch purses no larger than 4.5" x 6.5" are permitted without being clear. Storage lockers on site are severely limited.',
      },
    ],
    relatedArticleIds: ['art-07', 'art-03'],
  },
];

export const ALL_ARTICLES: Article[] = [
  HERO_ARTICLE,
  ...SECONDARY_HERO_STORIES,
  ...LATEST_COVERAGE_ARTICLES,
];

export const SEVEN_DISCIPLINES: Discipline[] = [
  {
    id: 'disc-bareback',
    slug: 'bareback-riding',
    name: 'Bareback Riding',
    shortName: 'Bareback',
    category: 'Roughstock',
    tagline: 'The most physically grueling 8-second test in western sports.',
    summary: 'Riders grip a single leather rigging strapped around the horse with no saddle or stirrups, absorbing intense kinetic shocks with spur strokes that must remain above the animal’s shoulders on the first jump out.',
    introduction: 'Bareback riding is widely acknowledged by sports orthopedic surgeons as the most physically punishing discipline in professional rodeo. With no saddle, stirrups, or reins, the contestant’s only anchor is a molded leather rigging cinched around the horse’s girth, grasped with a single gloved hand bound with specialized resin.',
    competitionFormat: 'Ten performances at the NFR. Each contestant draws one horse per night from the designated round pen. Combined scores across ten rounds determine the world championship and average titles.',
    scoringBreakdown: [
      { title: 'Contestant Technique (50 pts)', description: 'Evaluated on spurring control, toe flare, upper body stability, and rhythmic response.' },
      { title: 'Bucking Horse Power (50 pts)', description: 'Judged on bucking height, drop, kicking power, spin, and erratic rhythm.' },
    ],
    rulesHighlights: [
      'The "Mark Out Rule": Boots must be above the point of the horse’s shoulders upon first landing.',
      'Touching the horse, rigging, or equipment with the free hand equals zero points.',
      'Rider must remain mounted for the full 8-second whistle.',
    ],
    terminology: [
      { term: 'Rigging', definition: 'A customized, heavy leather handhold cinched around the horse’s withers.' },
      { term: 'Mark Out', definition: 'The rule requiring spurs to touch the horse’s shoulders upon its first landing out of the chutes.' },
      { term: 'Free Hand', definition: 'The non-riding hand; if it touches anything during the 8 seconds, the rider is disqualified.' },
    ],
    beginnerTips: [
      'Watch the rider’s feet on the very first jump out of the chute; if the spurs are not positioned high on the horse’s shoulders, the ride is disqualified.',
      'Notice the rhythm: the spurs move forward as the horse drops and pull back as the horse kicks.',
    ],
    stockProfile: 'Bred specifically for explosive shoulder bucking and dramatic aerial drops.',
    historicBenchmark: 'Winning scores at the Thomas & Mack typically exceed 88.5 points in go-rounds.',
    image: '/assets/images/saddle_bronc_action_1793166440982.jpg',
    imageCredit: 'ProRodeo Action Photography Pool',
    relatedArticleSlugs: ['inside-the-chutes-nfr-roughstock-intensity', 'the-anatomy-of-the-10-round-average'],
  },
  {
    id: 'disc-steer-wrestling',
    slug: 'steer-wrestling',
    name: 'Steer Wrestling',
    shortName: 'Bulldogging',
    category: 'Timed Event',
    tagline: 'Pure horsepower, leverage, and 500-pound steer control.',
    summary: 'Sprinting from behind a barrier on horseback alongside a hazer who keeps the steer running straight, the bulldogger slides from his saddle, grabs the steer’s horns, and uses leverage to bring all four feet off the ground and flat onto its side.',
    introduction: 'Invented by African American rodeo legend Bill Pickett in the late 19th century, steer wrestling demands explosive sprinting speed from horseback, immaculate horsemanship, and precise physics leverage to throw a 500-pound animal in under four seconds.',
    competitionFormat: 'Ten rounds of timed runs. Contestants are paired with a "hazer"—a fellow mounted cowboy whose horse runs parallel to keep the steer straight.',
    scoringBreakdown: [
      { title: 'Clock Measurement', description: 'Clean times under 4.0 seconds represent world-class championship execution.' },
      { title: 'Barrier Penalty (+10s)', description: 'Breaking the string barrier before the steer gets head start adds 10 penalty seconds.' },
    ],
    rulesHighlights: [
      'The steer must be caught from horseback; both horns must be controlled.',
      'Steer must be wrestled to a stop and turned flat on its side with all legs pointing the same direction.',
    ],
    terminology: [
      { term: 'Hazer', definition: 'The cowboy riding alongside the steer to prevent it from veering away from the wrestler.' },
      { term: 'Flat on Side', definition: 'The legal position required to stop the official clock.' },
      { term: 'Broken Barrier', definition: 'A 10-second penalty incurred if the horse breaks through the barrier string early.' },
    ],
    beginnerTips: [
      'The contest is won or lost in the first twenty feet out of the box. Watch if the horse leaves the corner cleanly.',
      'Look at the hazer: a world-class hazer is essential to giving the wrestler a chance at a sub-4 second run.',
    ],
    stockProfile: 'Corriente Mexican steers weighing between 450 and 550 pounds, conditioned for speed.',
    historicBenchmark: 'NFR go-round records dip as low as 3.0 seconds flat in the tight Las Vegas arena.',
    image: '/assets/images/hero_bull_riding_1793166440262.jpg',
    imageCredit: 'ProRodeo Timed Event Archive',
    relatedArticleSlugs: ['inside-the-chutes-nfr-roughstock-intensity'],
  },
  {
    id: 'disc-team-roping',
    slug: 'team-roping',
    name: 'Team Roping',
    shortName: 'Team Roping',
    category: 'Timed Event',
    tagline: 'Precision synchronization between Header and Heeler.',
    summary: 'The header ropes the steer by the horns, neck, or half-head, then turns the steer to the left across the arena, allowing the trailing heeler to cast a loop and snare both hind legs with split-second precision.',
    introduction: 'The only team discipline in championship rodeo, team roping originated from working cattle ranch methods where two cowboys immobilized a mature steer for medical inspection or branding in open country.',
    competitionFormat: 'Ten performances. Both Header and Heeler earn separate points and purses, competing as a synchronized pair.',
    scoringBreakdown: [
      { title: 'Header Catch Validity', description: 'Only three legal head catches: around both horns, around the neck, or half-head.' },
      { title: 'Single Leg Penalty (+5s)', description: 'Catching only one hind leg incurs an immediate 5-second penalty.' },
    ],
    rulesHighlights: [
      'Barrier rule applies to header (+10s for broken barrier).',
      'Both horses must be facing each other with dallies tight when the clock stops.',
    ],
    terminology: [
      { term: 'Header', definition: 'The roper who catches the horns and turns the steer.' },
      { term: 'Heeler', definition: 'The roper who follows and catches both hind legs in motion.' },
      { term: 'Dally', definition: 'Wrapping the rope around the saddle horn to bring the steer to a stop.' },
    ],
    beginnerTips: [
      'Notice how the header turns his horse to the left to stretch the steer; this sets up the heeler’s throwing angle.',
      'A catch on one hind leg adds a 5-second penalty, which takes the pair out of nightly go-round money.',
    ],
    stockProfile: 'Medium-weight native steers that run straight and maintain consistent pace.',
    historicBenchmark: 'Winning runs in the compact Thomas & Mack arena frequently clock under 3.8 seconds.',
    image: '/assets/images/saddle_bronc_action_1793166440982.jpg',
    imageCredit: 'Western Sports Arena Archive',
    relatedArticleSlugs: ['calgary-stampede-to-las-vegas-the-qualifying-pipeline'],
  },
  {
    id: 'disc-saddle-bronc',
    slug: 'saddle-bronc-riding',
    name: 'Saddle Bronc Riding',
    shortName: 'Saddle Bronc',
    category: 'Roughstock',
    tagline: 'The classic rodeo event celebrating rhythm, balance, and spur cadence.',
    summary: 'Often called the soul of rodeo, the cowboy rides an association saddle with free-swinging stirrups, holding a single braided bucking rein in one hand while timing every spur stroke to the bucking animal’s cadence.',
    introduction: 'Saddle bronc riding is widely celebrated as the classical art of rodeo. Born out of the frontier necessity of breaking working horses on 19th-century ranches, it rewards elegance, synchronization, and fluid spurring rhythm over brute strength.',
    competitionFormat: 'Ten go-rounds against elite bucking horses. Riders hold a single braided bucking rein in one hand; the other hand must stay completely clear.',
    scoringBreakdown: [
      { title: 'Rider Form & Rhythm (50 pts)', description: 'Evaluated on fluid spur movement from neck to cantle in sync with horse rhythm.' },
      { title: 'Stock Intensity (50 pts)', description: 'Evaluated on kick height, power, and rhythm predictability.' },
    ],
    rulesHighlights: [
      'Mark out rule strictly enforced on chute exit.',
      'Touching animal or saddle with free hand causes automatic disqualification.',
      'Losing a stirrup before the 8-second buzzer results in no score.',
    ],
    terminology: [
      { term: 'Bucking Rein', definition: 'A single thick braided rein held in the riding hand.' },
      { term: 'Association Saddle', definition: 'A standardized saddle with no horn and specific swell dimensions.' },
      { term: 'Cantle', definition: 'The raised rear portion of the saddle seat.' },
    ],
    beginnerTips: [
      'Listen for the 8-second whistle. If the cowboy touches any part of the horse or himself with his free hand, it is an instant zero.',
      'A great saddle bronc ride looks effortless and fluid, like the rider is glued to the saddle.',
    ],
    stockProfile: 'Classic draft crossbred bucking horses renowned for high kicks and rolling rhythm.',
    historicBenchmark: 'Go-round scores of 89.0 to 92.0 points regularly decide round buckles.',
    image: '/assets/images/saddle_bronc_action_1793166440982.jpg',
    imageCredit: 'NFRAction Stock Photography',
    relatedArticleSlugs: ['saddle-bronc-riding-the-classic-event-evolution', 'the-anatomy-of-the-10-round-average'],
  },
  {
    id: 'disc-tie-down',
    slug: 'tie-down-roping',
    name: 'Tie-Down Roping',
    shortName: 'Tie-Down',
    category: 'Timed Event',
    tagline: 'Unmatched horse training meets lightning-fast ground work.',
    summary: 'The roper ropes a running calf from his horse, dismounts at speed while the trained horse stops and keeps tension on the rope, sprints to the calf, flips it onto its side ("flanks" it), and ties three legs with a six-foot piggin’ string.',
    introduction: 'Rooted directly in ranch pasture calf doctoring, tie-down roping showcases the ultimate partnership between human athlete and equine athlete. The horse must read the rope’s angle, stop instantly, and back up to maintain precise rope tension while the roper ties the calf.',
    competitionFormat: 'Ten performances against conditioned beef calves. Clock stops when the cowboy raises both hands; calf must stay tied for 6 seconds.',
    scoringBreakdown: [
      { title: 'Execution Time', description: 'Sub-7 second runs are necessary to win go-round paychecks at the NFR.' },
      { title: '6-Second Tie Inspection', description: 'The tie must hold securely for 6 seconds after the roper remounts his horse.' },
    ],
    rulesHighlights: [
      'The horse must not drag the calf more than two feet after roper dismounts.',
      'Breaking the barrier adds a standard 10-second penalty.',
    ],
    terminology: [
      { term: 'Piggin’ String', definition: 'A six-foot cord held in the roper’s teeth and used to tie three legs.' },
      { term: 'Flanking', definition: 'Reaching over the calf to lift and lay it on its side.' },
      { term: 'Jerkdown', definition: 'An illegal maneuver where the calf is flipped violently over backward; results in disqualification.' },
    ],
    beginnerTips: [
      'Observe the horse’s ears and posture after the cowboy dismounts; the horse is independently working to keep the rope taut.',
      'Watch the six-second tie count: if the calf kicks free before the field judge signals six seconds, the run is disqualified.',
    ],
    stockProfile: 'Hardy beef-breed calves conditioned for consistent sprinting down the lane.',
    historicBenchmark: 'World records at the Thomas & Mack arena have stopped clocks at an astonishing 6.5 seconds.',
    image: '/assets/images/hero_bull_riding_1793166440262.jpg',
    imageCredit: 'Rodeo Heritage Archives',
    relatedArticleSlugs: ['inside-the-chutes-nfr-roughstock-intensity'],
  },
  {
    id: 'disc-barrel-racing',
    slug: 'barrel-racing',
    name: 'Barrel Racing',
    shortName: 'Barrels',
    category: 'Timed Event',
    tagline: 'Blistering equine agility measured in hundredths of a second.',
    summary: 'WPRA cowgirls navigate a cloverleaf pattern around three barrels at full gallop, pushing specialized quarter horses to their physical limit around tight turns where a tipped barrel can destroy a world title bid.',
    introduction: 'Sanctioned by the Women’s Professional Rodeo Association (WPRA), barrel racing is the fastest contest on dirt. Elite quarter horses gallop at speeds exceeding 30 mph, carving sharp cloverleaf patterns where thousandths of a second separate world champions.',
    competitionFormat: 'Ten rounds timed electronically with laser eyes. Five-second penalty added for each knocked-over barrel.',
    scoringBreakdown: [
      { title: 'Electronic Laser Eye Timer', description: 'Timed to the thousandth of a second for exact precision.' },
      { title: 'Tipped Barrel Penalty (+5s)', description: 'Knocking over any of the three barrels adds a 5-second penalty.' },
    ],
    rulesHighlights: [
      'Rider may choose to turn right barrel first or left barrel first.',
      'Touching or steadying a tipping barrel with hand is legal; only tipping it over incurs a penalty.',
    ],
    terminology: [
      { term: 'Rate', definition: 'The horse shifting its weight back onto its hocks to slow and execute the turn.' },
      { term: 'Laser Eye', definition: 'The electric timing line stretched across the arena mouth.' },
      { term: 'Tipped Barrel', definition: 'A barrel that falls flat to the arena dirt, triggering a 5-second penalty.' },
    ],
    beginnerTips: [
      'Notice that riders can touch and push barrels to prevent them from falling; that is completely legal.',
      'The horse that turns closest to the barrels without knocking them almost always clocks the fastest round time.',
    ],
    stockProfile: 'Elite registered American Quarter Horses bred for blistering sprinting speed and turning balance.',
    historicBenchmark: 'Winning times around the NFR standard pattern typically hover around 13.5 to 13.8 seconds.',
    image: '/assets/images/saddle_bronc_action_1793166440982.jpg',
    imageCredit: 'WPRA Performance Archives',
    relatedArticleSlugs: ['calgary-stampede-to-las-vegas-the-qualifying-pipeline'],
  },
  {
    id: 'disc-bull-riding',
    slug: 'bull-riding',
    name: 'Bull Riding',
    shortName: 'Bull Riding',
    category: 'Roughstock',
    tagline: 'Two thousand pounds of unpredictable fury vs. eight seconds of human balance.',
    summary: 'Holding a flat braided rope wrapped around the 1,800-pound bull’s girth with only resin and hand strength, the rider must endure violent spinning, kicking, and directional shifts with one hand raised completely free.',
    introduction: 'Bull riding is the grand finale of every rodeo performance worldwide. Facing nearly a ton of muscular bovine power bred specifically for explosive spinning and drops, the athlete must maintain balance using only a braided rope with zero knots or mechanical anchors.',
    competitionFormat: 'Ten rounds against the fiercest bucking bulls in North America. Two judges evaluate cowboy (50 pts) and bull (50 pts).',
    scoringBreakdown: [
      { title: 'Rider Control (50 pts)', description: 'Scored on ability to stay centered over the bull’s spine while matching spins.' },
      { title: 'Bull Bucking Degree (50 pts)', description: 'Scored on raw drop, spin speed, front end drop, and unpredictable kicking power.' },
    ],
    rulesHighlights: [
      'No mark out requirement out of the chutes for bulls.',
      'Touching the bull or oneself with the free hand equals zero points.',
      'Full 8-second ride required for any score.',
    ],
    terminology: [
      { term: 'Bull Rope', definition: 'A flat braided rope with a weighted handhold that wraps around the bull’s chest.' },
      { term: 'Rosin & Benzoin', definition: 'Sticky tree-sap substances applied to the rider’s glove to assist friction grip.' },
      { term: 'Bullfighter', definition: 'The arena athlete who distracts the bull after a dismount to protect the fallen rider.' },
    ],
    beginnerTips: [
      'There is no mark out rule in bull riding; the cowboy does not need to have his spurs up when leaving the chute.',
      'Watch the bullfighters right after the buzzer; their courage and evasion moves keep fallen riders safe.',
    ],
    stockProfile: 'Brahma and crossbred bucking bulls bred specifically for explosive athleticism and raw power.',
    historicBenchmark: 'A legendary 90+ point ride at the Thomas & Mack sends all 17,000 spectators to their feet.',
    image: '/assets/images/hero_bull_riding_1793166440262.jpg',
    imageCredit: 'Editorial Staff Archives / NFRGuide Action Photography',
    relatedArticleSlugs: ['inside-the-chutes-nfr-roughstock-intensity', 'the-anatomy-of-the-10-round-average'],
  },
];

export const QUICK_ACCESS_ITEMS: QuickLinkItem[] = [
  {
    id: 'qa-schedule',
    title: '10-Day Performance Schedule',
    description: 'Round-by-round start times, grand entry protocol, and performance themes from Round 1 through Round 10.',
    category: 'Event Timeline',
    targetSectionId: 'plan-watch',
    targetRoute: '/plan-watch/',
    badge: 'Round 1–10',
  },
  {
    id: 'qa-standings',
    title: 'Results & Standings Explainer',
    description: 'How PRCA world standings work, go-round payout scales, and the championship average purse calculation.',
    category: 'Scoring Intelligence',
    targetSectionId: 'competition',
    targetRoute: '/competition/',
    badge: '10-Round Aggregate',
  },
  {
    id: 'qa-disciplines',
    title: 'The Seven Championship Disciplines',
    description: 'Comprehensive guides to Bareback, Steer Wrestling, Team Roping, Saddle Bronc, Tie-Down, Barrels, and Bull Riding.',
    category: 'Competition Rules',
    targetSectionId: 'competition',
    targetRoute: '/competition/',
    badge: '7 Events',
  },
  {
    id: 'qa-how-to-watch',
    title: 'How to Watch & Streaming Guide',
    description: 'Neutral, fact-checked broadcast options, streaming platforms, and international viewing recommendations.',
    category: 'Broadcast Guide',
    targetSectionId: 'plan-watch',
    targetRoute: '/articles/how-to-watch-nfr-streaming-cable-cord-cutters/',
    badge: 'Live TV & Online',
  },
  {
    id: 'qa-tickets',
    title: 'Ticket Buying & Safe Exchange Guide',
    description: 'Official box office logistics, secondary marketplace consumer precautions, and plaza pass comparisons.',
    category: 'Spectator Advisory',
    targetSectionId: 'plan-watch',
    targetRoute: '/articles/ticket-advisory-consumer-protection-guide/',
    badge: 'Consumer Advisory',
  },
];

export const PLAN_AND_WATCH_GUIDES: PlanGuide[] = [
  {
    id: 'pw-01',
    title: 'The Complete TV & Streaming Roadmap: Where to Watch Every Performance',
    subtopic: 'Broadcast & Streaming',
    readTime: '4 min read',
    summary: 'Navigating dedicated linear cable telecasts, mobile streaming subscriptions, and international replay access.',
    keyAdvice: 'Sign up for authorized streaming subscriptions 48 hours early to test device authentication.',
    image: '/assets/images/las_vegas_rodeo_night_1793166441250.jpg',
    imageCredit: 'Broadcast Logistics Archive',
    articleSlug: 'how-to-watch-nfr-streaming-cable-cord-cutters',
  },
  {
    id: 'pw-02',
    title: 'Ticket Advisory: Understanding Balcony vs Plaza, Seat Exchanges & Scam Warnings',
    subtopic: 'Tickets',
    readTime: '5 min read',
    summary: 'An independent consumer breakdown of primary UNLV box office allotments, secondary verified exchanges, and how plaza pass standing room functions.',
    keyAdvice: 'Never purchase paper or digital tickets from unauthorized social media groups or street scalpers outside the arena.',
    image: '/assets/images/las_vegas_rodeo_night_1793166441250.jpg',
    imageCredit: 'Consumer Advisory Pool',
    articleSlug: 'ticket-advisory-consumer-protection-guide',
  },
  {
    id: 'pw-03',
    title: 'Where to Stay: South Point, Strip Mega-Resorts, or Downtown Las Vegas?',
    subtopic: 'Accommodations',
    readTime: '6 min read',
    summary: 'A detailed hotel matrix analyzing official rodeo shuttles, late-night watch party access, and room rate curves.',
    keyAdvice: 'Properties with dedicated NFR shuttle routes save hours of rideshare waiting at peak exit times.',
    image: '/assets/images/las_vegas_rodeo_night_1793166441250.jpg',
    imageCredit: 'Las Vegas Architecture Archive',
    articleSlug: 'hotel-district-breakdown-las-vegas-resort-corridor',
  },
  {
    id: 'pw-04',
    title: 'Navigating the Thomas & Mack Center: Parking, Clear Bag Policy & Arrival Windows',
    subtopic: 'Venue Navigation',
    readTime: '4 min read',
    summary: 'Arena policies, clear bag dimensions, metal detector throughput, and why you should arrive 90 minutes before grand entry.',
    keyAdvice: 'The UNLV campus enforces a strict clear bag policy (12x6x12 inches maximum). Backpacks are turned away.',
    image: '/assets/images/hero_bull_riding_1793166440262.jpg',
    imageCredit: 'Thomas & Mack Venue Guide',
    articleSlug: 'navigating-thomas-and-mack-center-guide',
  },
];

export const ENTERTAINMENT_FEATURES: EntertainmentFeature[] = [
  {
    id: 'ent-01',
    title: 'Headlining Country Residencies Across the Las Vegas Strip',
    type: 'Concerts',
    venue: 'The Colosseum, Bakkt Theater & Virgin Hotels',
    dateContext: 'December 2026 Championship Window',
    summary: 'Top country music superstars schedule annual Vegas runs coinciding with the rodeo, from arena-scale showcases to intimate acoustic sets.',
    highlights: ['Multi-night theater residencies', 'Early-bird show times matching arena post-times', 'Intimate theater sound design'],
    image: '/assets/images/las_vegas_rodeo_night_1793166441250.jpg',
    imageCredit: 'Entertainment Photography Pool',
    articleSlug: 'country-music-residencies-after-parties-roundup',
  },
  {
    id: 'ent-02',
    title: 'The Legendary South Point Nightly Go-Round Buckle Presentations',
    type: 'Awards',
    venue: 'South Point Showroom',
    dateContext: 'Nightly 11:00 PM PST (Free Admission)',
    summary: 'The single most authentic tradition of NFR week: watch nightly round winners receive their Montana Silversmiths buckles on stage with candid interviews.',
    highlights: ['Free public admission', 'Live cowboy interviews and banter', 'Live broadcast feed on showroom monitors'],
    image: '/assets/images/cowboy_christmas_market_1793166441923.jpg',
    imageCredit: 'South Point Tradition Archive',
    articleSlug: 'country-music-residencies-after-parties-roundup',
  },
  {
    id: 'ent-03',
    title: 'Resort Watch Parties: Where Fans Congregate When Arena Tickets Sell Out',
    type: 'Watch Parties',
    venue: 'Mirage, Resorts World, Golden Nugget & South Point',
    dateContext: 'Daily 5:45 PM to 9:00 PM',
    summary: 'Massive ballroom watch parties featuring colossal high-definition screens, live arena audio feeds, drink specials, and prize giveaways.',
    highlights: ['Giant LED wall stadium views', 'Surround arena commentary audio', 'Vibrant community atmosphere with zero ticket cost'],
    image: '/assets/images/las_vegas_rodeo_night_1793166441250.jpg',
    imageCredit: 'Watch Party Fan Archive',
    articleSlug: 'country-music-residencies-after-parties-roundup',
  },
];

export const SHOPPING_EVENTS: ShoppingEvent[] = [
  {
    id: 'shop-01',
    title: 'Cowboy Christmas: The Epicenter of Western Lifestyle & Artisan Gear',
    type: 'Cowboy Christmas',
    venue: 'Las Vegas Convention Center (South & Central Halls)',
    admissionNote: 'Free Admission & Open to the Public',
    summary: 'Over 500,000 square feet and 350+ vendors showcasing custom boots, fine turquoise, custom saddles, trailers, and Western home furnishings.',
    commercialStatus: 'Visitor Exhibition Guide',
    image: '/assets/images/cowboy_christmas_market_1793166441923.jpg',
    imageCredit: 'Exhibition Documentation / NFRGuide',
    articleSlug: 'cowboy-christmas-2026-buyers-handcrafted-curation',
  },
  {
    id: 'shop-02',
    title: 'Junior World Finals: Next Generation Champions Inside the Expo Arena',
    type: 'Junior NFR',
    venue: 'Wrangler Rodeo Arena inside Cowboy Christmas',
    admissionNote: 'Free with Cowboy Christmas Entry',
    summary: 'Over 800 youth competitors from around the world battle for world championship titles in miniature bull riding, steer wrestling, and breakaway roping.',
    commercialStatus: 'Visitor Exhibition Guide',
    image: '/assets/images/saddle_bronc_action_1793166440982.jpg',
    imageCredit: 'Youth Rodeo Championship Pool',
    articleSlug: 'cowboy-christmas-2026-buyers-handcrafted-curation',
  },
  {
    id: 'shop-03',
    title: 'Miss Rodeo America Pageant: Ambassador Evaluation & Crowning',
    type: 'Miss Rodeo America',
    venue: 'South Point Hotel & Casino',
    admissionNote: 'Public Speeches & Fashion Show Tickets',
    summary: 'State rodeo queens undergo rigorous horsemanship, personality, and rodeo rules examinations to serve as the sport’s leading global ambassador.',
    commercialStatus: 'Visitor Exhibition Guide',
    image: '/assets/images/cowboy_christmas_market_1793166441923.jpg',
    imageCredit: 'Pageant Archives / Western Heritage',
    articleSlug: 'cowboy-christmas-2026-buyers-handcrafted-curation',
  },
];

export const RODEO_HUBS: RodeoHub[] = [
  {
    id: 'hub-texas',
    slug: 'texas-circuit-stock-shows',
    title: 'Texas Circuit & Winter Stock Shows',
    region: 'Fort Worth, San Antonio, Houston',
    description: 'The financial engine of early-season ProRodeo competition with historic livestock shows paying millions in purse allocations.',
    circuitType: 'PRCA Texas Circuit',
    annualEventsCount: 42,
  },
  {
    id: 'hub-canada',
    slug: 'canadian-professional-rodeo',
    title: 'Canadian Professional Rodeo Association (CPRA)',
    region: 'Alberta, British Columbia, Saskatchewan',
    description: 'Home of the historic Calgary Stampede and the Canadian Finals Rodeo (CFR), producing legendary roughstock athletes.',
    circuitType: 'CPRA / ProRodeo Co-Sanctioned',
    annualEventsCount: 28,
  },
  {
    id: 'hub-mountain',
    slug: 'mountain-states-northern-plains',
    title: 'Mountain States & Northern Plains',
    region: 'Wyoming, Montana, Colorado, South Dakota',
    description: 'Historic open-air rodeos steeped in 19th-century frontier heritage, home to Cheyenne Frontier Days and the historic Pendleton Round-Up.',
    circuitType: 'Mountain States Circuit',
    annualEventsCount: 35,
  },
];

export const RECURRING_RODEO_EVENTS: RecurringRodeoEvent[] = [
  {
    id: 'rec-calgary',
    slug: 'calgary-stampede',
    name: 'The Calgary Stampede',
    hubId: 'hub-canada',
    location: 'Calgary, Alberta, Canada',
    traditionalMonth: 'July (10-Day Festival)',
    status: 'Crown Jewel',
    description: 'Known as "The Greatest Outdoor Show on Earth," paying over $2 million and drawing more than a million attendees annually.',
    currentEdition: {
      year: 2026,
      dates: 'July 3–12, 2026',
      purseBenchmark: '$2,150,000 Invitational Total',
    },
  },
  {
    id: 'rec-cheyenne',
    slug: 'cheyenne-frontier-days',
    name: 'Cheyenne Frontier Days',
    hubId: 'hub-mountain',
    location: 'Cheyenne, Wyoming',
    traditionalMonth: 'Late July',
    status: 'Heritage Invitational',
    description: 'The "Daddy of \'Em All" has run since 1897, featuring a giant outdoor dirt track and long steer wrestling scores.',
    currentEdition: {
      year: 2026,
      dates: 'July 17–26, 2026',
      purseBenchmark: '$1,200,000 PRCA ProRodeo Tour',
    },
  },
  {
    id: 'rec-pendleton',
    slug: 'pendleton-round-up',
    name: 'Pendleton Round-Up',
    hubId: 'hub-mountain',
    location: 'Pendleton, Oregon',
    traditionalMonth: 'Mid September',
    status: 'Heritage Invitational',
    description: 'Contested on real turf grass without arena dirt, providing one of the most singular challenges in competitive western sports.',
    currentEdition: {
      year: 2026,
      dates: 'September 16–19, 2026',
      purseBenchmark: '$650,000 Historical Grass Event',
    },
  },
];

export const LEARNING_RESOURCES: LearningItem[] = [
  {
    id: 'learn-01',
    slug: '8-second-rule-buzzer-mechanics',
    title: 'The 8-Second Rule: Why Buzzer Mechanics Matter',
    category: 'Rodeo Rules',
    summary: 'In roughstock events (Bareback, Saddle Bronc, and Bull Riding), a contestant must remain mounted for eight uninterrupted seconds to receive a score.',
    bullets: [
      'The timer begins the moment the animal’s shoulders break the plane of the chute gate.',
      'An electric horn signals the 8-second completion; any dismount or touch prior to that horn earns a zero score.',
      'Judges use high-frame video reviews if a buck-off occurs within tenths of a second of the whistle.',
    ],
    didYouKnow: 'The 8-second rule was adopted in the early 20th century because equine exercise physiologists determined that horses exert maximum bucking power within the first six to eight seconds.',
  },
  {
    id: 'learn-02',
    slug: '50-50-scoring-100-point-system',
    title: '50/50 Scoring: How Roughstock Judges Score 100 Points',
    category: 'Scoring Breakdown',
    summary: 'Two official judges evaluate each roughstock ride. Each judge awards up to 25 points for the rider’s performance and 25 points for the animal’s performance.',
    bullets: [
      'Judge A gives 1–25 points for cowboy + 1–25 points for animal (max 50).',
      'Judge B gives 1–25 points for cowboy + 1–25 points for animal (max 50).',
      'Combined total equals the official score out of 100.',
      'Even an incredible ride on a weak-bucking animal will produce a mediocre score (e.g. 74 points).',
    ],
    didYouKnow: 'A score of 90 or higher is considered extraordinary and occurs only on top-tier "eliminator" stock.',
  },
  {
    id: 'learn-03',
    slug: '10-round-average-championship-aggregate',
    title: 'The 10-Round "Average": The True Crown of Las Vegas',
    category: 'First-Timer Guide',
    summary: 'The NFR awards two major crowns in each event: the World Championship (most total season earnings) and the NFR Average Championship (highest aggregate across 10 rounds).',
    bullets: [
      'Nightly go-rounds pay prize money to 1st through 6th place each evening.',
      'At the conclusion of Round 10, the "Average" payout distributes massive additional prize money to the top 8 aggregate competitors.',
      'A cowboy who places consistently in the top 5 every night often wins the world title without winning a single go-round.',
    ],
    didYouKnow: 'The Average payout at the NFR is so lucrative that winning it can vault an athlete from 15th place in the world to World Champion on the final night.',
  },
  {
    id: 'learn-04',
    slug: 'chute-glossary-essential-western-terminology',
    title: 'Essential Western Terminology: The Chute Glossary',
    category: 'Terminology',
    summary: 'Master the common terms overheard in the stands, around the chutes, and during live arena commentary.',
    bullets: [
      'Barrier: The rope stretched across the roping box that gives the steer/calf a fair head start.',
      'Dally: Wrapping the lariat rope around the saddle horn to stop the animal.',
      'Flank Strap: A soft sheepskin-lined strap placed around the animal’s flank to encourage clean, natural bucking.',
      'Hazer: The mounted cowboy who rides alongside the steer to keep it running in a straight line for the bulldogger.',
      'Draw: The random lottery that matches athletes with specific stock for each round.',
    ],
    didYouKnow: 'The flank strap never touches the animal’s genitals; it rests loosely around the flanks and is removed immediately after the ride by arena pickup men.',
  },
];

// Helper Query Functions
export function getArticleBySlug(slug: string): Article | undefined {
  const clean = slug.replace(/\/+$/, '');
  return ALL_ARTICLES.find((a) => a.slug === clean);
}

export function getDisciplineBySlug(slug: string): Discipline | undefined {
  const clean = slug.replace(/\/+$/, '');
  return SEVEN_DISCIPLINES.find((d) => d.slug === clean || d.id === clean);
}

export function getArticlesByCategory(category: PrimarySection): Article[] {
  return ALL_ARTICLES.filter((a) => a.category === category && (a.workflowStatus ? a.workflowStatus === 'published' : a.status === 'published'));
}

export function getRelatedArticles(currentArticleId: string, limit = 3): Article[] {
  const publicArticles = ALL_ARTICLES.filter((a) => (a.workflowStatus ? a.workflowStatus === 'published' : a.status === 'published'));
  const current = ALL_ARTICLES.find((a) => a.id === currentArticleId);
  if (!current) return publicArticles.slice(0, limit);

  if (current.relatedArticleIds && current.relatedArticleIds.length > 0) {
    const matched = publicArticles.filter((a) => current.relatedArticleIds?.includes(a.id));
    if (matched.length >= limit) return matched.slice(0, limit);
  }

  return publicArticles
    .filter((a) => a.id !== currentArticleId && a.category === current.category)
    .concat(publicArticles.filter((a) => a.id !== currentArticleId))
    .slice(0, limit);
}

export function getAllPublishedArticles(): Article[] {
  return ALL_ARTICLES.filter((a) => (a.workflowStatus ? a.workflowStatus === 'published' : a.status === 'published'));
}
