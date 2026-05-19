import { describe, expect, it } from "vitest";
import { WEBAPP_URL } from "./constants";
import {
  isEmbedReferrerAllowed,
  normalizeEmbedAllowedDomain,
  normalizeEmbedAllowedDomains,
  parseEmbedAllowedDomainsInput,
} from "./embedAllowedDomains";

describe("embedAllowedDomains", () => {
  describe("normalizeEmbedAllowedDomain", () => {
    it("normalizes domains and strips paths", () => {
      expect(normalizeEmbedAllowedDomain("https://Cromie.org/schedule")).toBe("cromie.org");
      expect(normalizeEmbedAllowedDomain("cromie.org/schedule")).toBe("cromie.org");
      expect(normalizeEmbedAllowedDomain("localhost:3000/schedule")).toBe("localhost:3000");
    });

    it("ignores unsafe or invalid values", () => {
      expect(normalizeEmbedAllowedDomain("")).toBeNull();
      expect(normalizeEmbedAllowedDomain("javascript:alert(1)")).toBeNull();
      expect(normalizeEmbedAllowedDomain("http://")).toBeNull();
    });
  });

  describe("normalizeEmbedAllowedDomains", () => {
    it("deduplicates normalized domains", () => {
      expect(normalizeEmbedAllowedDomains(["cromie.org", "https://cromie.org/schedule"])).toEqual([
        "cromie.org",
      ]);
    });
  });

  describe("parseEmbedAllowedDomainsInput", () => {
    it("accepts comma and newline separated input", () => {
      expect(parseEmbedAllowedDomainsInput("cromie.org, www.cromie.org\nlocalhost:3000")).toEqual([
        "cromie.org",
        "www.cromie.org",
        "localhost:3000",
      ]);
    });
  });

  describe("isEmbedReferrerAllowed", () => {
    it("allows all referrers when no domains are configured", () => {
      expect(isEmbedReferrerAllowed({ referrer: undefined, allowedDomains: [] })).toBe(true);
    });

    it("allows matching referrers", () => {
      expect(
        isEmbedReferrerAllowed({
          referrer: "https://cromie.org/schedule",
          allowedDomains: ["cromie.org"],
        })
      ).toBe(true);
    });

    it("blocks non-matching referrers", () => {
      expect(
        isEmbedReferrerAllowed({
          referrer: "https://example.com/schedule",
          allowedDomains: ["cromie.org"],
        })
      ).toBe(false);
    });

    it("always allows same-app referrers so embed previews keep working", () => {
      expect(
        isEmbedReferrerAllowed({
          referrer: `${WEBAPP_URL}/embed/preview.html`,
          allowedDomains: ["cromie.org"],
        })
      ).toBe(true);
    });

    it("supports wildcard subdomains without matching the root domain", () => {
      expect(
        isEmbedReferrerAllowed({
          referrer: "https://schedule.cromie.org",
          allowedDomains: ["*.cromie.org"],
        })
      ).toBe(true);
      expect(
        isEmbedReferrerAllowed({
          referrer: "https://cromie.org",
          allowedDomains: ["*.cromie.org"],
        })
      ).toBe(false);
    });
  });
});
