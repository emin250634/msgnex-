import { describe, expect, it } from "vitest"
import {
  validateRedirectTarget,
  validateWebhookUrlForDelivery,
  WEBHOOK_URL_BLOCKED,
  WebhookUrlBlockedError,
  type WebhookUrlResolver,
} from "./webhook-url"

function resolver(addresses: string[]): WebhookUrlResolver {
  return {
    async lookup() {
      return addresses
    },
  }
}

async function expectBlocked(value: string, addresses = ["93.184.216.34"]) {
  await expect(validateWebhookUrlForDelivery(value, resolver(addresses))).rejects.toMatchObject({
    code: WEBHOOK_URL_BLOCKED,
  })
}

describe("webhook URL SSRF validator", () => {
  it("allows a public HTTPS hostname with public DNS results", async () => {
    const url = await validateWebhookUrlForDelivery("https://example.com/webhook", resolver(["93.184.216.34"]))

    expect(url.toString()).toBe("https://example.com/webhook")
  })

  it("blocks non-HTTPS protocols and userinfo", async () => {
    await expectBlocked("http://example.com/webhook")
    await expectBlocked("file:///etc/passwd")
    await expectBlocked("ftp://example.com/webhook")
    await expectBlocked("https://user:pass@example.com/webhook")
  })

  it("blocks localhost hostnames and local suffixes", async () => {
    await expectBlocked("https://localhost/webhook")
    await expectBlocked("https://localhost./webhook")
    await expectBlocked("https://api.local/webhook")
    await expectBlocked("https://service.internal/webhook")
  })

  it("blocks unsafe IPv4 literals", async () => {
    await expectBlocked("https://127.0.0.1/webhook")
    await expectBlocked("https://10.1.2.3/webhook")
    await expectBlocked("https://172.16.0.5/webhook")
    await expectBlocked("https://192.168.1.10/webhook")
    await expectBlocked("https://169.254.169.254/latest/meta-data")
    await expectBlocked("https://100.64.1.1/webhook")
    await expectBlocked("https://0.1.2.3/webhook")
    await expectBlocked("https://192.0.0.10/webhook")
    await expectBlocked("https://192.0.2.10/webhook")
    await expectBlocked("https://198.18.0.1/webhook")
    await expectBlocked("https://198.51.100.10/webhook")
    await expectBlocked("https://203.0.113.10/webhook")
    await expectBlocked("https://224.0.0.1/webhook")
    await expectBlocked("https://240.0.0.1/webhook")
  })

  it("blocks unsafe IPv6 literals", async () => {
    await expectBlocked("https://[::]/webhook")
    await expectBlocked("https://[::1]/webhook")
    await expectBlocked("https://[fc00::1]/webhook")
    await expectBlocked("https://[fe80::1]/webhook")
    await expectBlocked("https://[ff00::1]/webhook")
  })

  it("blocks IPv4-mapped IPv6 private and loopback addresses", async () => {
    await expectBlocked("https://[::ffff:127.0.0.1]/webhook")
    await expectBlocked("https://[::ffff:10.0.0.1]/webhook")
    await expectBlocked("https://[::ffff:c0a8:0001]/webhook")
  })

  it("blocks public hostnames when DNS resolves to private or mixed addresses", async () => {
    await expectBlocked("https://example.com/webhook", ["10.0.0.10"])
    await expectBlocked("https://example.com/webhook", ["93.184.216.34", "192.168.1.10"])
    await expectBlocked("https://example.com/webhook", ["93.184.216.34", "::1"])
    await expectBlocked("https://example.com/webhook", ["::ffff:192.168.1.10"])
  })

  it("fails closed when DNS resolution fails", async () => {
    await expect(
      validateWebhookUrlForDelivery("https://example.com/webhook", {
        async lookup() {
          throw new Error("DNS failure")
        },
      })
    ).rejects.toBeInstanceOf(WebhookUrlBlockedError)
  })

  it("validates redirect targets before they are followed", async () => {
    const baseUrl = new URL("https://example.com/webhook")
    const publicRedirect = validateRedirectTarget("/next", baseUrl)

    expect(publicRedirect.toString()).toBe("https://example.com/next")
    await expectBlocked(validateRedirectTarget("https://127.0.0.1/hit", baseUrl).toString())
  })

  it("allows standard HTTPS and 8443 while blocking unsafe explicit ports", async () => {
    await expect(validateWebhookUrlForDelivery("https://example.com:443/webhook", resolver(["93.184.216.34"]))).resolves.toBeInstanceOf(URL)
    await expect(validateWebhookUrlForDelivery("https://example.com:8443/webhook", resolver(["93.184.216.34"]))).resolves.toBeInstanceOf(URL)
    await expectBlocked("https://example.com:22/webhook")
    await expectBlocked("https://example.com:6379/webhook")
  })
})
