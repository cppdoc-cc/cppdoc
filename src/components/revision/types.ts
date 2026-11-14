import type { CxxRevision } from "@src/types";

export interface RevisionTrait {
  trait: string;
  since: CxxRevision;
}

export interface RevisionInfo {
  since?: CxxRevision;
  traits?: RevisionTrait[];
  until?: CxxRevision;
  removed?: CxxRevision;
}
