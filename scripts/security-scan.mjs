import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const SKIP_DIRS = new Set([".git", "node_modules", ".claude"]);
const SKIP_FILES = new Set(["package-lock.json"]);
const SKIP_DIR_PREFIXES = ["dist-electron", "release-backup-"];
const SKIP_FILE_PATTERNS = [/^Ligand-Setup-.*\.exe(?:\.blockmap)?$/i];

const PATTERNS = [
  { name: "Supabase secret key", re: /sb_secret_[A-Za-z0-9_-]{20,}/g },
  { name: "Gemini or Google API key", re: /AIza[0-9A-Za-z_-]{20,}/g },
  { name: "GitHub token", re: /(ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g },
  { name: "Vercel token", re: /vercel_[A-Za-z0-9_-]{20,}/g },
  { name: "Database URL with password", re: /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@[^\s]+/gi },
  { name: "Private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  {
    name: "Assigned service-role environment value",
    re: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*(?!(?:"|')?(?:your-|<|$))/gi,
  },
  {
    name: "Frontend secret-looking Vite env",
    re: /VITE_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE)[A-Z0-9_]*\s*=/g,
  },
];

const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (
        SKIP_DIRS.has(entry.name) ||
        SKIP_DIR_PREFIXES.some((prefix) => entry.name.startsWith(prefix))
      ) {
        continue;
      }
      walk(path.join(dir, entry.name));
      continue;
    }
    if (
      !entry.isFile() ||
      SKIP_FILES.has(entry.name) ||
      SKIP_FILE_PATTERNS.some((pattern) => pattern.test(entry.name))
    ) {
      continue;
    }
    const file = path.join(dir, entry.name);
    const rel = path.relative(root, file);
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const pattern of PATTERNS) {
      pattern.re.lastIndex = 0;
      if (pattern.re.test(text)) {
        findings.push({ file: rel, type: pattern.name });
      }
    }
  }
}

walk(root);

if (findings.length) {
  console.error("Potential privileged secret patterns found (values redacted):");
  for (const finding of findings) {
    console.error(`- ${finding.type} in ${finding.file}`);
  }
  process.exit(1);
}

console.log("No privileged secret patterns found in repository or build output.");
