import type { PersonaId, Verdict } from "../../types";
import type { Category, Signals } from "./analyze";

/**
 * The demo panel's script. Lines use {placeholders} filled from the pitch's
 * market context, and rules fire based on what the pitch actually contains.
 */

export interface MarketContext {
  audience: string;
  incumbents: string;
  substitute: string;
  niche: string;
  channel: string;
}

export const MARKETS: Record<Category | "default" | "b2b", MarketContext> = {
  b2b: {
    audience: "business owners",
    incumbents: "Excel, QuickBooks and an overworked office manager",
    substitute: "a spreadsheet and a bad mood",
    niche: "independent businesses with 5–50 staff in a single sector",
    channel: "LinkedIn, trade associations and cold email",
  },
  pets: {
    audience: "pet owners",
    incumbents: "Rover, Wag and every vet with a Facebook page",
    substitute: "a teenager down the road",
    niche: "dog owners in one city who work long office hours",
    channel: "local dog-walking groups and pet Instagram accounts",
  },
  food: {
    audience: "home cooks",
    incumbents: "Deliveroo, HelloFresh and Too Good To Go",
    substitute: "a frozen pizza",
    niche: "time-poor young professionals who cook three nights a week",
    channel: "recipe TikTok and food subreddits",
  },
  fitness: {
    audience: "gym-goers",
    incumbents: "Strava, Peloton and MyFitnessPal",
    substitute: "a free YouTube workout",
    niche: "beginners in their thirties who keep quitting the gym",
    channel: "fitness creators on TikTok and Instagram",
  },
  dating: {
    audience: "single people",
    incumbents: "Hinge, Bumble and Tinder",
    substitute: "a friend's birthday party",
    niche: "people in their thirties who are burnt out on swiping",
    channel: "real-world singles events and dating-advice creators",
  },
  education: {
    audience: "students",
    incumbents: "Duolingo, Khan Academy and ChatGPT",
    substitute: "a library card and a deadline",
    niche: "university students in exam season",
    channel: "study TikTok and student societies",
  },
  health: {
    audience: "patients",
    incumbents: "the NHS app, Bupa and Dr Google",
    substitute: "a GP appointment",
    niche: "people managing one specific chronic condition",
    channel: "patient communities and condition-specific charities",
  },
  travel: {
    audience: "travellers",
    incumbents: "Airbnb, Booking.com and TripAdvisor",
    substitute: "a group chat and a spreadsheet",
    niche: "couples planning one big trip a year",
    channel: "travel creators and destination subreddits",
  },
  finance: {
    audience: "people with money on their mind",
    incumbents: "Monzo, Revolut and Emma",
    substitute: "the banking app they already have",
    niche: "freelancers who dread tax season",
    channel: "personal-finance creators and freelancer communities",
  },
  eco: {
    audience: "eco-conscious shoppers",
    incumbents: "Too Good To Go, Vinted and Olio",
    substitute: "good intentions",
    niche: "city renters who want to cut waste without effort",
    channel: "sustainability creators and local community groups",
  },
  parents: {
    audience: "exhausted parents",
    incumbents: "Mumsnet, Peanut and the school WhatsApp group",
    substitute: "the school WhatsApp group",
    niche: "working parents of under-fives",
    channel: "parenting forums and nursery noticeboards",
  },
  creator: {
    audience: "creators",
    incumbents: "Linktree, Patreon and Canva",
    substitute: "a Notion page",
    niche: "small creators with 1k–20k followers",
    channel: "creator Twitter/X and YouTube tutorials",
  },
  productivity: {
    audience: "busy professionals",
    incumbents: "Notion, Todoist and Slack",
    substitute: "a sticky note",
    niche: "freelancers juggling five or more clients",
    channel: "LinkedIn posts and productivity YouTube",
  },
  gaming: {
    audience: "gamers",
    incumbents: "Discord, Twitch and Steam",
    substitute: "Discord",
    niche: "competitive players of one specific game",
    channel: "Discord servers and Twitch streamers",
  },
  fashion: {
    audience: "people who care about clothes",
    incumbents: "Vinted, Depop and ASOS",
    substitute: "their existing wardrobe",
    niche: "people who resell clothes as a side hustle",
    channel: "fashion TikTok and resale communities",
  },
  home: {
    audience: "homeowners",
    incumbents: "Checkatrade, TaskRabbit and IKEA",
    substitute: "a YouTube tutorial",
    niche: "first-time buyers tackling their first renovation",
    channel: "home-renovation Instagram and local Facebook groups",
  },
  music: {
    audience: "music fans",
    incumbents: "Spotify, SoundCloud and Bandcamp",
    substitute: "Spotify",
    niche: "independent musicians releasing their first EP",
    channel: "music-production YouTube and local gig scenes",
  },
  default: {
    audience: "people",
    incumbents: "whatever Google, Apple or a bored intern ship next",
    substitute: "a shrug and a Google search",
    niche: "one specific group who feel this pain every single week",
    channel: "short-form video in one niche community",
  },
};

