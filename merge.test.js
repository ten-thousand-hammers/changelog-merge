const { describe, test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  parseFragment,
  mergeFragments,
  formatOutput,
  findFragments,
  prNumberFromPath,
} = require("./merge");

function writeTempFragment(dir, name, content) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("prNumberFromPath", () => {
  test("extracts PR number from fragment filename", () => {
    assert.strictEqual(prNumberFromPath("changelog/540-CHANGES.md"), "540");
    assert.strictEqual(prNumberFromPath("/some/path/123-CHANGES.md"), "123");
  });

  test("returns null for non-matching filenames", () => {
    assert.strictEqual(prNumberFromPath("CHANGES.md"), null);
    assert.strictEqual(prNumberFromPath("changelog/README.md"), null);
  });
});

describe("parseFragment", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test("parses a single fragment with multiple sections", () => {
    const filePath = writeTempFragment(
      tmpDir,
      "100-CHANGES.md",
      `# Changelog

## [Unreleased]

### 🚀 Added
- Add new feature A
- Add new feature B

### 🐛 Fixed
- Fix bug X
`
    );

    const { title, sections } = parseFragment(filePath);
    assert.strictEqual(title, null);
    assert.deepStrictEqual(sections.get("### 🚀 Added"), [
      "- Add new feature A",
      "- Add new feature B",
    ]);
    assert.deepStrictEqual(sections.get("### 🐛 Fixed"), ["- Fix bug X"]);
  });

  test("extracts title from HTML comment", () => {
    const filePath = writeTempFragment(
      tmpDir,
      "100-CHANGES.md",
      `# Changelog

## [Unreleased]
<!-- title: Fix login timeout -->

### 🚀 Added
- Add new feature
`
    );

    const { title, sections } = parseFragment(filePath);
    assert.strictEqual(title, "Fix login timeout");
    assert.deepStrictEqual(sections.get("### 🚀 Added"), ["- Add new feature"]);
  });

  test("handles title with extra whitespace", () => {
    const filePath = writeTempFragment(
      tmpDir,
      "100-CHANGES.md",
      `# Changelog

## [Unreleased]
<!--   title:   Some title with spaces   -->

### 🚀 Added
- Add feature
`
    );

    const { title } = parseFragment(filePath);
    assert.strictEqual(title, "Some title with spaces");
  });

  test("ignores lines that are not list items", () => {
    const filePath = writeTempFragment(
      tmpDir,
      "101-CHANGES.md",
      `# Changelog

## [Unreleased]

### 🚀 Added
- Add feature
Some random text that should be ignored

### 🐛 Fixed
- Fix bug
`
    );

    const { sections } = parseFragment(filePath);
    assert.deepStrictEqual(sections.get("### 🚀 Added"), ["- Add feature"]);
    assert.deepStrictEqual(sections.get("### 🐛 Fixed"), ["- Fix bug"]);
  });
});

describe("mergeFragments", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test("merges matching sections from multiple fragments", () => {
    const f1 = writeTempFragment(
      tmpDir,
      "100-CHANGES.md",
      `# Changelog

## [Unreleased]

### 🚀 Added
- Feature from PR 100

### 🐛 Fixed
- Fix from PR 100
`
    );

    const f2 = writeTempFragment(
      tmpDir,
      "101-CHANGES.md",
      `# Changelog

## [Unreleased]

### 🚀 Added
- Feature from PR 101

### 🔧 Miscellaneous
- Chore from PR 101
`
    );

    const merged = mergeFragments([f1, f2]);

    assert.deepStrictEqual(merged.get("### 🚀 Added"), [
      "- Feature from PR 100",
      "- Feature from PR 101",
    ]);
    assert.deepStrictEqual(merged.get("### 🐛 Fixed"), ["- Fix from PR 100"]);
    assert.deepStrictEqual(merged.get("### 🔧 Miscellaneous"), [
      "- Chore from PR 101",
    ]);
  });

  test("preserves section ordering from first appearance", () => {
    const f1 = writeTempFragment(
      tmpDir,
      "100-CHANGES.md",
      `# Changelog

## [Unreleased]

### 🐛 Fixed
- Fix first

### 🚀 Added
- Feature second
`
    );

    const f2 = writeTempFragment(
      tmpDir,
      "101-CHANGES.md",
      `# Changelog

## [Unreleased]

### 🚀 Added
- Another feature
`
    );

    const merged = mergeFragments([f1, f2]);
    const keys = [...merged.keys()];

    assert.deepStrictEqual(keys, ["### 🐛 Fixed", "### 🚀 Added"]);
    assert.deepStrictEqual(merged.get("### 🚀 Added"), [
      "- Feature second",
      "- Another feature",
    ]);
  });
});

