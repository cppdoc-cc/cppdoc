# Workflow Reference

## Quick checklist

1. Resolve the requested cppreference slug or URL.
2. Look up the destination slug in `migrate/slug_map.json`.
3. Open the destination directory under `src/content/docs`.
4. Read 2-3 nearby migrated pages to copy local structure and tone.
5. Read the migration and component guides that matter for the page shape.
6. Fetch the cppreference source page.
7. Write the MDX page.
8. Format the repo with `npm run format`.

## Commands

Resolve a slug quickly:

```bash
node -e 'const m=require("./migrate/slug_map.json"); console.log(JSON.stringify(m.find(x => x.cppref === "cpp/memory"), null, 2));'
```

Inspect nearby migrated pages:

```bash
rg --files src/content/docs/cpp/library/memory
rg --files src/content/docs/cpp/library | rg "memory|utility|allocator"
```

Read the most relevant guidance first:

- `src/content/docs/development/migration/guideline.mdx`
- `src/content/docs/development/guide/doc-everything.mdx`
- `src/content/docs/development/guide/revision.mdx`
- `src/content/docs/development/guide/component-docs-for-llm.mdx`

## Path rules

- `c/...` source pages usually map into `src/content/docs/c/...`.
- `cpp/language/...` source pages map into `src/content/docs/cpp/language/...`.
- `cpp/...` library pages often map into `src/content/docs/cpp/library/...`.
- Trust `migrate/slug_map.json` over intuition whenever they differ.

## Writing rules

- Preserve semantics, not cppreference HTML structure.
- Follow existing cppdoc wording and section ordering in neighboring pages.
- Use `DocLink` for internal references.
- Prefer CppDoc components over raw HTML.
- Keep imports explicit and minimal.
- Keep paragraphs single-line where practical.

## Component hints

- Use `DeclDoc` and `Decl` for declarations and syntax forms.
- Use `ParamDocList` for parameter lists.
- Use `DescList` for grouped facilities, overload families, and see-also entries.
- Use `Revision` or `RevisionBlock` when only part of the page changes across standards.
- Use `CHeader` or `CppHeader` for header mentions.
- Use `Missing` for not-yet-migrated internal targets.

## Frontmatter hints

Minimum:

```mdx
---
title: Page Title
---
```

Add page-wide revision metadata only when the whole page is constrained:

```mdx
---
title: Page Title
cppdoc:
  revision:
    lang: C++
    since: C++11
    until: C++20
---
```

## Stop conditions

Stop and ask the user when:

- the slug map entry is missing or `null`
- the source page cannot be fetched and no local artifact is available
- the correct destination area is ambiguous
- a required component or pattern does not exist in the repo