export interface Rule {
  when: (s: Signals) => boolean;
  text: string;
}

export interface PersonaScript {
  headlines: { low: string[]; mid: string[]; high: string[] };
  points: Rule[];
  genericPoints: string[];
  strengths: Rule[];
  genericStrengths: string[];
  weaknesses: Rule[];
  genericWeaknesses: string[];
  attack: string;
  defend: string;
  chime: string;
  retort: string;
  settle: Record<Verdict, string>;
}

const vague = (s: Signals) => s.words < 12;
const simpleSoftware = (s: Signals) => !s.hardware && !s.crypto && !s.ai && !s.regulated;

export const SCRIPTS: Record<PersonaId, PersonaScript> = {
  investor: {
    headlines: {
      low: [
        "I've passed on better ideas this morning, and I haven't had coffee yet.",
        "This isn't a company. It's a feature someone else ships on a Tuesday.",
        "I'd love to invest. Unfortunately, I also love money.",
        "The market for this is enormous, I'm told. Mostly by you.",
      ],
      mid: [
        "There's a business in here somewhere. It's hiding behind the idea.",
        "I can see the pitch deck. I just can't see slide nine: how you make money.",
        "Interesting. In the way a car crash is interesting, but with upside.",
        "Not a pass. Not a yes. A long, expensive 'hmm'.",
      ],
      high: [
        "I hate to say it, but I'd take the meeting.",
        "Annoyingly, the numbers could actually work.",
        "This has the rarest thing in a pitch: a reason to exist.",
      ],
    },
    points: [
      { when: (s) => !s.monetization, text: "You haven't mentioned how this makes money, which is bold. Pick a model now — subscription, take-rate or per-seat — because 'we'll figure it out later' is how runways end." },
      { when: (s) => s.marketplace, text: "Marketplaces are glorious once they work and a cash furnace until they do. You'll be paying both sides to show up for the first two years — budget for it." },
      { when: (s) => s.subscription, text: "Subscription revenue is lovely on a spreadsheet. In real life you'll fight 8–10% monthly churn and need a reason people stay past month three." },
      { when: (s) => s.ai, text: "Your moat can't be 'we use AI'. Everyone uses AI. The day a big lab ships this as a checkbox, what's left that's yours — data, distribution or workflow lock-in?" },
      { when: (s) => s.crypto, text: "Putting it on a blockchain doesn't add value; it adds a slide that makes my partners quietly leave the room." },
      { when: (s) => s.hardware, text: "Hardware means inventory, manufacturing, returns and thin margins on a good day. It's called hardware for a reason." },
      { when: (s) => s.b2b, text: "B2B is the right instinct — businesses pay to remove pain. But sales cycles are long; find the one team who would pay you on day one and build for them." },
      { when: (s) => s.social, text: "Social products are winner-takes-all. You either become the default place, or a ghost town with a nice logo." },
      { when: (s) => s.regulated, text: "This lives in a regulated market. That's a moat if you get through compliance, and a crater if you don't." },
      { when: (s) => s.uberFor !== null, text: "'Uber for {x}' worked for exactly one company, and it lost billions doing it. Prove people need this often enough to justify a marketplace." },
      { when: (s) => s.category !== null, text: "You're walking into a room with {incumbents}. You don't need to beat them; you need a corner they can't be bothered to defend." },
      { when: vague, text: "This pitch is shorter than most term-sheet footnotes. I can't value what I can't understand." },
    ],
    genericPoints: [
      "Who pays, how much, and how often? Until those three numbers exist, this is a hobby with a domain name.",
      "The best version of this starts embarrassingly small: one city, one niche, one channel. Right now it's trying to be everything to everyone.",
      "Defensibility is the real question. If this works, what stops a well-funded copycat cloning it in a quarter?",
    ],
    strengths: [
      { when: (s) => s.monetization, text: "You've thought about how it makes money, which puts you ahead of most of my inbox." },
      { when: (s) => s.b2b, text: "It targets a budget line businesses already spend on." },
      { when: (s) => s.subscription, text: "Recurring revenue potential, if retention holds." },
      { when: (s) => s.marketplace, text: "If liquidity kicks in, marketplaces compound beautifully." },
    ],
    genericStrengths: ["There's a real behaviour here that people already spend money on."],
    weaknesses: [
      { when: (s) => !s.monetization, text: "No clear business model yet." },
      { when: (s) => s.crypto, text: "The blockchain adds cost and suspicion, not value." },
      { when: (s) => s.hardware, text: "Hardware margins and capital needs are brutal." },
      { when: (s) => s.ai, text: "No moat beyond a model every competitor can also call." },
      { when: (s) => s.marketplace, text: "Classic chicken-and-egg problem with no plan to crack it." },
    ],
    genericWeaknesses: ["Unclear why this wins against {incumbents}."],
    attack: "Let's be honest. {d}, you're excited about a product. I'm looking for a business, and I can't find one.",
    defend: "The economics can work, {a}. Small wedge, high-intent buyers, then expand. That's a real playbook.",
    chime: "You're both right, which is the problem. Decent idea, no moat.",
    retort: "Wedges are lovely, {d}. Wedges with {incumbents} already standing in them are not.",
    settle: {
      KILL: "I've heard enough. I'm ready to vote.",
      FIX: "Not a pass. Not a yes. A 'come back with numbers'.",
      BUILD: "Against my better judgement, I'm interested. Let's vote.",
    },
  },

  engineer: {
    headlines: {
      low: [
        "I read this twice. The second time was out of spite.",
        "Technically, anything is possible. That's not a compliment.",
        "This is either trivially easy or impossible, and somehow it's both.",
      ],
      mid: [
        "Buildable. Not in a weekend hackathon, but buildable.",
        "I can build this. I just have questions. Mostly about why.",
        "The core is simple. The edge cases are where the bodies are buried.",
      ],
      high: [
        "Finally, something I can ship in weeks, not years.",
        "Clean scope, boring tech, real problem. I'm almost emotional.",
      ],
    },
    points: [
      { when: (s) => s.ai, text: "Model calls cost money per request and hallucinate at the worst possible moment. You'll need guardrails, evals and a plan for when it confidently gets it wrong in front of a customer." },
      { when: (s) => s.crypto, text: "You're adding gas fees, wallets and irreversible transactions to a problem a Postgres table solves. A database is just a blockchain that works." },
      { when: (s) => s.hardware, text: "Hardware: firmware updates, certification, supply chains and a six-month loop for every mistake. Prototype the experience in software first and prove anyone cares." },
      { when: (s) => s.marketplace, text: "The tech is a CRUD app with payments. The hard part is trust and safety: verification, disputes, refunds, and the first time someone does something terrible on your platform." },
      { when: (s) => s.realtime, text: "Real-time and location features sound simple until you're handling battery drain, GPS drift and users in tunnels." },
      { when: (s) => s.social, text: "Social means moderation, spam, abuse reports and notifications people turn off. The feed is easy; keeping it clean is a full-time job." },
      { when: (s) => s.regulated, text: "Sensitive data means compliance before your first user: GDPR, consent, audit logs, maybe certification. Budget months, not sprints." },
      { when: (s) => s.app, text: "You don't need a native app yet. Ship a mobile web version, learn, and pay the App Store tax once people actually come back." },
      { when: (s) => simpleSoftware(s) && !s.marketplace, text: "Bad news: a competent developer could clone your MVP in a fortnight. Your edge has to come from something other than code." },
      { when: vague, text: "I can't estimate this because I don't know what 'this' is. Give me the one core action a user takes and I'll tell you how hard it is." },
    ],
    genericPoints: [
      "Cut the scope by 80%. Find the single action that delivers the value and build only that — everything else is roadmap fan fiction.",
      "Version one should be embarrassingly manual: a form, a spreadsheet and you doing the work. Automate only what people actually use.",
      "Integrations and data quality will take three times longer than the 'actual' product. They always do.",
    ],
    strengths: [
      { when: (s) => simpleSoftware(s), text: "Simple enough to prototype quickly and cheaply." },
      { when: (s) => s.ai, text: "Modern models make the hard part tractable for the first time." },
    ],
    genericStrengths: ["The core concept is achievable with off-the-shelf tools."],
    weaknesses: [
      { when: (s) => s.hardware, text: "Hardware turns every bug into a recall." },
      { when: (s) => s.crypto, text: "Blockchain complexity with no technical benefit." },
      { when: (s) => s.ai, text: "AI unit costs and reliability are unproven at scale." },
      { when: (s) => s.marketplace, text: "Trust, safety and payments are harder than the product itself." },
      { when: (s) => simpleSoftware(s), text: "Easy to build means easy to copy." },
    ],
    genericWeaknesses: ["Hidden complexity in edge cases nobody has mapped yet."],
    attack: "Can we talk about who actually has to build this? Because it's me, {d}, and I have concerns.",
    defend: "Disagree, {a}. The MVP is tiny. One form, one database, two weeks — we'd learn more than we're guessing here.",
    chime: "For the record, the tech is the easy part. Everything {a} is worried about is harder.",
    retort: "Two weeks to an MVP, {d}. Two years to the edge cases. Ask me how I know.",
    settle: {
      KILL: "I'll vote. Someone get me a coffee for the funeral.",
      FIX: "Cut the scope in half and I'm in. Probably.",
      BUILD: "I've already sketched the database. That's never good for my weekend.",
    },
  },

  marketer: {
    headlines: {
      low: [
        "I tried to market this in my head three times. I fell asleep twice.",
        "Who is this for? And please don't say 'everyone'.",
        "This has the brand energy of a terms-and-conditions page.",
      ],
      mid: [
        "There's a hook in here. It's just buried under the pitch.",
        "Okay, I'm intrigued — and I don't get intrigued for free.",
        "Half of a great story. The other half is your problem.",
      ],
      high: [
        "Oh, this is SCREENSHOTTABLE. People will send this to their group chats.",
        "I can already see the launch video. That's a very good sign.",
      ],
    },
    points: [
      { when: (s) => !s.audience, text: "You haven't named a customer. 'People' is not a target market. Pick one tribe with a shared pain and a place they gather online." },
      { when: (s) => s.audience, text: "You've named an audience — great. Now go where {audience} already hang out and see if they'd stop scrolling for this." },
      { when: (s) => s.buzzwords.length > 0, text: "Too many buzzwords. 'Revolutionary' and 'seamless' are what people write when they don't know what's special. Say the concrete thing." },
      { when: (s) => s.social, text: "Social apps live or die on the first ten friends. What's the single-player value that makes someone use it before their mates join?" },
      { when: (s) => s.ai, text: "'Powered by AI' is wallpaper now. Nobody shares a product because it uses AI — they share it because the result is surprising, funny or saves them an embarrassing amount of time." },
      { when: (s) => s.crypto, text: "The word 'blockchain' loses you 80% of normal humans instantly. Lead with the benefit and hide the plumbing — or delete it." },
      { when: (s) => s.b2b, text: "B2B doesn't go viral, it gets forwarded. Your channel is LinkedIn, cold email and one case study a buyer can show their boss." },
      { when: (s) => s.subscription, text: "Subscription fatigue is real. Your landing page has to answer 'why another monthly charge?' in five words." },
      { when: (s) => s.uberFor !== null, text: "'Uber for {x}' is a 2014 pitch. Positioning is about what you uniquely do now, not which unicorn you resemble." },
      { when: (s) => s.category !== null, text: "The obvious channel is {channel}. Make content they'd share even if they never sign up." },
    ],
    genericPoints: [
      "What's the one sentence someone says when they tell a friend about this? If you can't write it, they can't either.",
      "Your difference needs to be visible in the first five seconds of a demo. Right now I'd need a whiteboard.",
      "Build in public. The story of making this is probably more shareable than the product — for now.",
    ],
    strengths: [
      { when: (s) => s.social, text: "Built-in word of mouth if people invite friends." },
      { when: (s) => s.audience, text: "A clearly identifiable audience to target." },
      { when: (s) => s.ai, text: "Topical — easy to get attention right now." },
      { when: (s) => s.pain, text: "A relatable frustration that makes for great content." },
    ],
    genericStrengths: ["There's an emotional hook that could make good content."],
    weaknesses: [
      { when: (s) => !s.audience, text: "No clearly defined target audience." },
      { when: (s) => s.buzzwords.length > 0, text: "Positioning drowns in buzzwords." },
      { when: (s) => s.crypto, text: "Crypto baggage scares off mainstream users." },
    ],
    genericWeaknesses: ["Hard to explain in one sentence."],
    attack: "Nobody is going to talk about this, {d}. Products nobody talks about die quietly.",
    defend: "{a}, you're missing the story. People don't buy features, they buy a feeling — and this has one.",
    chime: "The positioning is fixable. The real question is whether anyone cares enough to switch.",
    retort: "Feelings don't scale without a channel, {d}. Where does user number one thousand come from?",
    settle: {
      KILL: "Even I can't spin this one. Let's vote.",
      FIX: "There's a story in here. It just needs a rewrite.",
      BUILD: "I'm already drafting the launch post. Let's vote.",
    },
  },

  customer: {
    headlines: {
      low: [
        "I'd download it, open it once and forget my password.",
        "I already have a free thing that does this. It's called my phone.",
        "Honestly? I'd rather keep my problem.",
      ],
      mid: [
        "I'd try it. Whether I'd pay is a whole different conversation.",
        "Okay, I'm listening. Just don't make me create an account first.",
        "I can see myself using it. Once. Twice if it's raining.",
      ],
      high: [
        "Wait — I actually want this. Where's the sign-up button?",
        "This fixes something I complain about every week. Take my money. Some of it.",
      ],
    },
    points: [
      { when: (s) => s.pain, text: "You've described something that genuinely annoys me. That's the best part of this — don't lose it." },
      { when: (s) => s.subscription, text: "Another subscription? I'm already paying for streaming services I don't watch. This has to be worth more than a Netflix plan." },
      { when: (s) => !s.monetization, text: "You haven't said what it costs, so I'm assuming free. When it stops being free, that's when you'll find out if I really like it." },
      { when: (s) => s.crypto, text: "If I need a wallet, a seed phrase or the word 'token', I'm out. I just want the thing to work." },
      { when: (s) => s.hardware, text: "I'd have to buy a gadget, charge it and remember to use it. My drawer of abandoned gadgets says no." },
      { when: (s) => s.regulated || s.ai, text: "If it's touching my health, money or personal data, I need to trust you completely. Who are you, and why should I believe you?" },
      { when: (s) => s.app, text: "I'm not downloading another app for this. My phone is full of apps I opened once. Can it just work in a browser?" },
      { when: (s) => s.social, text: "I don't want another place to keep up with people. If my friends aren't there on day one, neither am I." },
      { when: (s) => s.marketplace, text: "Whoever's on the other side has to be reliable. One bad experience and I'm back to {substitute}." },
    ],
    genericPoints: [
      "Right now I solve this with {substitute}. It's not perfect, but it's free and I don't have to learn anything.",
      "Make the first thirty seconds magical. If I have to fill in a form before I see any value, I'm gone.",
      "Tell me the price. If it's less than a coffee and saves me real time, we can talk.",
    ],
    strengths: [
      { when: (s) => s.pain, text: "Solves a frustration people genuinely feel." },
      { when: (s) => !s.hardware && !s.crypto, text: "Easy to understand what it does for me." },
    ],
    genericStrengths: ["I can picture the moment I'd reach for it."],
    weaknesses: [
      { when: (s) => s.subscription, text: "Subscription fatigue — I'd need a strong reason to add one more." },
      { when: (s) => s.app, text: "Needs yet another app download." },
      { when: (s) => s.crypto, text: "Too much crypto jargon for normal people." },
    ],
    genericWeaknesses: ["Not clear why I'd switch from {substitute}."],
    attack: "Everyone's talking strategy. I'm the one who's meant to pay, {d}, and I'm not convinced.",
    defend: "Hold on, {a}. I actually have this problem. That's worth more than a spreadsheet.",
    chime: "I'd use it if it were free. Which I suspect is exactly what {a} is worried about.",
    retort: "A problem I have isn't a problem I'd pay for, {d}. Those are different things.",
    settle: {
      KILL: "I'll keep doing what I'm doing. Sorry.",
      FIX: "Make it simpler and cheaper and I'd honestly try it.",
      BUILD: "Just tell me when it launches.",
    },
  },
};

