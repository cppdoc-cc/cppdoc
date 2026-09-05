import { atom, type WritableAtom } from "nanostores";
import type { CxxRevision } from "@src/types";

export const selectedRevision: WritableAtom<CxxRevision | null> = atom(null);
