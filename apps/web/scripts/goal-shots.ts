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
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "domcontentloaded" });
// loader ~5s, then goal scene starts
await sleep(5600);
await page.screenshot({ path: `${OUT}/g1-runup.png` });
await sleep(900);
await page.screenshot({ path: `${OUT}/g2-flight.png` });
await sleep(900);
await page.screenshot({ path: `${OUT}/g3-goal.png` });
await sleep(1200);
await page.screenshot({ path: `${OUT}/g4-goal-text.png` });
await sleep(1500);
await page.screenshot({ path: `${OUT}/g5-homepage.png` });

console.log("errors:", errors.length ? errors : "none");
await browser.close();
