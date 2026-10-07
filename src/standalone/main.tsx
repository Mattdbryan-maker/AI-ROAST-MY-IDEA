import { createRoot } from "react-dom/client";
import { RoastExperience } from "@/components/RoastExperience";

// Entry point for the standalone demo build (see scripts/build-standalone.mjs).
createRoot(document.getElementById("root")!).render(<RoastExperience />);
