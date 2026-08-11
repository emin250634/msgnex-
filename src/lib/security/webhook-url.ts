import "server-only"

import { lookup } from "dns/promises"
import { isIP } from "net"

export const WEBHOOK_URL_BLOCKED = "WEBHOOK_URL_BLOCKED"
export const MAX_WEBHOOK_REDIRECTS = 3
export const MAX_WEBHOOK_RESPONSE_BODY_BYTES = 16 * 1024

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal"]
const ALLOWED_EXPLICIT_HTTPS_PORTS = new Set(["443", "8443"])
const BLOCKED_EXPLICIT_PORTS = new Set([
  "22",
  "23",
  "25",
  "110",
  "143",
  "3306",
  "5432",
  "6379",
  "9200",
  "9300",
  "11211",
  "2375",
  "2376",
  "27017",
])

export class WebhookUrlBlockedError extends Error {
  readonly code = WEBHOOK_URL_BLOCKED

  constructor(message = "Webhook URL blocked by SSRF protection") {
    super(message)
    this.name = "WebhookUrlBlockedError"
  }
}

export interface WebhookUrlResolver {
  lookup(hostname: string): Promise<string[]>
}

export const nodeWebhookUrlResolver: WebhookUrlResolver = {
  async lookup(hostname: string) {
    const records = await lookup(hostname, { all: true, verbatim: true })
    return records.map((record) => record.address)
  },
}

export async function validateWebhookUrlForDelivery(
  value: string,
  resolver: WebhookUrlResolver = nodeWebhookUrlResolver
): Promise<URL> {
  const url = parseWebhookUrl(value)
  const hostname = normalizeHostname(url.hostname)
  validateHostname(hostname)

  const literalIp = parseIpLiteral(hostname)
  if (literalIp) {
    assertPublicIp(literalIp)
    return url
  }

  let addresses: string[]
  try {
    addresses = await resolver.lookup(hostname)
  } catch {
    throw new WebhookUrlBlockedError("Webhook URL DNS resolution failed")
  }

  if (addresses.length === 0) {
    throw new WebhookUrlBlockedError("Webhook URL DNS resolution returned no records")
  }

  for (const address of addresses) {
    assertPublicIp(address)
  }

  return url
}

export function parseWebhookUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new WebhookUrlBlockedError("Webhook URL is invalid")
  }

  if (url.protocol !== "https:") {
    throw new WebhookUrlBlockedError("Webhook URL must use https")
  }

  if (url.username || url.password) {
    throw new WebhookUrlBlockedError("Webhook URL must not include credentials")
  }

  if (!url.hostname) {
    throw new WebhookUrlBlockedError("Webhook URL must include a hostname")
  }

  validatePort(url)

  return url
}

export function validateRedirectTarget(location: string, baseUrl: URL): URL {
  let nextUrl: URL
  try {
    nextUrl = new URL(location, baseUrl)
  } catch {
    throw new WebhookUrlBlockedError("Webhook redirect URL is invalid")
  }

  return parseWebhookUrl(nextUrl.toString())
}

function validatePort(url: URL) {
  if (!url.port) return

  const port = Number(url.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new WebhookUrlBlockedError("Webhook URL port is invalid")
  }

  if (ALLOWED_EXPLICIT_HTTPS_PORTS.has(url.port)) return
  if (port < 1024 || BLOCKED_EXPLICIT_PORTS.has(url.port)) {
    throw new WebhookUrlBlockedError("Webhook URL port is not allowed")
  }
}

function normalizeHostname(hostname: string) {
  return hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase().replace(/\.$/, "")
}

function validateHostname(hostname: string) {
  if (!hostname) {
    throw new WebhookUrlBlockedError("Webhook URL must include a hostname")
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new WebhookUrlBlockedError("Webhook URL hostname is not allowed")
  }

  if (BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new WebhookUrlBlockedError("Webhook URL hostname is not allowed")
  }

  if (hostname.includes("_")) {
    throw new WebhookUrlBlockedError("Webhook URL hostname is invalid")
  }
}

function parseIpLiteral(hostname: string): string | null {
  const ipv4Mapped = parseIpv4MappedIpv6(hostname)
  if (ipv4Mapped) return ipv4Mapped
  return isIP(hostname) ? hostname : null
}

