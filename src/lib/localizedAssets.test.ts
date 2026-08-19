import { statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LOCALES = ["en", "ja"] as const;

describe("localized image assets", () => {
  it("includes two social cards and six screenshot masters with responsive derivatives", () => {
    for (const locale of LOCALES) {
      const files = [
        `public/og-image-${locale}.jpg`,
        `public/shots/app-full-${locale}.webp`,
        `public/shots/app-full-sm-${locale}.webp`,
        `public/shots/app-full-${locale}.jpg`,
        `public/shots/mode-grade-${locale}.webp`,
        `public/shots/mode-grade-sm-${locale}.webp`,
        `public/shots/mode-grade-${locale}.jpg`,
        `public/shots/mode-commute-${locale}.webp`,
        `public/shots/mode-commute-sm-${locale}.webp`,
        `public/shots/mode-commute-${locale}.jpg`,
      ];
      for (const file of files) {
        expect(statSync(file).size, file).toBeGreaterThan(10_000);
      }
    }
  });
});
