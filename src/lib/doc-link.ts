import { getEntry } from "astro:content";

function getIdFromLink(link: string): string {
  if (link.startsWith("/")) {
    link = link.slice(1);
  }
  if (link.endsWith("/")) {
    link = link.slice(0, -1);
  }
  return link;
}

export function normalizeLink(link: string): string {
  if (!link.startsWith("/")) {
    link = "/" + link;
  }
  if (!link.endsWith("/")) {
    link = link + "/";
  }
  return link;
}

export async function isLinkMissing(link: string): Promise<boolean> {
  const id = getIdFromLink(link);
  const entry = await getEntry("docs", id);
  return entry === undefined;
}
