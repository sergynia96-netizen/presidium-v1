#!/usr/bin/env node
/**
 * Presidium CI — Forbidden Pattern Checker
 *
 * Scans workspace source files for patterns that violate project policy.
 * Runs in two modes:
 *   --strict  → treat all violations as errors (fail CI)
 *   (default)→ report violations as warnings (pass CI, print report)
 *
 * Exit code 0 = pass, 1 = violations found in strict mode.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

// ─── Configuration ────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../..");

/** Directories to scan (workspace roots) */
const SCAN_DIRS = ["packages", "apps", "services"];

/** Glob-like extensions to include */
const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
]);

/** Directories to skip entirely */
const SKIP_DIRS = new Set([
  "node_modules", "dist", ".next", "build", "out",
  "src-tauri", "__tests__", "__mocks__", ".turbo",
  "coverage", ".output",
]);

/**
 * Rule definitions.
 * Each rule: { id, severity: "error"|"warn", pattern: RegExp, message, scope? }
 *
 * If `scope` is provided, only files matching the scope regex are checked.
 */
const RULES = [
  // ── TypeScript safety ─────────────────────────────────────────────────
  {
    id: "ts-ignore",
    severity: "error",
    pattern: /@ts-ignore\b/,
    message:
      "@ts-ignore suppresses type errors. Fix the underlying type issue or use @ts-expect-error with a justification comment.",
  },
  {
    id: "ts-nocheck",
    severity: "error",
    pattern: /@ts-nocheck\b/,
    message:
      "@ts-nocheck disables type checking for the entire file. Remove it and fix the type errors.",
  },

  // ── Security ──────────────────────────────────────────────────────────
  {
    id: "no-eval",
    severity: "error",
    pattern: /\beval\s*\(/,
    message: "eval() is a security risk and performance hazard. Use JSON.parse() or a proper parser.",
  },
  {
    id: "no-new-function",
    severity: "error",
    pattern: /new\s+Function\s*\(/,
    message:
      "new Function() is equivalent to eval(). Use a proper factory or callback pattern.",
    // Allow dynamic import shim: new Function('specifier', 'return import(specifier)')
    excludeIf: /return\s+import\s*\(/,
  },
  {
    id: "no-hardcoded-secret",
    severity: "error",
    pattern: /(?:password|secret|token|api_key|apikey)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    message:
      "Hardcoded secret detected. Use environment variables (process.env.*) and never commit secrets.",
  },

  // ── Workspace boundary ────────────────────────────────────────────────
  {
    id: "no-mini-services-import",
    severity: "error",
    pattern: /require\s*\(\s*['"].*mini-services/,
    message:
      "mini-services/ is not in the workspace and must not be imported from workspace packages.",
  },
  {
    id: "no-mini-services-import-dynamic",
    severity: "error",
    pattern: /import\s*\(\s*['"].*mini-services/,
    message:
      "mini-services/ is not in the workspace and must not be dynamically imported.",
  },

  // ── Package purity (shared packages must not have side-effect imports) ─
  {
    id: "shared-no-console-log",
    severity: "warn",
    pattern: /console\.(log|warn|error|info|debug|trace)\s*\(/,
    scope: /^packages\/shared-/,
    message:
      "Shared packages should not use console.* directly. Return errors/results to callers.",
  },
  {
    id: "shared-no-any-type",
    severity: "warn",
    pattern: /:\s*any\b/,
    scope: /^packages\/shared-/,
    message:
      "'any' type in shared packages defeats type safety. Use a specific type or 'unknown'.",
  },
  {
    id: "shared-no-as-any",
    severity: "warn",
    pattern: /\bas\s+any\b/,
    scope: /^packages\/shared-/,
    message:
      "'as any' cast in shared packages defeats type safety. Use a proper type assertion.",
  },

  // ── Cross-boundary relative imports ───────────────────────────────────
  {
    id: "no-cross-workspace-relative",
    severity: "error",
    pattern: /(?:require|import)\s*[\s(]*['"]\.\.[/\\]+\.\.[/\\]/,
    message:
      "Relative import escapes parent directory — likely crossing workspace boundary. Use @presidium/ scope import.",
  },
];

// ─── File discovery ───────────────────────────────────────────────────────────

/**
 * Recursively find source files under a directory.
 */
function findSourceFiles(dir, base = REPO_ROOT) {
  const results = [];
  let entries;

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(base, fullPath);

    if (entry.isDirectory()) {
      results.push(...findSourceFiles(fullPath, base));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(relPath);
    }
  }

  return results;
}

// ─── Pattern scanning ─────────────────────────────────────────────────────────

/**
 * Check a single file against all rules.
 * Returns array of { ruleId, severity, line, col, message, relPath }.
 */
function checkFile(relPath, repoRoot) {
  const violations = [];
  const fullPath = path.join(repoRoot, relPath);

  let content;
  try {
    content = fs.readFileSync(fullPath, "utf8");
  } catch {
    return violations;
  }

  const lines = content.split("\n");

  for (const rule of RULES) {
    // Check scope filter
    if (rule.scope && !rule.scope.test(relPath)) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip single-line comments for some rules
      if (
        (rule.id === "shared-no-console-log" ||
          rule.id === "no-hardcoded-secret") &&
        line.trimStart().startsWith("//")
      ) {
        continue;
      }

      const match = line.match(rule.pattern);
      if (match) {
        // Check excludeIf — skip if the line also matches the exclusion pattern
        if (rule.excludeIf && rule.excludeIf.test(line)) continue;

        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          line: i + 1,
          col: match.index + 1,
          message: rule.message,
          relPath,
        });
      }
    }
  }

  return violations;
}

// ─── Output formatting ────────────────────────────────────────────────────────

function formatViolation(v) {
  const severityIcon = v.severity === "error" ? "\u2718" : "\u26A0";
  return `  ${severityIcon} [${v.ruleId}] ${v.relPath}:${v.line}:${v.col}\n    ${v.message}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");

  console.log("Presidium CI — Forbidden Pattern Checker");
  console.log(`Mode: ${strict ? "STRICT (errors fail CI)" : "REPORT (warnings only)"}\n`);

  // Discover all source files in scan dirs
  const allFiles = [];
  for (const scanDir of SCAN_DIRS) {
    const fullDir = path.join(REPO_ROOT, scanDir);
    if (fs.existsSync(fullDir)) {
      allFiles.push(...findSourceFiles(fullDir));
    }
  }

  console.log(`Scanning ${allFiles.length} source files in [${SCAN_DIRS.join(", ")}]\n`);

  // Check all files
  const violations = [];
  for (const relPath of allFiles) {
    violations.push(...checkFile(relPath, REPO_ROOT));
  }

  // Group by severity
  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warn");

  // Report
  if (violations.length === 0) {
    console.log("No violations found. All checks passed.");
    return 0;
  }

  if (errors.length > 0) {
    console.log(`ERRORS (${errors.length}):`);
    for (const v of errors) console.log(formatViolation(v));
    console.log();
  }

  if (warnings.length > 0) {
    console.log(`WARNINGS (${warnings.length}):`);
    for (const v of warnings) console.log(formatViolation(v));
    console.log();
  }

  console.log(`Total: ${violations.length} violations (${errors.length} errors, ${warnings.length} warnings)`);

  // In strict mode, any violation fails; in report mode, only errors fail.
  const shouldFail = strict ? violations.length > 0 : errors.length > 0;

  if (shouldFail) {
    console.log("\nCI FAILED — fix violations before merging.");
    return 1;
  }

  console.log("\nCI PASSED (warnings are informational).");
  return 0;
}

process.exit(main());
