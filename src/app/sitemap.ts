import type { MetadataRoute } from "next"

const publicPaths = ["/", "/demo-request", "/register", "/privacy", "/kvkk", "/terms"]

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({
    url: `https://msgnex.com${path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }))
}
