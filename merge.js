const fs = require("fs");
const path = require("path");

const fragmentsDir = process.env.FRAGMENTS_DIR || "changelog";
const outputFile = process.env.OUTPUT_FILE || "CHANGES_COMBINED.md";
const groupBy = process.env.GROUP_BY || "pr";
const githubOutput = process.env.GITHUB_OUTPUT;

function findFragments(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("-CHANGES.md"))
    .sort()
    .map((f) => path.join(dir, f));
}

function prNumberFromPath(filePath) {
  const basename = path.basename(filePath);
  const match = basename.match(/^(\d+)-CHANGES\.md$/);
  return match ? match[1] : null;
}

function parseFragment(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const sections = new Map();
  let title = null;
  let currentHeader = null;

  for (const line of lines) {
    const titleMatch = line.match(/^<!--\s*title:\s*(.+?)\s*-->$/);
    if (titleMatch) {
      title = titleMatch[1];
    } else if (line.startsWith("### ")) {
      currentHeader = line;
      if (!sections.has(currentHeader)) {
        sections.set(currentHeader, []);
      }
    } else if (line.startsWith("## ") || line.startsWith("# ")) {
      currentHeader = null;
    } else if (currentHeader && line.startsWith("- ")) {
      sections.get(currentHeader).push(line);
    }
  }

  return { title, sections };
}

function mergeFragments(fragments) {
  const merged = new Map();

  for (const filePath of fragments) {
    const { sections } = parseFragment(filePath);
    for (const [header, items] of sections) {
      if (!merged.has(header)) {
        merged.set(header, []);
      }
      merged.get(header).push(...items);
    }
  }

  return merged;
}

// Oldest PR first, so "10-CHANGES.md" follows "9-CHANGES.md" rather than "1-CHANGES.md".
function byPrNumber(a, b) {
  return Number(prNumberFromPath(a)) - Number(prNumberFromPath(b));
}

// Category headers in the order the fragments list them. Each fragment keeps
// git-cliff's group order (Features before Bug Fixes), so a header comes after
// every header that precedes it in any fragment; otherwise first seen, first.
function categoryOrder(fragments) {
  const seen = [];
  const before = new Map();
  for (const filePath of fragments) {
    const headers = [...parseFragment(filePath).sections.keys()];
    headers.forEach((header, index) => {
      if (!before.has(header)) {
        before.set(header, new Set());
        seen.push(header);
      }
      for (const earlier of headers.slice(0, index)) before.get(header).add(earlier);
    });
  }
  const ordered = [];
  const remaining = [...seen];
  while (remaining.length > 0) {
    // Fall back to the first remaining header if fragments disagree on order.
    const index = Math.max(0, remaining.findIndex((h) => [...before.get(h)].every((e) => ordered.includes(e))));
    ordered.push(...remaining.splice(index, 1));
  }
  return ordered;
}

function formatOutput(fragments, groupBy = "pr") {
  let output = "# Changelog\n\n## [Unreleased]\n\n";

  if (groupBy === "category") {
    // One list per category across every PR, without PR headings. An entry
    // that two fragments share (a commit that reached the base branch through
    // two PRs) is listed once.
    const sorted = [...fragments].sort(byPrNumber);
    const merged = mergeFragments(sorted);
    for (const header of categoryOrder(sorted)) {
      const unique = [...new Set(merged.get(header))];
      if (unique.length === 0) continue;
      output += header + "\n";
      for (const item of unique) {
        output += item + "\n";
      }
      output += "\n";
    }
  } else if (fragments.length === 1) {
    const { sections } = parseFragment(fragments[0]);
    for (const [header, items] of sections) {
      if (items.length > 0) {
        output += header + "\n";
        for (const item of items) {
          output += item + "\n";
        }
        output += "\n";
      }
    }
  } else {
    for (const filePath of fragments) {
      const prNumber = prNumberFromPath(filePath);
      const { title, sections } = parseFragment(filePath);
      const hasItems = [...sections.values()].some(
        (items) => items.length > 0
      );
      if (!hasItems) continue;

      const heading = title || `PR #${prNumber}`;
      output += `### ${heading}\n\n`;
      for (const [header, items] of sections) {
        if (items.length > 0) {
          output += "#" + header + "\n";
          for (const item of items) {
            output += item + "\n";
          }
          output += "\n";
        }
      }
    }
  }

  return output;
}

function main() {
  const fragments = findFragments(fragmentsDir);

  if (fragments.length === 0) {
    console.log("No changelog fragments found");
    if (githubOutput) {
      fs.appendFileSync(githubOutput, "has-fragments=false\n");
    }
    return;
  }

  console.log(`Found changelog fragments: ${fragments.join(", ")}`);
  if (groupBy !== "pr" && groupBy !== "category") {
    throw new Error(`group-by must be "pr" or "category", not "${groupBy}"`);
  }
  const output = formatOutput(fragments, groupBy);
  fs.writeFileSync(outputFile, output);
  console.log(`Written combined changelog to ${outputFile}`);

  if (githubOutput) {
    fs.appendFileSync(githubOutput, "has-fragments=true\n");
  }
}

// Allow importing for tests
if (require.main === module) {
  main();
} else {
  module.exports = {
    parseFragment,
    mergeFragments,
    formatOutput,
    findFragments,
    prNumberFromPath,
  };
}
