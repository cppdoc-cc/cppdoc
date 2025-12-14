import Behavior from "@components/Behavior.astro";
import { Decl, DeclDoc } from "@components/decl-doc";
import { DescList, Desc } from "@components/desc-list";
import NamedReq from "@components/NamedReq.astro";
import { ParamDocList, ParamDoc } from "@components/param-doc";
import DocLink from "@components/DocLink.astro";
import { CHeader, CppHeader } from "@components/header";
import {
  FeatureTestMacro,
  FeatureTestMacroValue,
} from "@components/feature-test-macro";
import { DR, DRList } from "@components/defect-report";
import { Revision, RevisionBlock } from "@components/revision";
import AutoCollapse from "@components/AutoCollapse.astro";
import FlexTable from "@components/FlexTable.astro";
import WG21PaperLink from "@components/WG21PaperLink.astro";

export {
  Behavior,
  Decl,
  DeclDoc,
  DescList,
  Desc,
  NamedReq,
  ParamDocList,
  ParamDoc,
  DocLink,
  CHeader,
  CppHeader,
  FeatureTestMacro,
  FeatureTestMacroValue,
  DR,
  DRList,
  Revision,
  RevisionBlock,
  AutoCollapse,
  FlexTable,
  WG21PaperLink,
};
