import type { CxxRevision } from "@src/types";

interface HTMLAutoRevisionAttributes {
  "data-autorev-since"?: CxxRevision;
  "data-autorev-until"?: CxxRevision;
}

export interface AutorevProps {
  autorevSince?: CxxRevision;
  autorevUntil?: CxxRevision;
}

export function autoRev(props: AutorevProps): HTMLAutoRevisionAttributes {
  return {
    "data-autorev-since": props.autorevSince,
    "data-autorev-until": props.autorevUntil,
  };
}
