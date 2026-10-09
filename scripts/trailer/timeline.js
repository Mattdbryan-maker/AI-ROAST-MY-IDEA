/* Shared timeline for the Phase 6 trailer. Read by the scene (visuals) and by audio.mjs (sound), so they cannot drift.
 * Times are seconds on the final 30 fps timeline. */
(function (root) {
  const TL = {};

  TL.duration = 34.8;
  TL.fps = 30;

  // Act boundaries
  TL.act = {
    hook: [0, 3.4],
    accused: [3.4, 7.2],
    roast: [7.2, 18.1],
    verdict: [18.1, 22.0],
    twist: [22.0, 27.0],
    app: [27.0, 31.8],
    end: [31.8, 34.8],
  };

  /* Dialogue. "source" says exactly where the words come from in bench/results/2026-10-08T19-08-52-final-10 (Haiku 5.5,
   * prompt 2026-10-08.4, idea bad-nft-sourdough). "exact" = unaltered words; "tail" = a verbatim tail of the sentence. */
  TL.lines = [
    { who: "sterling", t0: 7.35, t1: 9.95, text: "A starter is a jar of flour and water that a hobbyist can split with a spoon for free.", source: "investor headline", exact: true },
    { who: "kernel", t0: 10.15, t1: 12.4, text: "A tree that anyone can type into is just a nicer Word document.", source: "engineer debate line (2nd sentence)", exact: true },
    { who: "hype", t0: 13.0, t1: 15.2, text: "Sourdough is a cult, but cults don't buy certificates for their pet yeast.", source: "marketer headline", exact: true },
    { who: "wallet", t0: 15.75, t1: 17.7, text: "…and I have never once wanted its family tree.", source: "customer headline (verbatim tail, leading clause dropped)", exact: false },
  ];

  TL.names = { sterling: "STERLING", kernel: "KERNEL", hype: "HYPE", wallet: "WALLET" };
  TL.colors = { sterling: "#ffc247", kernel: "#33e7ff", hype: "#ff4fd8", wallet: "#6dffb0" };
  TL.roles = { sterling: "THE INVESTOR", kernel: "THE ENGINEER", hype: "THE MARKETER", wallet: "THE CUSTOMER" };

  /* Real result being dramatised (bench record: anthropic:claude-haiku-5-5, bad-nft-sourdough). */
  TL.real = {
    pitch: "A blockchain-verified NFT marketplace for sourdough starters. Every starter gets an on-chain pedigree and owners vote on new flavours through a DAO.",
    overall: 19,
    verdict: "KILL IT",
    scores: { sterling: 18, kernel: 22, hype: 24, wallet: 14 },
    fixTitle: "Starter Lineage Log for Home Bakers",
    fixSnippet: "No tokens, no wallet, just email sign-in.",
    fixProjected: 41,
    fixProjectedVerdict: "KILL IT",
  };

  /* Sound / event cues. type is interpreted by audio.mjs; the scene uses the same list for flashes/shakes. */
  TL.cues = [
    { t: 0.0, type: "hit", gain: 0.9 }, // opening impact on the hook text
    { t: 0.05, type: "lamps", gain: 0.7 }, // judges' lights thunk on (already lit at frame 0)
    { t: 0.9, type: "panic", who: "wallet" },
    { t: 3.4, type: "whoosh", gain: 0.8 },
    { t: 3.45, type: "glitch", gain: 0.7 },
    { t: 3.7, type: "riser", dur: 0.78 },
    { t: 4.5, type: "silence", dur: 0.7 }, // deliberate comedic silence while the judges stare
    { t: 4.55, type: "brow", who: "sterling" },
    { t: 5.4, type: "glitch", gain: 0.9 },
    { t: 5.5, type: "error", gain: 0.8 },
    { t: 6.25, type: "shades", gain: 0.9 }, // Hype pulls off the shades
    { t: 6.9, type: "blink", gain: 0.6 },
    { t: 7.15, type: "whoosh", gain: 0.5 },
    { t: 7.5, type: "coin", gain: 0.7 }, // Sterling: £0.00 on the calculator
    { t: 9.3, type: "gasp", who: "wallet" },
    { t: 10.2, type: "fan", dur: 2.0 }, // Kernel overheating
    { t: 12.05, type: "spark", gain: 0.9 },
    { t: 12.15, type: "bsod", gain: 1.0 },
    { t: 12.75, type: "reboot", gain: 0.8 },
    { t: 12.9, type: "whoosh", gain: 0.6 },
    { t: 13.0, type: "shadesOn", gain: 1.0 },
    { t: 13.9, type: "notify", gain: 0.8 },
    { t: 14.2, type: "notify", gain: 0.7 },
    { t: 14.5, type: "notify", gain: 0.6 },
    { t: 15.1, type: "deflate", gain: 0.9 },
    { t: 15.6, type: "whoosh", gain: 0.5 },
    { t: 16.0, type: "wallet", gain: 0.9 }, // opens wallet: 1p
    { t: 17.15, type: "receipt", gain: 0.8 },
    { t: 17.6, type: "walk", gain: 0.7 }, // wallet shuffles away
    { t: 18.1, type: "silence", dur: 0.8 },
    { t: 18.3, type: "tension", dur: 1.6 },
    { t: 18.5, type: "creak", gain: 0.8 }, // stamp rises
    { t: 19.9, type: "stamp", gain: 1.0 }, // THE verdict impact
    { t: 20.0, type: "boom", gain: 1.0 },
    { t: 20.7, type: "peek", who: "wallet" },
    { t: 22.0, type: "whoosh", gain: 0.6 },
    { t: 22.15, type: "hope", dur: 2.6 },
    { t: 23.2, type: "tick", dur: 1.9 }, // score climbing 19 -> 41
    { t: 24.55, type: "nowallet", gain: 0.8 },
    { t: 25.5, type: "tension", dur: 0.9, soft: true },
    { t: 25.9, type: "stamp", gain: 0.75 },
    { t: 26.0, type: "boom", gain: 0.6 },
    { t: 26.5, type: "error", gain: 0.7 },
    { t: 27.0, type: "whip", gain: 1.0 },
    { t: 28.2, type: "swipe", gain: 0.5 },
    { t: 29.4, type: "swipe", gain: 0.5 },
    { t: 30.6, type: "swipe", gain: 0.5 },
    { t: 30.9, type: "riser", dur: 0.9 },
    { t: 31.8, type: "whip", gain: 0.9 },
    { t: 32.1, type: "sting", gain: 1.0 },
  ];

  if (typeof module !== "undefined") module.exports = TL;
  else root.TL = TL;
})(typeof window !== "undefined" ? window : globalThis);
