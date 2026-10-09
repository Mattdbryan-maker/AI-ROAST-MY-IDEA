# Character bible: the four judges

Original characters created for AI ROAST MY IDEA. They are promotional animation: they are **not** part of the website (the site's judges are the existing small UI sigils). Nothing here copies an existing character.

## Shared design language (why they read as one cast)

- Near-black outline (`#05060a`), the same weight (6 px at master scale) on every body part.
- A **glossy dark "screen" face** with glowing features on all four.
- One top-left key light: a white rim highlight on upper edges, a darker lower edge.
- Each lit in a single signature colour, used for their eyes, name plate, spotlight and rim.
- Round-jointed two-segment arms with simple round hands.
- Same camera perspective: frontal, seated behind a bench.

Silhouette test: **Sterling** = tall arched throne with a gold head; **Kernel** = small boxy monitor with cables and a fan; **Hype** = floating, tapered hologram with a quiff and big visor shades; **Wallet** = tall rectangle with flap, stitching and dangling receipts.

## STERLING: the ruthless investor
- **Colours:** gold `#ffc247`, amber, black.
- **Look:** gold-plated head with a face screen, monocle with chain, tailored black suit, gold tie and cuffs, pocket square, a giant red-padded stamp, a holographic calculator, a luxury throne on a raised bench.
- **Personality:** smug, arithmetic-driven, offended by bad numbers. "A £10 idea has personally wasted £10 million of my time."
- **Expressions:** neutral smirk, smug talk, brow raise, calculating, disgust (glasses), stamp raised, laugh.
- **Signature actions:** one eyebrow rises slowly; the calculator reads "£0.00"; the slow, creaking stamp lift; the slam.
- **Sound:** low, smooth triangle-wave murmur for speech; cash-register bell for money; a servo whine for the brow; a heavy stamp thud.
- **Recurring traits:** never raises his voice; always the last to react; the stamp is always the final word.

## KERNEL: the overworked engineer
- **Colours:** electric cyan `#33e7ff`, graphite.
- **Look:** a battered CRT-monitor head with pixel eyes, a boxy chassis with a sticker and scuffs, tangled cables, a spinning fan, a warning lamp, a temperature gauge, tiny clamp hands.
- **Personality:** brilliant, permanently irritated, allergic to vague promises.
- **Expressions:** half-lidded unimpressed, ERR (X eyes), overheating (red screen, steam, sparks, fan), blue screen ":(", reboot squint, eye-roll.
- **Signature actions:** screen glitch, fan spin-up, steam, sparks, blue-screen crash, reboot with a sceptical look.
- **Sound:** quantised square-wave bit-blips for speech; digital glitches and error beeps; a descending crash tone and a reboot arpeggio.
- **Recurring traits:** he has to survive the idea; the gauge is always in the red by the end of a pitch.

## HYPE: the chaotic marketing genius
- **Colours:** neon pink `#ff4fd8`, magenta, violet.
- **Look:** a flamboyant violet hologram entertainer on a projector disc, a neon quiff, huge wraparound shades that can fly on and off, a sequinned jacket, floating hearts and "99+" notification bubbles, elastic dramatic poses.
- **Personality:** hyper-confident, theatrical, offended by boring branding, with real marketing insight under the show ("cults don't buy certificates for their pet yeast" is a genuine point about the buyer).
- **Expressions:** confident, pose, shades-off shock, deflated, glint, hopeful.
- **Signature actions:** shades fly on, the notification storm, the dramatic arm pose, squash-and-stretch; shades fly off and he deflates.
- **Sound:** gliding bright sine-plus-octave "sparkle" voice; notification pings; a slide-whistle fall.
- **Recurring traits:** every line gets a pose; he is the most animated and the most deflatable.

## WALLET: the brutally honest customer
- **Colours:** mint green `#6dffb0`, charcoal leather.
- **Look:** a small, worn bifold-wallet robot with stitched edges, a flap that opens, big expressive eyes with heavy lids, a plaster on the corner, receipts spilling from a card slot, tiny arms and legs.
- **Personality:** practical, relatable, stressed about money. The viewer instinctively agrees with him.
- **Expressions:** panic (sweat, huge eyes), deadpan (heavy lids), wallet open (empty, 1p), offended, wince, peek.
- **Signature actions:** shaking, sweat drops, opening the wallet to find almost nothing, throwing a receipt at the camera, quietly leaving, peeking back.
- **Sound:** small descending squeaks for speech; a leather creak, a single 1p "tink" and a generic sad-trombone idiom; a paper rustle.
- **Recurring traits:** the voice of reality; the stare is his best weapon.

## Reusable assets

- `characters/{sterling,kernel,hype,wallet}.svg`: standalone master artwork (neutral pose).
- `characters/*-expressions.png`: six poses per judge.
- `characters/lineup.png` and `group-shot.png`: the cast together, and the courtroom pyramid.
- **The rig:** `scripts/trailer/characters.js` (tracked in Git). Each judge is built once and posed by a flat list of numbers (head, eyes, brows, mouth, arms, plus character-specific props), so new poses and scenes are data, not redrawing. `scripts/trailer/scene.js` shows how to act them over time.

## Animation language

Anticipation before an action; squash/stretch on emphasis (Hype); holds before reactions (comedy timing); blinking and idle bobbing so nothing is ever frozen; a head tilt before a line; arm swings that overshoot (ease "back"); impacts shake the camera and flash the frame.
