import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://localhost:5173/";
const OUT = "shots";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--window-size=1440,960", "--hide-scrollbars"],
  defaultViewport: { width: 1440, height: 960 },
});
const page = await browser.newPage();
const errors: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

const clickByText = async (selector: string, text: string) => {
  const ok = await page.evaluate(
    (sel, t) => {
      const els = [...document.querySelectorAll<HTMLElement>(sel)];
      const el = els.find((b) => b.textContent?.trim().includes(t));
      if (el) el.click();
      return Boolean(el);
    },
    selector,
    text,
  );
  if (!ok) console.log(`NOT FOUND: ${selector} "${text}"`);
  return ok;
};

await page.goto(URL, { waitUntil: "domcontentloaded" });
await sleep(1400);
await page.screenshot({ path: `${OUT}/00-loader.png` });
await sleep(4200);
await page.screenshot({ path: `${OUT}/01-hero.png` });

await clickByText("button", "Connect");
await sleep(500);
await clickByText("button", "Claim");
await sleep(300);
await clickByText("button", "Link");
await sleep(500);
await page.screenshot({ path: `${OUT}/02-onboarded.png` });

await clickByText("button", "View today's matches");
await sleep(1500);
await page.screenshot({ path: `${OUT}/03-match-cards.png` });

await clickByText("button", "Open match");
await sleep(1500);
await clickByText("button", "▶ Start");
await sleep(200);
await clickByText("button", "60x");
await sleep(20000);
await page.screenshot({ path: `${OUT}/04-match-live.png` });

// back to cards to show live overlay frame
await page.goto(`${URL}#/matches`, { waitUntil: "domcontentloaded" });
await sleep(1200);
await page.screenshot({ path: `${OUT}/05-cards-live.png` });

console.log("console errors:", errors.length ? errors : "none");
await browser.close();
