# Creative direction: "YOUR BUSINESS IDEA IS ON TRIAL."

## Why V1 was rejected, and what V2 does differently

V1 (`artifacts/phase-5-launch/`) was a product walkthrough: screen recordings, big captions, no characters, no sound design beyond a drone. V2 inverts it: the **four judges are the stars**, the courtroom is the world, the verdict is the payoff, and the real app appears only as a short, honest reveal at the end.

| | V1 | V2 |
|---|---|---|
| Subject | the website | four animated judges in a courtroom |
| Footage | ~100% app recording | ~86% promotional animation, ~14% (4.8 s) real app |
| Comedy | none | reaction gags, a setup/payoff verdict, a hopeful-then-still-dead twist |
| Camera | static screen | push-ins, low-angle reveals, hard cuts, whip blur, shake on impacts |
| Sound | drone and ticks | tension/release, deliberate silences, per-character voices, a verdict impact |

## The premise and its two payoffs

The accused is a real benchmark idea, "a blockchain-verified NFT marketplace for sourdough starters", which Claude Haiku 5.5 actually scored **19/100, KILL IT**. Two payoffs, both honest to the stored result:

1. **The verdict.** Silence, a rising stamp, the slam, KILL IT.
2. **The twist.** FIX MY IDEA genuinely rewrote it into a "Starter Lineage Log" and projected **41/100, still KILL IT**. We keep that: a 22-point improvement that is *still dead* is funnier than a fake rescue, and it is true. (Its FIX pitch even says "No tokens, no wallet", which Wallet reacts to.)

## Three opening concepts (evaluated before building)

| Concept | Hook strength | Instant comprehension | Originality | Comedy | Feasibility | Vertical fit |
|---|---|---|---|---|---|---|
| **A. Dark court, eyes snap on one by one** | Medium: first frame is mostly black | Slow: needs 2 s to see four judges | Medium | Low | High | Good |
| **B. Fully lit wide shot, judges already in character, hook text from frame 0 (chosen)** | High: complete image on frame 1 | Immediate: premise in the text, cast in the picture | High | High: Kernel is unimpressed and Wallet is panicking before anything happens | High | Excellent: a symmetrical pyramid fits 9:16 |
| **C. The idea (a loaf with a chain) walks into court** | Medium | Medium: needs the pitch first | High | Medium | Low: needs a fifth animated character | Medium |

**Chosen: B.** The first frame has to stop a scroll *without sound*, so it must already be a finished picture. B shows the whole cast, their attitudes and the premise at once. A would have spent the first seconds on black; C needed an extra character and would have delayed the premise.

## Structure (34.8 s)

| Act | Time | Purpose |
|---|---|---|
| Hook | 0.0 – 3.4 | Premise + cast. Kernel unimpressed, Wallet panicking, Sterling smug. |
| The accused | 3.4 – 7.2 | The idea lands on the podium; a deliberate silence; four reaction cuts (Sterling's brow, Kernel's ERR, Hype's shades flying off, Wallet's stare). |
| The roast | 7.2 – 18.1 | Four real quotes, each with an acting beat: Sterling's calculator and laugh, Kernel overheating then blue-screening, Hype's shades on and notification storm then deflation, Wallet opening an empty wallet, throwing a receipt and leaving. |
| The verdict | 18.1 – 22.0 | Music cuts. The score counts to 19. Sterling raises the stamp. Slam, KILL IT. Wallet peeks back up. |
| The twist | 22.0 – 27.0 | "BUT CAN AI SAVE IT?" The FIX card, 19 → 41, Wallet reacting to "NO WALLET", the second, smaller slam, "+22 POINTS. STILL DEAD." |
| The real app | 27.0 – 31.8 | A whip cut into the real product: the pitch typed in, Hype's real card, the real verdict, the real FIX result. Labelled as a replayed sample session. |
| End card | 31.8 – 34.8 | The four judges' eyes, "YOUR IDEA IS NEXT.", "WOULD IT SURVIVE?", a closing sting. No URL: none exists yet. |

## Comedy mechanics (each has a setup, a beat and a payoff, not a rapid-cut pile)

1. **Kernel blue-screens at the pitch's logic** (overheat, crash, reboot, eye-roll).
2. **Wallet leaves.** Opens his wallet (one lonely 1p), throws the proposal at the camera and sinks out of frame, leaving an empty seat. He peeks back after the verdict.
3. **Hope, then the stamp again.** The judges look hopeful at the FIX; Sterling re-raises the stamp; Kernel's face is ERR; Wallet's deadpan stare lands the last laugh.
4. **Sterling's offence at the numbers**: a holographic "£0.00" and a dismissive laugh.
5. **Hype's rise and fall**: shades fly on, notifications swirl, then the shades fall off and he deflates.

Silent-readable moments (work with sound off): Kernel's ERR face (5.4 s), Hype's shades flying off (6.3 s), Wallet's stare into camera (6.9 s), Wallet's empty wallet (16 s), the stamp slam (19.9 s), Wallet's NO WALLET double-take (24.6 s).

## Look

The courtroom borrows the app's palette and fonts (Anton, JetBrains Mono, Space Grotesk, near-black with warm amber, cyan, pink and mint) so the cut into the real UI feels intentional. Lighting is spotlight cones, haze and dust; the stage is a symmetrical pyramid (Sterling raised above three) so all four fit a 9:16 frame and the camera can punch into any one. Camera moves are hard cuts and slow push-ins; a short blur and shake sell impacts.

## Honest limits of the method

There is no 3D package, image generator or paid animation tool in this environment. The judges are **2.5D layered-vector rigs written in code** and rendered frame by frame, so this is stylised flat-shaded animation with real acting (anticipation, squash, reactions, holds), not Pixar-grade 3D. See `media-validation.md` for what I could and could not verify.
