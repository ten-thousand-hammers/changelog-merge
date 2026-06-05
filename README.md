# changelog-merge

Merges per-PR changelog fragments (`changelog/{PR}-CHANGES.md`) into a single
combined changelog file, grouping entries under matching category headers.

Part of the changelog actions suite:
`changelog-generate` → **`changelog-merge`** → `changelog-release` → `changelog-notify`.

## Usage

```yaml
- uses: ten-thousand-hammers/changelog-merge@v1
  id: merge
  with:
    fragments-dir: changelog
    output-file: CHANGES_COMBINED.md

- if: steps.merge.outputs.has-fragments == 'false'
  run: echo "No fragments found — fall back to git-cliff"
```

## Inputs

| Name | Default | Description |
| --- | --- | --- |
| `fragments-dir` | `changelog` | Directory containing `*-CHANGES.md` fragment files. |
| `output-file` | `CHANGES_COMBINED.md` | Path to write the combined changelog. |

## Outputs

| Name | Description |
| --- | --- |
| `has-fragments` | `'true'` if any fragments were found and merged, else `'false'`. When `'false'`, no output file is written — the caller should fall back to generating a changelog from commits (e.g. git-cliff). |

## How fragments are merged

- **One fragment** → its category sections are emitted flat under `## [Unreleased]`.
- **Multiple fragments** → each is grouped under a `### {PR title}` sub-heading
  (falling back to `### PR #{number}`), with categories nested as `#### {category}`.
  The PR title is read from a `<!-- title: ... -->` comment that
  [`changelog-generate`](https://github.com/ten-thousand-hammers/changelog-generate)
  injects into each fragment.

## Development

Zero runtime dependencies (Node `fs`/`path` only). Tests use the Node built-in
test runner — no `npm install` required:

```sh
node --test
```
