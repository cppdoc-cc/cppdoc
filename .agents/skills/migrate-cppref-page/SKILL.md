---
name: migrate-cppref-page
description: Migrate a requested cppreference page into this cppdoc repository. Use when the user asks to port a specific cppreference slug or URL such as `cpp/memory` into `src/content/docs`, preserving technical meaning while rewriting the page into CppDoc MDX with existing components, revision metadata, and internal links.
---

# Migrate Cppref Page

Migrate one cppreference page into the local `cppdoc` checkout.

Resolve the destination from `migrate/slug_map.json`, study nearby migrated pages, then write or update the corresponding MDX page under `src/content/docs`.

## Workflow

1. Parse the requested cppreference page slug or URL.
2. Read [`references/workflow.md`](./references/workflow.md).
3. Find the destination slug in `migrate/slug_map.json`.
4. Stop and ask the user if the slug map entry is missing or `null`.
5. Fetch or read the cppreference source page, then inspect existing cppdoc pages in the same area before writing anything.
6. Create or update the target MDX page with repo-native structure and components.
7. Run `npm run format` after editing files.

## Working Rules

- Treat this as a repo migration task, not a literal HTML-to-MDX transcription task.
- Preserve technical meaning, declarations, examples, headings, notes, and revision distinctions from cppreference.
- Prefer the layout and phrasing patterns already used by neighboring cppdoc pages over mechanically copying cppreference markup.
- Use existing CppDoc components instead of raw HTML whenever a matching component exists.
- If no matching component exists, think whether a new component is valuable and ask the user whether to create it.
- Keep imports minimal and consistent with current files in the destination area.
- Keep each prose paragraph on a single source line when practical.
- Use double quotes and explicit semicolons in any TypeScript or JavaScript edits.
- Leave `_meta.yml` alone unless a missing section label makes the new page unreachable or inconsistent.

## Destination And Source

- Resolve the CppDoc slug from `migrate/slug_map.json`. If you cannot find the corresponding CppDoc slug in this JSON file, stop and ask the user to update the slug map before proceeding.
- Write the page to `src/content/docs/<cppdoc-slug>.mdx`.
- If the user gives a slug like `cpp/memory`, infer the source URL as `https://en.cppreference.com/w/cpp/memory.html`.
- If web access is unavailable, ask the user for the source page contents or a local artifact instead of guessing.

## Page Construction

- Start from a clean frontmatter block with `title`.
- Add `cppdoc.revision` when the whole page is bounded by a language revision range.
- Reuse established components such as `DocLink`, `DeclDoc`, `Decl`, `DescList`, `Desc`, `ParamDocList`, `ParamDoc`, `Revision`, `RevisionBlock`, `CHeader`, `CppHeader`, `Missing`, and `Incomplete` where appropriate.
- Prefer `DocLink` for internal cross references and convert cppreference links to absolute cppdoc destinations.
- Avoid native HTML tables and other raw layout tags unless no existing component or simple Markdown structure can express the content.
- Mark intentionally unmigrated targets with `Missing` rather than inventing destinations.
- Keep examples, return values, notes, and see-also sections when they materially help readers.

## Validation

- Check that the destination file path matches the slug map entry.
- Check imports for unused or missing components.
- Check revision annotations at both page level and block level.
- Check that internal links point to plausible cppdoc paths.
- Run `npm run format`.
- Report any unresolved mapping gaps, missing components, or source ambiguities in the final response.
