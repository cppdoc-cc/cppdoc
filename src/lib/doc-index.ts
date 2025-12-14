import { getCollection } from "astro:content";

/**
 * Build an index mapping keys to their associated pages.
 *
 * @returns A map from keys to page slugs.
 */
async function buildKeyIndex(): Promise<Map<string, string>> {
  const docs = await getCollection("docs");
  const index = new Map<string, string>();

  for (const doc of docs) {
    const keys = doc.data.cppdoc?.keys;
    if (keys === undefined) continue;
    if (!Array.isArray(keys)) {
      console.warn("Frontmatter 'cppdoc.keys' should be an array");
      continue;
    }

    if (!keys.every((item) => typeof item === "string"))
      console.warn("Elements in frontmatter 'cppdoc.keys' should be strings");

    for (const key of keys) {
      if (typeof key !== "string") continue;

      if (index.has(key)) {
        console.warn(
          `Key "${key}" is already assigned to "${index.get(key)}", cannot reassign it to "${doc.id}"`
        );
        continue;
      }

      index.set(key, doc.id);
    }
  }

  return index;
}

let KEY_INDEX: Map<string, string> | undefined = undefined;

/**
 * Build and cache an index mapping keys to their associated pages. If the index
 * has already been built, return the cached one.
 *
 * @returns A map from keys to page slugs.
 */
async function getOrBuildKeyIndex(): Promise<Map<string, string>> {
  if (KEY_INDEX === undefined) KEY_INDEX = await buildKeyIndex();
  return KEY_INDEX;
}

/**
 * Get the link to the page associated with the given key.
 *
 * @returns The link to the page, or undefined if the key is not found.
 */
export async function getLinkToKey(key: string): Promise<string | undefined> {
  const index = await getOrBuildKeyIndex();
  if (key?.startsWith("/")) {
    if (
      index.values().some((slug) => `/${slug}/` === key || `/${slug}` === key)
    )
      return key;
    else return undefined;
  }
  const slug = index.get(key);
  if (!slug) return undefined;
  return `/${slug}/`;
}

/**
 * Get a list of all keys in the key index.
 *
 * @returns An array of all keys.
 */
export async function getKeys(): Promise<string[]> {
  const index = await getOrBuildKeyIndex();
  return Array.from(index.keys());
}
