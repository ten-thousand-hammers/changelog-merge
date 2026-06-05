const fs = require("fs");
const path = require("path");

const fragmentsDir = process.env.FRAGMENTS_DIR || "changelog";
const outputFile = process.env.OUTPUT_FILE || "CHANGES_COMBINED.md";
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

function formatOutput(fragments) {
  let output = "# Changelog\n\n## [Unreleased]\n\n";

  if (fragments.length === 1) {
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
  const output = formatOutput(fragments);
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