function assertPublicIp(address: string) {
  const ipv4Mapped = parseIpv4MappedIpv6(address)
  if (ipv4Mapped) {
    assertPublicIpv4(ipv4Mapped)
    return
  }

  const version = isIP(address)
  if (version === 4) {
    assertPublicIpv4(address)
    return
  }
  if (version === 6) {
    assertPublicIpv6(address)
    return
  }

  throw new WebhookUrlBlockedError("Webhook URL resolved to an invalid IP")
}

function assertPublicIpv4(address: string) {
  const value = ipv4ToNumber(address)
  const blockedRanges: Array<[number, number]> = [
    [0x00000000, 0xff000000],
    [0x0a000000, 0xff000000],
    [0x64400000, 0xffc00000],
    [0x7f000000, 0xff000000],
    [0xa9fe0000, 0xffff0000],
    [0xac100000, 0xfff00000],
    [0xc0000000, 0xffffff00],
    [0xc0000200, 0xffffff00],
    [0xc0a80000, 0xffff0000],
    [0xc6120000, 0xfffe0000],
    [0xc6336400, 0xffffff00],
    [0xcb007100, 0xffffff00],
    [0xe0000000, 0xf0000000],
    [0xf0000000, 0xf0000000],
  ]

  if (blockedRanges.some(([range, mask]) => ((value & mask) >>> 0) === range)) {
    throw new WebhookUrlBlockedError("Webhook URL resolved to a non-public IPv4 address")
  }
}

function assertPublicIpv6(address: string) {
  const bytes = ipv6ToBytes(address)
  const first = bytes[0]
  const second = bytes[1]

  if (bytes.every((byte) => byte === 0)) {
    throw new WebhookUrlBlockedError("Webhook URL resolved to an unspecified IPv6 address")
  }

  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) {
    throw new WebhookUrlBlockedError("Webhook URL resolved to a loopback IPv6 address")
  }

  if ((first & 0xfe) === 0xfc) {
    throw new WebhookUrlBlockedError("Webhook URL resolved to a private IPv6 address")
  }

  if (first === 0xfe && (second & 0xc0) === 0x80) {
    throw new WebhookUrlBlockedError("Webhook URL resolved to a link-local IPv6 address")
  }

  if (first === 0xff) {
    throw new WebhookUrlBlockedError("Webhook URL resolved to a multicast IPv6 address")
  }
}

function ipv4ToNumber(address: string) {
  const parts = address.split(".")
  if (parts.length !== 4) {
    throw new WebhookUrlBlockedError("Webhook URL resolved to an invalid IPv4 address")
  }

  return parts.reduce((value, part) => {
    if (!/^\d+$/.test(part)) {
      throw new WebhookUrlBlockedError("Webhook URL resolved to an invalid IPv4 address")
    }
    const octet = Number(part)
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      throw new WebhookUrlBlockedError("Webhook URL resolved to an invalid IPv4 address")
    }
    return ((value << 8) | octet) >>> 0
  }, 0)
}

function parseIpv4MappedIpv6(address: string): string | null {
  const normalized = address.toLowerCase()
  const match = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (match) return match[1]

  const hexMatch = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (!hexMatch) return null

  const high = Number.parseInt(hexMatch[1], 16)
  const low = Number.parseInt(hexMatch[2], 16)
  return `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`
}

function ipv6ToBytes(address: string) {
  const mapped = parseIpv4MappedIpv6(address)
  if (mapped) {
    assertPublicIpv4(mapped)
    return new Uint8Array(16)
  }

  const [headRaw, tailRaw] = address.toLowerCase().split("::")
  if (address.includes(":::") || address.split("::").length > 2) {
    throw new WebhookUrlBlockedError("Webhook URL resolved to an invalid IPv6 address")
  }

  const head = headRaw ? headRaw.split(":") : []
  const tail = tailRaw ? tailRaw.split(":") : []
  const groups = [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail]

  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    throw new WebhookUrlBlockedError("Webhook URL resolved to an invalid IPv6 address")
  }

  const bytes = new Uint8Array(16)
  groups.forEach((group, index) => {
    const value = Number.parseInt(group, 16)
    bytes[index * 2] = (value >> 8) & 255
    bytes[index * 2 + 1] = value & 255
  })
  return bytes
}
