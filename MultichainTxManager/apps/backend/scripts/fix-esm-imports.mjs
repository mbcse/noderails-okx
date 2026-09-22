#!/usr/bin/env node
/**
 * Post-build: add .js extensions to relative imports in dist for Node ESM.
 * Prisma-generated client doesn't emit .js, so we fix it here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distGenerated = path.join(__dirname, "..", "dist", "generated");

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;
  // Relative imports: from "./x" or from '../x' — add .js if not present
  content = content.replace(
    /from\s+(["'])(\.\.?\/[^"']+?)\1/g,
    (_, quote, p) => (p.endsWith(".js") ? `from ${quote}${p}${quote}` : `from ${quote}${p}.js${quote}`)
  );
  if (content !== original) fs.writeFileSync(filePath, content);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith(".js")) fixFile(full);
  }
}

walk(distGenerated);
console.log("Fixed ESM imports in dist/generated");
