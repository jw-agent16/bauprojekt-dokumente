import { DOC_TYPES, type DocType } from "./types";

/**
 * Infer document type from filename / subject heuristics
 * (same rules as the frontend guessType helper).
 */
export function detectDocType(filename: string, subject = ""): DocType {
  const haystack = `${filename} ${subject}`.toLowerCase();

  if (
    haystack.includes("rechnung") ||
    haystack.includes("invoice") ||
    haystack.includes("faktura")
  ) {
    return "Rechnung";
  }

  if (
    haystack.includes("offerte") ||
    haystack.includes("angebot") ||
    haystack.includes("quote") ||
    haystack.includes("kostenvoranschlag")
  ) {
    return "Offerte";
  }

  if (
    haystack.includes("grundriss") ||
    haystack.includes("bauplan") ||
    haystack.includes("lageplan") ||
    haystack.includes("schnitt") ||
    /\bplan\b/.test(haystack) ||
    /\.(jpe?g|png|webp)$/i.test(filename)
  ) {
    return "Bauplan";
  }

  return "Sonstige";
}

export function isDocType(value: string): value is DocType {
  return (DOC_TYPES as readonly string[]).includes(value);
}
