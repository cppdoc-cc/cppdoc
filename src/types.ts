export type Language = "C" | "C++";

export type CppRevision =
  | "C++98"
  | "C++11"
  | "C++14"
  | "C++17"
  | "C++20"
  | "C++23"
  | "C++26"
  | "C++29";
export type CRevision = "C89" | "C95" | "C99" | "C11" | "C17" | "C23" | "C29";
export type CxxRevision = CppRevision | CRevision;

export interface RevisionRange {
  since?: CxxRevision;
  until?: CxxRevision;
}

export type DRKind = "cwg" | "lwg";
