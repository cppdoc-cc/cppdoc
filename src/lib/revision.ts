import type {
  Language,
  CRevision,
  CppRevision,
  CxxRevision,
  RevisionRange,
} from "../types";

const C_REVISIONS: CRevision[] = [
  "C89",
  "C95",
  "C99",
  "C11",
  "C17",
  "C23",
  "C29",
];

const CPP_REVISIONS: CppRevision[] = [
  "C++98",
  "C++11",
  "C++14",
  "C++17",
  "C++20",
  "C++23",
  "C++26",
  "C++29",
];

const ALL_REVISIONS: CxxRevision[] = [...C_REVISIONS, ...CPP_REVISIONS];

export function getLanguageFromRevision(rev: CxxRevision): Language {
  if (rev.startsWith("C++")) {
    return "C++";
  }
  return "C";
}

export function getRevisions(
  lang: Language,
  range?: RevisionRange
): CxxRevision[] {
  const revisions: CxxRevision[] = lang === "C++" ? CPP_REVISIONS : C_REVISIONS;

  const sinceIndex = range?.since ? revisions.indexOf(range.since) : 0;
  const untilIndex = range?.until
    ? revisions.indexOf(range.until)
    : revisions.length;

  return revisions.slice(sinceIndex, untilIndex);
}

export function compareRevisions(
  lhs: CxxRevision,
  rhs: CxxRevision
): number | undefined {
  const lhsLang = getLanguageFromRevision(lhs);
  const rhsLang = getLanguageFromRevision(rhs);
  if (lhsLang !== rhsLang) {
    return undefined;
  }

  const lhsCode = ALL_REVISIONS.indexOf(lhs);
  const rhsCode = ALL_REVISIONS.indexOf(rhs);
  return lhsCode - rhsCode;
}

export function isRevisionInRange(
  rev: CxxRevision,
  range: RevisionRange
): boolean | undefined {
  const lang = getLanguageFromRevision(rev);
  if (range.since && lang !== getLanguageFromRevision(range.since)) {
    return undefined;
  }
  if (range.until && lang !== getLanguageFromRevision(range.until)) {
    return undefined;
  }

  const revCode = ALL_REVISIONS.indexOf(rev);
  if (range.since && revCode < ALL_REVISIONS.indexOf(range.since)) {
    return false;
  }
  if (range.until && revCode >= ALL_REVISIONS.indexOf(range.until)) {
    return false;
  }

  return true;
}
