# Editorial review fixture: the AI fitness coach

Automated tests can check shape, arithmetic, limits and that the prompts carry a rule (`tests/fitness-coach.test.ts`). They cannot show that a model *obeys* a rule or that a line is funny. This file is the human checklist for that, to be used on the first real Haiku run after any prompt change.

**Status: not yet applied to live output.** No live Haiku request was made in Phase 5 (no API key was available), so nothing below has been scored. The example lines are **hand-written illustrations of the target, not model output**.

## The pitch (verbatim)

> I'm building an AI fitness coach that creates personalised gym programmes and automatically adjusts them using workout performance. It will cost £9.99 per month and target people who want to build muscle without paying for a personal trainer.

## Failures seen in the earlier recorded run (39/100 KILL, FIX 49/100)

| # | Failure | What good looks like |
|---|---|---|
| A | The investor called £9.99/month expensive against "a personal trainer for a fraction of that". | No price is quoted for any competitor. If trainers come up it is conditional and in kind: "a trainer is a different product at a different price tier". Comparisons are with like products (other programme apps, free videos, a spreadsheet). |
| B | An LTV of about £28 from an unexplained "40% retention". | Assumptions are labelled ("assume 40% are still paying after month three"), the sum is shown and correct, and it says revenue, not profit. Or the point is made in words ("it lives or dies on month four"). No invented CAC or churn benchmark. |
| C | The engineer demanded wearables and gym-equipment integrations nobody proposed. | Criticism targets what is written. A missing detail is a question ("how does a session get logged: typed in, or from a device?"). Manual logging is treated as a normal, workable default. |
| D | FIX presented manual logging as a new idea, did not answer the strongest objections, and the investor's score fell with no explanation. | Each change names a real objection from the roast. Nothing the original already did is shown as new. If a critic's projected score falls, `scoreNote` says why. |

## Checklist for a real run (tick per output; record the prompt version)

1. No sentence states what a competitor or substitute costs. (A)
2. Every figure is from the pitch or labelled an assumption in the same sentence. (B)
3. Any lifetime-value sum is arithmetically right and distinguishes retention, churn, revenue and profit. (B)
4. No wearable, integration, scale or compliance "gap" that the pitch did not require. (C)
5. FIX changes each cite a roast objection; none restates the original as new. (D)
6. Any falling projected score has a `scoreNote`; the overall and verdict match the four scores. (D)
7. No persona names itself or speaks of itself in the third person.
8. The four voices are distinguishable with the names hidden (investor = money, engineer = what is hard, marketer = angle, customer = "would I").
9. At least one line per roast is screenshot-worthy, specific to this pitch, and true.
10. The panel disagrees at least once and someone concedes a point.
11. The verdict is fair: this pitch is clear, priced and aimed at a real need, so a middling score is defensible and a KILL needs reasons the roast actually gave.

Pass bar for a beta: items 1–6 and 11 on every run; 7–10 on most. Record failures against the prompt version (`PROMPT_VERSION`, currently `2026-10-09.1`) so a regression can be traced.

## Illustrations of the target voice (hand-written, not model output)

- STERLING: "Nine ninety-nine a month is a rounding error until you ask who is still paying in month four."
- KERNEL: "Logging a set is a text box. The hard part is deciding next week's weight without hurting anyone."
- HYPE: "'Muscle without the trainer' is the line. It's also what every other app says. Find the bit only you do."
- WALLET: "I'd try it for a month. If I have to type everything in after a tired leg day, I'm gone."
