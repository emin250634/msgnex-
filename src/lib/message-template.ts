export type MessageTemplateVariables = Record<string, string | null | undefined>

export interface MessageTemplateValidation {
  variables: string[]
  unsupportedVariables: string[]
}

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export const SUPPORTED_MESSAGE_VARIABLES = [
  "ad",
  "soyad",
  "firma",
  "telefon",
  "dogum_gunu",
] as const

const SUPPORTED_VARIABLE_SET = new Set<string>(SUPPORTED_MESSAGE_VARIABLES)

export function extractTemplateVariables(template: string) {
  const variables = new Set<string>()

  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    variables.add(match[1].toLowerCase())
  }

  return Array.from(variables)
}

export function validateMessageTemplate(template: string): MessageTemplateValidation {
  const variables = extractTemplateVariables(template)

  return {
    variables,
    unsupportedVariables: variables.filter((variable) => !SUPPORTED_VARIABLE_SET.has(variable as typeof SUPPORTED_MESSAGE_VARIABLES[number])),
  }
}

export function renderMessageTemplate(template: string, variables: MessageTemplateVariables) {
  return template.replace(VARIABLE_PATTERN, (_match, key: string) => {
    const normalizedKey = key.toLowerCase()
    const value = variables[normalizedKey]
    return value === null || value === undefined ? "" : String(value)
  })
}
