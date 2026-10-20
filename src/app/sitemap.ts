import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/brief/today", "/archive", "/ask", "/docs"].map((p) => ({ url: `${SITE.url}${p}`, changeFrequency: "daily" }));
}