describe("formatOutput", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test("single fragment produces flat categories (no sub-groups)", () => {
    const f1 = writeTempFragment(
      tmpDir,
      "100-CHANGES.md",
      `# Changelog

## [Unreleased]

### 🚀 Added
- Feature A
- Feature B

### 🐛 Fixed
- Fix X
`
    );

    const output = formatOutput([f1]);

    assert.strictEqual(
      output,
      `# Changelog

## [Unreleased]

### 🚀 Added
- Feature A
- Feature B

### 🐛 Fixed
- Fix X

`
    );
  });

  test("single fragment skips empty sections", () => {
    const f1 = writeTempFragment(
      tmpDir,
      "100-CHANGES.md",
      `# Changelog

## [Unreleased]

### 🚀 Added
- Feature A
`
    );

    const output = formatOutput([f1]);

    assert.ok(output.includes("### 🚀 Added"));
    assert.ok(!output.includes("### 🐛 Fixed"));
  });

  test("single fragment ignores title (no sub-groups needed)", () => {
    const f1 = writeTempFragment(
      tmpDir,
      "100-CHANGES.md",
      `# Changelog

## [Unreleased]
<!-- title: Some PR title -->

### 🚀 Added
- Feature A
`
    );

    const output = formatOutput([f1]);

    assert.ok(!output.includes("Some PR title"));
    assert.ok(output.includes("### 🚀 Added"));
  });

  test("multiple fragments use title for sub-group headers", () => {
    const f1 = writeTempFragment(
      tmpDir,
      "200-CHANGES.md",
      `# Changelog

## [Unreleased]
<!-- title: Update Datadog agents -->

### ✨ Changed
- Update Datadog agents to run as sidecars
`
    );

    const f2 = writeTempFragment(
      tmpDir,
      "201-CHANGES.md",
      `# Changelog

## [Unreleased]
<!-- title: Revert Datadog changes -->

### ✨ Changed
- Revert "Update Datadog agents to run as sidecars"
`
    );

    const output = formatOutput([f1, f2]);

    assert.strictEqual(
      output,
      `# Changelog

## [Unreleased]

### Update Datadog agents

#### ✨ Changed
- Update Datadog agents to run as sidecars

### Revert Datadog changes

#### ✨ Changed
- Revert "Update Datadog agents to run as sidecars"

`
    );
  });

  test("multiple fragments fall back to PR # when no title", () => {
    const f1 = writeTempFragment(
      tmpDir,
      "100-CHANGES.md",
      `# Changelog

## [Unreleased]

### 🚀 Added
- Feature from PR 100
`
    );

    const f2 = writeTempFragment(
      tmpDir,
      "101-CHANGES.md",
      `# Changelog

## [Unreleased]

### 🚀 Added
- Feature from PR 101
`
    );

    const output = formatOutput([f1, f2]);

    assert.ok(output.includes("### PR #100"));
    assert.ok(output.includes("### PR #101"));
  });

  test("multiple fragments mix titled and untitled", () => {
    const f1 = writeTempFragment(
      tmpDir,
      "100-CHANGES.md",
      `# Changelog

## [Unreleased]
<!-- title: Add user authentication -->

### 🚀 Added
- Add login page
`
    );

    const f2 = writeTempFragment(
      tmpDir,
      "101-CHANGES.md",
      `# Changelog

## [Unreleased]

### 🐛 Fixed
- Fix typo
`
    );

    const output = formatOutput([f1, f2]);

    assert.ok(output.includes("### Add user authentication"));
    assert.ok(output.includes("### PR #101"));
  });

  test("multiple fragments skip fragments with no items", () => {
    const f1 = writeTempFragment(
      tmpDir,
      "100-CHANGES.md",
      `# Changelog

## [Unreleased]

### 🚀 Added
- Feature from PR 100
`
    );

    const f2 = writeTempFragment(
      tmpDir,
      "101-CHANGES.md",
      `# Changelog

## [Unreleased]
`
    );

    const output = formatOutput([f1, f2]);

    assert.ok(output.includes("### PR #100"));
    assert.ok(!output.includes("### PR #101"));
  });

  test("multiple fragments use #### for categories under ### sub-groups", () => {
    const f1 = writeTempFragment(
      tmpDir,
      "200-CHANGES.md",
      `# Changelog

## [Unreleased]

### ✨ Changed
- Update Datadog agents to run as sidecars
`
    );

    const f2 = writeTempFragment(
      tmpDir,
      "201-CHANGES.md",
      `# Changelog

## [Unreleased]

### ✨ Changed
- Revert "Update Datadog agents to run as sidecars"
`
    );

    const output = formatOutput([f1, f2]);

    assert.ok(output.includes("#### ✨ Changed"));
    assert.ok(!/^### ✨ Changed/m.test(output));
  });
});

describe("findFragments", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  test("finds and sorts fragment files", () => {
    writeTempFragment(tmpDir, "200-CHANGES.md", "");
    writeTempFragment(tmpDir, "100-CHANGES.md", "");
    writeTempFragment(tmpDir, ".keep", "");
    writeTempFragment(tmpDir, "README.md", "");

    const fragments = findFragments(tmpDir);

    assert.deepStrictEqual(fragments, [
      path.join(tmpDir, "100-CHANGES.md"),
      path.join(tmpDir, "200-CHANGES.md"),
    ]);
  });

  test("returns empty array for non-existent directory", () => {
    assert.deepStrictEqual(findFragments("/nonexistent"), []);
  });
});
