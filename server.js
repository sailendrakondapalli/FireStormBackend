import express from "express";
import cors from "cors";
import puppeteer from "puppeteer";


const app = express();
const PORT = 5000;
app.use(cors());

app.get("/scan", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Please provide a ?url=" });

  let browser;
  try {
    browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    await page.evaluate(async () => {
      let distance = 100;
      while (document.scrollingElement.scrollTop + window.innerHeight < document.scrollingElement.scrollHeight) {
        document.scrollingElement.scrollBy(0, distance);
        await new Promise(r => setTimeout(r, 300));
      }
    });

    const issues = await page.evaluate(() => {
      const detected = [];

      function getXPath(el) {
        if (!el) return "";
        if (el.id) return `//*[@id="${el.id}"]`;
        if (el === document.body) return "/html/body";
        let ix = 0;
        const siblings = el.parentNode ? el.parentNode.childNodes : [];
        for (let i = 0; i < siblings.length; i++) {
          if (siblings[i] === el) return getXPath(el.parentNode) + `/${el.tagName}[${ix + 1}]`;
          if (siblings[i].nodeType === 1 && siblings[i].tagName === el.tagName) ix++;
        }
        return "";
      }

      function assignTempId(el) {
        if (!el.id) el.id = "darkpattern-" + Math.random().toString(36).substr(2, 9);
        return el.id;
      }

      const hiddenElements = Array.from(document.querySelectorAll("button, a, input")).filter(el => {
        const style = getComputedStyle(el);
        return (
          el.offsetParent === null ||
          style.visibility === "hidden" ||
          style.opacity === "0" ||
          parseInt(style.width) < 20 ||
          parseInt(style.height) < 20
        );
      });

      hiddenElements.forEach(el => {
        const elId = assignTempId(el);
        detected.push({
          message: " Hidden / hard-to-see button/link",
          snippet: el.outerHTML,
          xpath: getXPath(el),
          link: window.location.href + "#" + elId,
          selector: "#" + elId
        });
      });

      const confirmTexts = ["are you sure you want to cancel", "don’t miss out", "only today"];
      const allElements = Array.from(document.body.querySelectorAll("*"));
      allElements.forEach(el => {
        const text = el.innerText?.toLowerCase() || "";
        confirmTexts.forEach(pattern => {
          if (text.includes(pattern)) {
            const elId = assignTempId(el);
            detected.push({
              message: " Confirmshaming / manipulative message",
              snippet: text.slice(0, 150),
              xpath: getXPath(el),
              link: window.location.href + "#" + elId,
              selector: "#" + elId
            });
          }
        });
      });

      allElements.forEach(el => {
        const text = el.innerText?.toLowerCase() || "";
        if (text.includes("free trial") && text.includes("credit card") && !text.includes("cancel anytime")) {
          const elId = assignTempId(el);
          detected.push({
            message: "Potential deceptive subscription / auto-renewal",
            snippet: text.slice(0, 150),
            xpath: getXPath(el),
            link: window.location.href + "#" + elId,
            selector: "#" + elId
          });
        }
      });

      const preChecked = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'))
        .filter(box => box.checked)
        .map(box => {
          const elId = assignTempId(box);
          return {
            message: " Pre-checked subscription / paid add-on",
            snippet: box.outerHTML,
            xpath: getXPath(box),
            link: window.location.href + "#" + elId,
            selector: "#" + elId
          };
        });
      detected.push(...preChecked);

      return detected.length ? detected : [{ message: " No dark UX patterns detected", snippet: "", link: window.location.href, selector: null }];
    });

    await page.evaluate((issues) => {
      issues.forEach((issue, index) => {
        if (issue.selector) {
          const el = document.querySelector(issue.selector);
          if (el) {
            el.style.outline = "3px solid red";
            el.style.backgroundColor = "rgba(255,0,0,0.1)";

            const rect = el.getBoundingClientRect();
            const badge = document.createElement("div");
            badge.innerText = index + 1;
            badge.style.position = "absolute";
            badge.style.top = `${rect.top + window.scrollY}px`;
               badge.style.left = `${rect.left + window.scrollX}px`;
            badge.style.width = "25px";
            badge.style.height = "25px";
                badge.style.background = "red";
            badge.style.color = "white";
                badge.style.borderRadius = "50%";
            badge.style.fontSize = "14px";
               badge.style.fontWeight = "bold";
            badge.style.display = "flex";
            badge.style.alignItems = "center";
                badge.style.justifyContent = "center";
            badge.style.zIndex = "9999";
            badge.style.pointerEvents = "none";
            document.body.appendChild(badge);
          }
        }
      });
    }, issues);



    
    const screenshot = await page.screenshot({ encoding: "base64", fullPage: true });

    res.json({ url, issues, screenshot: `data:image/png;base64,${screenshot}` });
  } catch (err) {
    res.status(500).json({ url, error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});









app.listen(PORT, () => console.log(` Dark UX Detector running on http://localhost:${PORT}`));
