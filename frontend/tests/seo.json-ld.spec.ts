import { expect, test } from "@playwright/test";

test("homepage emits parser-compatible JSON-LD", async ({ page }) => {
  await page.goto("/?lang=en");

  const structuredData = await page.locator('script[type="application/ld+json"]').evaluate((element) => {
    return JSON.parse(element.textContent || "{}");
  });

  expect(Array.isArray(structuredData)).toBe(false);
  expect(structuredData["@context"]).toBe("https://schema.org");
  expect(structuredData["@graph"]).toEqual(expect.arrayContaining([
    expect.objectContaining({ "@type": "Organization", name: "DukaPilot" }),
    expect.objectContaining({ "@type": "SoftwareApplication", name: "DukaPilot" }),
    expect.objectContaining({ "@type": "WebSite", name: "DukaPilot" }),
  ]));
});