export const RISKS: Rule[] = [
  { when: (s) => s.crypto, text: "Crypto complexity scares off the mainstream users you need, while the crypto-native crowd moves on to the next token." },
  { when: (s) => s.hardware, text: "Capital risk: you could burn the entire runway on manufacturing before the first unit ships." },
  { when: (s) => s.marketplace, text: "Liquidity. Without supply, demand churns; without demand, supply leaves. Most marketplaces die in exactly this loop." },
  { when: (s) => s.ai, text: "Platform risk: a big AI provider ships this as a free feature and your differentiation evaporates overnight." },
  { when: (s) => s.regulated, text: "Trust and regulation: one compliance misstep or data incident could end the company." },
  { when: (s) => s.social, text: "The cold start. Empty social products feel dead, and dead products don't get a second visit." },
  { when: (s) => s.subscription, text: "Churn. People sign up out of curiosity and cancel in month two unless the value keeps arriving." },
  { when: (s) => !s.monetization, text: "Nobody pays. Without proven willingness to pay, this becomes a well-liked free tool that slowly runs out of money." },
];
export const DEFAULT_RISK = "Indifference. The biggest threat isn't a competitor — it's people shrugging and sticking with {substitute}.";

export const OPPORTUNITIES: Rule[] = [
  { when: (s) => s.b2b, text: "Narrow to one industry with an expensive, specific pain and become the obvious tool for that niche before expanding." },
  { when: (s) => s.ai, text: "Sell the finished outcome, not the tool: a done-for-you result is worth far more than another AI app people must learn." },
  { when: (s) => s.marketplace, text: "Start as a curated, concierge service in one location. Manual matchmaking now becomes the data moat later." },
  { when: (s) => s.social, text: "Design a single-player mode so it's useful alone, then let sharing become the growth loop." },
  { when: (s) => s.category !== null, text: "{audience} are a reachable, identifiable tribe. Owning that community first is a genuine wedge." },
  { when: (s) => s.pain, text: "The frustration is real and specific. A tightly scoped version that fixes one painful moment brilliantly could earn a loyal niche." },
];
export const DEFAULT_OPPORTUNITY =
  "Find the one moment where this hurts most, fix just that brilliantly, and let a small, loyal niche pull you forward.";

export const CLOSING_LINES: Record<Verdict, string[]> = {
  KILL: [
    "Bury it, keep the lesson, and pitch us something braver.",
    "It's not you, it's the idea. Mostly the idea.",
    "The panel has spoken: lovely funeral, wrong idea.",
  ],
  FIX: [
    "Good bones, bad blueprint. Come back when it has a wedge.",
    "Not dead. Just needs surgery — and a sharper scalpel.",
    "Fix the who, the why and the how much, and we'll talk again.",
  ],
  BUILD: [
    "Go build it before someone on this panel steals it.",
    "Stop pitching. Start shipping.",
    "The tribunal is adjourned. Get to work.",
  ],
};
