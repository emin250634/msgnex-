const GSM_BASIC =
  "@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e !\"#\u00a4%&'()*+,-./0123456789:;<=>?\u00a1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00c4\u00d6\u00d1\u00dc\u00a7\u00bfabcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0"
const GSM_EXTENDED = "^{}\\[~]|\u20ac"

export const MAX_SMS_LENGTH = 612

export interface SmsSegmentInfo {
  encoding: "GSM-7" | "Unicode"
  units: number
  segments: number
  singleSegmentLimit: number
  multipartSegmentLimit: number
}

export function calculateSmsSegments(message: string): SmsSegmentInfo {
  if (!message) {
    return {
      encoding: "GSM-7",
      units: 0,
      segments: 0,
      singleSegmentLimit: 160,
      multipartSegmentLimit: 153,
    }
  }

  let gsmUnits = 0
  let isGsm7 = true

  for (const character of message) {
    if (GSM_BASIC.includes(character)) {
      gsmUnits += 1
    } else if (GSM_EXTENDED.includes(character)) {
      gsmUnits += 2
    } else {
      isGsm7 = false
      break
    }
  }

  if (isGsm7) {
    return {
      encoding: "GSM-7",
      units: gsmUnits,
      segments: gsmUnits <= 160 ? 1 : Math.ceil(gsmUnits / 153),
      singleSegmentLimit: 160,
      multipartSegmentLimit: 153,
    }
  }

  const unicodeUnits = Array.from(message).length
  return {
    encoding: "Unicode",
    units: unicodeUnits,
    segments: unicodeUnits <= 70 ? 1 : Math.ceil(unicodeUnits / 67),
    singleSegmentLimit: 70,
    multipartSegmentLimit: 67,
  }
}
