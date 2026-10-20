import { XMLParser } from "fast-xml-parser";
import { getText, mapLimit } from "../http";
import type { FetchContext } from "./context";
import type { FeedConfig, NewsItem } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
});

type Node = Record<string, unknown> | string | undefined;

function text(n: unknown): string {
  if (n == null) return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return text(n[0]);
  if (typeof n === "object") return text((n as Record<string, unknown>)["#text"]);
  return "";
}

export function stripHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function atomLink(link: unknown): string {
  const links = Array.isArray(link) ? link : [link];
  for (const l of links) {
    if (typeof l === "string") return l;
    if (l && typeof l === "object") {
      const o = l as Record<string, string>;
      if (!o["@_rel"] || o["@_rel"] === "alternate") return o["@_href"] ?? "";
    }
  }
  return "";
}

const toIso = (s: string): string | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Parses RSS 2.0, RSS 1.0/RDF and Atom into normalized items. */
export function parseFeed(xml: string, feed: Pick<FeedConfig, "id" | "name">): NewsItem[] {
  const doc = parser.parse(xml) as Record<string, Node>;
  const rss = doc.rss as Record<string, Node> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const rdf = doc["rdf:RDF"] as Record<string, unknown> | undefined;
  const atom = doc.feed as Record<string, unknown> | undefined;

  const asArray = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []) as Record<string, unknown>[];

  let raw: Array<{ title: string; link: string; guid: string; summary: string; date: string }> = [];
  if (channel || rdf) {
    raw = asArray((channel ?? rdf)!.item).map((i) => ({
      title: text(i.title),
      link: text(i.link),
      guid: text(i.guid) || text(i.link),
      summary: text(i.description) || text(i["content:encoded"]),
      date: text(i.pubDate) || text(i["dc:date"]),
    }));
  } else if (atom) {
    raw = asArray(atom.entry).map((e) => ({
      title: text(e.title),
      link: atomLink(e.link),
      guid: text(e.id) || atomLink(e.link),
      summary: text(e.summary) || text(e.content),
      date: text(e.published) || text(e.updated),
    }));
  }

  return raw
    .filter((r) => r.title && /^https?:\/\//.test(r.link))
    .map((r) => ({
      guid: `${feed.id}:${r.guid}`.slice(0, 500),
      feedId: feed.id,
      sourceName: feed.name,
      title: stripHtml(r.title).slice(0, 300),
      link: r.link.trim(),
      summary: stripHtml(r.summary).slice(0, 400),
      publishedAt: toIso(r.date),
    }));
}

export function matchesKeywords(item: NewsItem, keywords?: string[]): boolean {
  if (!keywords || keywords.length === 0) return true;
  const hay = ` ${item.title} ${item.summary} `.toLowerCase();
  return keywords.some((k) => hay.includes(k.toLowerCase()));
}

/** News outlets move fast; official/project blogs post less often. */
export function maxAgeHoursFor(feed: Pick<FeedConfig, "category">): number {
  return feed.category === "news" ? 48 : 24 * 7;
}

/** Fetch all enabled feeds; each feed is logged as its own source. */
export async function fetchFeeds(feeds: FeedConfig[], ctx: FetchContext): Promise<NewsItem[]> {
  const results = await mapLimit(
    feeds.filter((f) => f.enabled),
    4,
    (feed) =>
      ctx.run(`rss:${feed.id}`, async (onAttempt) => {
        const xml = await getText(feed.url, { timeoutMs: 12_000, retries: 1, onAttempt, headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
        const cutoff = Date.now() - maxAgeHoursFor(feed) * 3_600_000;
        return parseFeed(xml, feed)
          .filter((i) => matchesKeywords(i, feed.keywords))
          .filter((i) => !i.publishedAt || Date.parse(i.publishedAt) >= cutoff)
          .slice(0, 15);
      }),
  );
  const seen = new Set<string>();
  return results
    .flatMap((r) => r ?? [])
    .filter((i) => {
      const key = i.link.replace(/[?#].*$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}
