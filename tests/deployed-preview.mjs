import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const url = process.env.JAI_PREVIEW_URL || "https://jai-viral-studio-git-jai-visual-assets-preview-f3dcf1-jai-cc19.vercel.app";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  assert.ok(response && response.status() === 200, "Preview must return HTTP 200; got " + (response?.status() ?? "no response"));
  fs.mkdirSync("artifacts", { recursive: true });
  const initial = {
    title: await page.title(),
    finalUrl: page.url(),
    bodyText: (await page.locator("body").innerText().catch(() => "")).slice(0, 1800),
    topicCount: await page.locator("#topic").count(),
    visualStudioCount: await page.locator("#visualStudio").count(),
    assetLibraryCount: await page.locator("#jaiAssetLibrary").count()
  };
  await page.screenshot({ path: "artifacts/jai-preview-mobile.png", fullPage: true });
  console.log("PREVIEW_INITIAL_DIAGNOSTICS=" + JSON.stringify(initial));
  await page.locator("#topic").waitFor({ state: "visible", timeout: 20000 });
  await page.locator("#visualStudio").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("#jaiAssetLibrary").waitFor({ state: "visible", timeout: 15000 });
  assert.equal(await page.locator("#jaiAssetSearch").isVisible(), true, "Openverse search control must be visible in the deployed studio");
  assert.equal(await page.locator("#jaiAssetQuery").isVisible(), true, "Asset query field must be visible");
  assert.equal(await page.locator("#renderVideo").isDisabled(), true, "Export must remain gated before production QA");
  assert.deepEqual(errors, [], "The deployed preview must not throw browser runtime errors: " + errors.join(" | "));
  console.log(JSON.stringify({ status: response.status(), url: page.url(), viewport: "390x844", assetLibrary: true, exportGate: "locked-before-QA", pageErrors: errors.length, screenshot: "artifacts/jai-preview-mobile.png" }, null, 2));
} finally {
  await browser.close();
}
