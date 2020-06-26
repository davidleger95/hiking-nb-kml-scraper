import path from 'path';
import fetch from 'node-fetch';
import jsdom from 'jsdom';
import puppeteer from 'puppeteer';

const { JSDOM } = jsdom;

function delay(time: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

const downloadKMLFiles = async (mapUrls: string[]) => {
  console.log(`Downloading KML files...`);
  // Setup Puppeteer
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: path.resolve(__dirname, '../downloaded'),
  });

  for (let url of mapUrls) {
    try {
      await page.goto(url, {
        waitUntil: 'networkidle0',
      });

      const menu = await page.$(
        '#legendPanel > div:first-child > div:first-child > div:first-child > div:last-child > div[role="button"]'
      );
      // await delay(1000);
      await menu.click();
      await page.waitForSelector('[aria-label="Download KML"]', {
        visible: true,
      });
      const downloadKMLButton = await page.$('[aria-label="Download KML"]');

      await delay(400);
      await downloadKMLButton.tap();
      await delay(500);
      // const allCheckboxes = await page.$$('[role="checkbox"]');

      const kmlCheckbox = await page.$x(
        '/html/body/div[4]/div/div[2]/span/div/label[3]/div'
      );
      if (kmlCheckbox.length > 0) {
        await kmlCheckbox[0].tap();
      }
      await delay(500);
      // const allButtons = await page.$$('div[role="button"]');
      const okButton = await page.$x(
        '/html/body/div[4]/div/div[2]/div[3]/div[2]'
      );
      if (okButton.length > 0) {
        await okButton[0].tap();
      }
    } catch (e) {
      console.log(e);
    }
  }

  await browser.close();

  console.log('Done!');
};

(async () => {
  const response = await fetch('http://www.hikingnb.ca/TrailList.html');
  const text = await response.text();
  const dom = await new JSDOM(text);
  // links are in the 3rd column of the table on this page
  const linkSelector = 'tbody > tr > td:nth-child(3) > a';
  const trailLinks = [
    ...dom.window.document.querySelectorAll(linkSelector),
  ].slice(300, 325);
  const trailUrls = trailLinks
    .filter((tl) => !!tl)
    .map((linkElement) => {
      const href = linkElement?.getAttribute('href');
      if (href.startsWith('Trails')) {
        return `http://www.hikingnb.ca/${href}`;
      }
      return href;
    });

  console.log('Got all trail page URLs...');

  const mapUrls = await Promise.all(
    trailUrls.map(async (link) => {
      try {
        const response = await fetch(link);
        const text = await response.text();
        const trailPage = await new JSDOM(text);

        const mapIframeSelector = 'iframe[src*="google"]';
        const mapIframe = trailPage.window.document.querySelector(
          mapIframeSelector
        );

        const mapUrl = mapIframe
          ?.getAttribute('src')
          .replace('&output=embed', '')
          .replace('/embed?', '/viewer?');

        return mapUrl;
      } catch (e) {
        console.log(`Could not fetch ${link}`);
        console.error(e);
      }
    })
  );

  const urls = mapUrls.filter((mu) => !!mu);

  console.log('Got all map URLs...');
  console.log(`Downloading ${urls.length} of ${trailLinks.length} trails.`);

  await downloadKMLFiles(urls);
})();
