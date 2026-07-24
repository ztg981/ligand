import { loadEnv } from "vite";

const env = loadEnv("electron", process.cwd(), "");
const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];
const missing = required.filter((name) => !env[name]?.trim());

if (missing.length > 0) {
  console.error(
    `[electron build] Missing required cloud configuration: ${missing.join(", ")}`
  );
  console.error(
    "Add the values to .env.local (or the build environment) before packaging Ligand."
  );
  process.exit(1);
}

console.log("[electron build] Required cloud configuration found.");
