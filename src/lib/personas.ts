import type { PersonaId } from "./types";

export interface Persona {
  id: PersonaId;
  name: string;
  role: string;
  tagline: string;
  /** What this persona is obsessed with — shown on hover and used in prompts. */
  focus: string;
  color: string;
  /** Space-separated RGB channels so CSS can do rgb(var(--c) / 0.4). */
  rgb: string;
}

export const PERSONAS: Record<PersonaId, Persona> = {
  investor: {
    id: "investor",
    name: "STERLING",
    role: "The Investor",
    tagline: "Has seen 10,000 decks. Funded eleven.",
    focus: "Market size · moats · unit economics",
    color: "#f5c04a",
    rgb: "245 192 74",
  },
  engineer: {
    id: "engineer",
    name: "KERNEL",
    role: "The Engineer",
    tagline: "Has opinions about your stack. You don't have a stack.",
    focus: "Feasibility · complexity · what breaks first",
    color: "#38e1ff",
    rgb: "56 225 255",
  },
  marketer: {
    id: "marketer",
    name: "HYPE",
    role: "The Marketer",
    tagline: "Can sell anything. Possibly not this.",
    focus: "Positioning · virality · who actually cares",
    color: "#ff4fd8",
    rgb: "255 79 216",
  },
  customer: {
    id: "customer",
    name: "WALLET",
    role: "The Customer",
    tagline: "Has 87 apps. Pays for three.",
    focus: "Would I use it · would I pay · what stops me",
    color: "#b6ff3d",
    rgb: "182 255 61",
  },
};

export const PERSONA_ORDER: PersonaId[] = ["investor", "engineer", "marketer", "customer"];
