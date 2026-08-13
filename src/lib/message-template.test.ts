import { describe, expect, it } from "vitest"
import { calculateSmsSegments } from "./sms-segments"
import { extractTemplateVariables, renderMessageTemplate, validateMessageTemplate } from "./message-template"

describe("message template variables", () => {
  it("extracts unique normalized variables", () => {
    expect(extractTemplateVariables("Merhaba {{ ad }} {{AD}} {{firma}}")).toEqual(["ad", "firma"])
  })

  it("renders supported contact variables", () => {
    expect(renderMessageTemplate("Merhaba {{ad}} {{soyad}}, {{firma}}", {
      ad: "Ayşe",
      soyad: "Demir",
      firma: "MSGNEX",
    })).toBe("Merhaba Ayşe Demir, MSGNEX")
  })

  it("renders missing variables as empty text", () => {
    expect(renderMessageTemplate("Merhaba {{ad}} {{soyad}}", { ad: "Ali" })).toBe("Merhaba Ali ")
  })

  it("reports unsupported variables", () => {
    expect(validateMessageTemplate("Merhaba {{ad}}, kodunuz {{kupon}}")).toEqual({
      variables: ["ad", "kupon"],
      unsupportedVariables: ["kupon"],
    })
  })

  it("lets segment calculation run against the rendered message", () => {
    const rendered = renderMessageTemplate("Merhaba {{ad}}, doğum gününüz kutlu olsun", { ad: "Çağla" })
    const result = calculateSmsSegments(rendered)

    expect(rendered).toContain("Çağla")
    expect(result.encoding).toBe("Unicode")
    expect(result.segments).toBe(1)
  })
})
