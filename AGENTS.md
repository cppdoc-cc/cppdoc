# AGENTS.md

You are building a static website that documents C/C++ language features and standard library facilities for C/C++ developers.

## Project Structure

- The `src/content/docs` subdirectory is where the documentation pages should go.
  - Documentations for C language features go into `src/content/docs/c/language`.
  - Documentations for C standard library facilities go into `src/content/docs/c/library`.
  - Documentations for C++ language feature go into `src/content/docs/cpp/language`.
  - Documentations for C++ standard library facilities go into `src/content/docs/cpp/library`.
- The `src/components` contains reusable UI components for the documentation pages.

## Development Guidelines

- Each paragraph should generally be a single line of source code.
- Avoid writing source code that does not contribute to actual content as much as possible, extract layout code into reusable components when possible.
- Avoid inline Markdown tables with more than 3 columns.
- When designing content layout, consider layout on mobile devices as a first-class usage.

## Code Style

- Use double quotes in MDX, JavaScript, TypeScript code.
- Always prefer TypeScript over JavaScript when possible.
- Use explicit semicolons in JavaScript and TypeScript code.

## Development Tools

- Run `npm run format` to format the code once you made any changes.
