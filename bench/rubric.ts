/** The human-review rubric (also documented in bench/RUBRIC.md). Each criterion is scored 1–5. */
export const RUBRIC = [
  { key: "specificity", label: "Specific to this idea", hint: "1 = could apply to any startup · 5 = only makes sense for this pitch" },
  { key: "realism", label: "Realistic reasoning", hint: "1 = invented facts or nonsense economics · 5 = sound assumptions, clearly framed" },
  { key: "humour", label: "Funny", hint: "1 = flat or just insulting · 5 = I'd screenshot it" },
  { key: "voices", label: "Distinct personas", hint: "1 = four copies of one voice · 5 = unmistakably STERLING, KERNEL, HYPE, WALLET" },
  { key: "debate", label: "Real debate", hint: "1 = four monologues · 5 = they genuinely answer, concede and push each other" },
  { key: "usefulness", label: "Useful advice", hint: "1 = nothing I could act on · 5 = I know exactly what to change" },
  { key: "fix", label: "FIX MY IDEA quality", hint: "1 = cosmetic rewording · 5 = materially stronger idea that answers the criticism" },
] as const;

export type RubricKey = (typeof RUBRIC)[number]["key"];
