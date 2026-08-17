/**
 * Browser API — Real headless Chromium on Vercel serverless
 *
 * Actions:
 *   navigate  → { url }                   → { title, content, screenshot, links }
 *   search    → { url, query }            → { title, content, screenshot, url }
 *   click     → { url, value }            → { title, content, screenshot }
 *   scroll    → { url }                   → { title, content, screenshot (full page) }
 *   screenshot → { url }                 → { screenshot, title }
 *
 * Uses @sparticuz/chromium (serverless-optimized Chromium binary).
 * Runtime: nodejs (NOT edge — Chromium needs Node.js APIs).
 */

import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function launchBrowser() {
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
    defaultViewport: { width: 1280, height: 800 },
  });
  return browser;
}

function cleanUrl(url: string): string {
  if (!url.startsWith('http')) url = `https://${url}`;
  return url;
}

function buildSearchUrl(siteUrl: string, query: string): string {
  const encoded = encodeURIComponent(query);
  const lower = siteUrl.toLowerCase();
  if (lower.includes('google')) return `https://www.google.com/search?q=${encoded}`;
  if (lower.includes('amazon')) return `https://www.amazon.com/s?k=${encoded}`;
  if (lower.includes('youtube')) return `https://www.youtube.com/results?search_query=${encoded}`;
  if (lower.includes('twitter') || lower.includes('x.com')) return `https://twitter.com/search?q=${encoded}`;
  if (lower.includes('reddit')) return `https://www.reddit.com/search/?q=${encoded}`;
  if (lower.includes('wikipedia')) return `https://en.wikipedia.org/w/index.php?search=${encoded}`;
  if (lower.includes('github')) return `https://github.com/search?q=${encoded}`;
  if (lower.includes('ebay')) return `https://www.ebay.com/sch/i.html?_nkw=${encoded}`;
  const base = siteUrl.replace(/\/$/, '');
  return `${base}/search?q=${encoded}`;
}

export async function POST(req: NextRequest) {
  const { action, url: rawUrl, query, value, text } = await req.json();

  if (!rawUrl && action !== 'screenshot') {
    return NextResponse.json({ error: 'url required' }, { status: 400 });
  }

  const url = cleanUrl(rawUrl || '');
  let browser: any = null;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setUserAgent(UA);

    // Block images/fonts/CSS for faster loading (we still get content + screenshots)
    await page.setRequestInterception(true);
    page.on('request', (req: any) => {
      const type = req.resourceType();
      if (['font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    let finalUrl = url;
    let title = '';
    let content = '';
    let screenshot: string | null = null;
    let links: { text: string; url: string }[] = [];

    switch (action) {
      case 'navigate': {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(1000);
        title = await page.title();
        content = await page.evaluate(() => {
          // Extract readable content from the page
          const removeElements = document.querySelectorAll('script, style, nav, footer, header, iframe, noscript');
          removeElements.forEach(el => el.remove());
          const body = document.body;
          if (!body) return '';
          // Get text with structure
          const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
          const texts: string[] = [];
          let node;
          while (node = walker.nextNode()) {
            const t = node.textContent?.trim();
            if (t && t.length > 2) texts.push(t);
          }
          return texts.join('\n').slice(0, 12000);
        });

        // Extract links
        links = await page.evaluate(() => {
          const anchors = document.querySelectorAll('a[href]');
          const results: { text: string; url: string }[] = [];
          anchors.forEach(a => {
            const href = (a as HTMLAnchorElement).href;
            const text = a.textContent?.trim();
            if (href && href.startsWith('http') && text && text.length > 2) {
              results.push({ text, url: href });
            }
          });
          return results.slice(0, 30);
        });

        // Take screenshot (viewport, not full page for speed)
        const screenshotBuffer = await page.screenshot({ encoding: 'binary', type: 'jpeg', quality: 75 });
        screenshot = `data:image/jpeg;base64,${Buffer.from(screenshotBuffer).toString('base64')}`;
        break;
      }

      case 'search': {
        // Navigate to the site, type in search box, submit
        const searchUrl = buildSearchUrl(url, query || value || '');
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(2000);
        finalUrl = page.url();
        title = await page.title();
        content = await page.evaluate(() => {
          const removeElements = document.querySelectorAll('script, style, nav, footer, iframe, noscript');
          removeElements.forEach(el => el.remove());
          const body = document.body;
          if (!body) return '';
          const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
          const texts: string[] = [];
          let node;
          while (node = walker.nextNode()) {
            const t = node.textContent?.trim();
            if (t && t.length > 2) texts.push(t);
          }
          return texts.join('\n').slice(0, 12000);
        });

        const screenshotBuffer = await page.screenshot({ encoding: 'binary', type: 'jpeg', quality: 75 });
        screenshot = `data:image/jpeg;base64,${Buffer.from(screenshotBuffer).toString('base64')}`;
        break;
      }

      case 'click': {
        // Navigate to URL, then click a link matching the text
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(1000);

        const linkText = value || text || '';
        const clicked = await page.evaluate((searchText: string) => {
          const links = Array.from(document.querySelectorAll('a'));
          const match = links.find(a => {
            const t = a.textContent?.toLowerCase().trim() || '';
            return t.includes(searchText.toLowerCase());
          });
          if (match) {
            (match as HTMLAnchorElement).click();
            return true;
          }
          return false;
        }, linkText);

        if (clicked) {
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(1000);
          finalUrl = page.url();
        }

        title = await page.title();
        content = await page.evaluate(() => {
          const removeElements = document.querySelectorAll('script, style, nav, footer, iframe, noscript');
          removeElements.forEach(el => el.remove());
          const body = document.body;
          if (!body) return '';
          const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
          const texts: string[] = [];
          let node;
          while (node = walker.nextNode()) {
            const t = node.textContent?.trim();
            if (t && t.length > 2) texts.push(t);
          }
          return texts.join('\n').slice(0, 12000);
        });

        const screenshotBuffer = await page.screenshot({ encoding: 'binary', type: 'jpeg', quality: 75 });
        screenshot = `data:image/jpeg;base64,${Buffer.from(screenshotBuffer).toString('base64')}`;
        break;
      }

      case 'scroll': {
        // Full page screenshot
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(1000);
        title = await page.title();
        content = await page.evaluate(() => {
          const removeElements = document.querySelectorAll('script, style, nav, footer, iframe, noscript');
          removeElements.forEach(el => el.remove());
          const body = document.body;
          if (!body) return '';
          return body.innerText.slice(0, 12000);
        });

        const screenshotBuffer = await page.screenshot({ encoding: 'binary', type: 'jpeg', quality: 70, fullPage: true });
        screenshot = `data:image/jpeg;base64,${Buffer.from(screenshotBuffer).toString('base64')}`;
        break;
      }

      case 'screenshot': {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(1500);
        title = await page.title();
        const screenshotBuffer = await page.screenshot({ encoding: 'binary', type: 'jpeg', quality: 75 });
        screenshot = `data:image/jpeg;base64,${Buffer.from(screenshotBuffer).toString('base64')}`;
        break;
      }

      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }

    await browser.close();
    browser = null;

    return NextResponse.json({
      success: true,
      url: finalUrl,
      title,
      content,
      screenshot,
      links,
    });
  } catch (err: any) {
    console.error('[browser API] Error:', err.message);
    if (browser) await browser.close().catch(() => {});
    return NextResponse.json({ error: err.message, success: false }, { status: 500 });
  }
}
