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
  if (!ok) throw new Error(`element not found: ${selector} "${text}"`);
};

// 1. landing + onboarding
await page.goto(URL, { waitUntil: "networkidle0" });
await sleep(3000);
await page.screenshot({ path: `${OUT}/01-hero.png` });

await clickByText("button", "Connect");
await sleep(600);
await clickByText("button", "Claim");
await sleep(400);
await clickByText("button", "Link");
await sleep(600);
await page.screenshot({ path: `${OUT}/02-onboarded.png` });

// 2. matches
await clickByText("button", "View today's matches");
await sleep(1200);
await page.screenshot({ path: `${OUT}/03-matches.png` });

// 3. match centre — FRA v MAR, run at 60x
await clickByText("button", "Open match centre");
await sleep(1500);
await page.screenshot({ path: `${OUT}/04-match-centre-idle.png` });
await clickByText("button", "▶ Start");
await sleep(300);
await clickByText("button", "60x");
await sleep(12000);
await page.screenshot({ path: `${OUT}/05-match-live.png` });

// 4. wait for a recommendation (agent needs value edge) — poll up to 90s
let found = false;
for (let i = 0; i < 30; i++) {
  const has = await page.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) =>
      b.textContent?.includes("Confirm Bet"),
    ),
  );
  if (has) {
    found = true;
    break;
  }
  await sleep(3000);
}
await page.screenshot({ path: `${OUT}/06-recommendation.png` });

if (found) {
  await clickByText("button", "Confirm Bet");
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/07-confirm-page.png` });
  await page.type("input[placeholder='TYPE BET TO CONFIRM']", "BET");
  await sleep(300);
  await clickByText("button", "Sign with MetaMask");
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/08-signed.png` });
}

// 5. let the replay finish (60x, capture ~106min -> ~106s wall time). Wait for FINALISED.
await page.goto(`${URL}#/matches/18209181`, { waitUntil: "networkidle0" });
for (let i = 0; i < 60; i++) {
  const fin = await page.evaluate(() => document.body.innerText.includes("FINALISED"));
  if (fin) break;
  await sleep(3000);
}
await page.screenshot({ path: `${OUT}/09-full-time.png` });

// 6. portfolio + history
await page.goto(`${URL}#/portfolio`, { waitUntil: "networkidle0" });
await sleep(1500);
await page.screenshot({ path: `${OUT}/10-portfolio.png` });
await page.goto(`${URL}#/history`, { waitUntil: "networkidle0" });
await sleep(1200);
await page.screenshot({ path: `${OUT}/11-history.png` });
await page.goto(`${URL}#/replay`, { waitUntil: "networkidle0" });
await sleep(1200);
await page.screenshot({ path: `${OUT}/12-replay-dashboard.png` });
await page.goto(`${URL}#/settings`, { waitUntil: "networkidle0" });
await sleep(1200);
await page.screenshot({ path: `${OUT}/13-settings.png` });

console.log("recommendation found:", found);
console.log("console errors:", errors.length ? errors : "none");
await browser.close();
