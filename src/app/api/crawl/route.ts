import { NextRequest } from 'next/server';
import { CheerioCrawler } from '@crawlee/cheerio';
import { Configuration } from '@crawlee/core';
import { MemoryStorage } from '@crawlee/memory-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CrawledPage {
  title: string;
  url: string;
  cleanedText: string;
}

/**
 * Helper to determine if a target URL is in the hierarchy of the base URL.
 * Checks both domain/hostname equality and path prefix matching.
 */
function isUrlInHierarchy(targetUrlStr: string, baseUrlStr: string): boolean {
  try {
    const targetUrl = new URL(targetUrlStr);
    const baseUrl = new URL(baseUrlStr);

    // Strictly scope within the provided base domain/site hierarchy.
    if (targetUrl.hostname !== baseUrl.hostname) {
      return false;
    }

    // Normalize pathnames by ensuring they end with a trailing slash to avoid matching partial folder names
    // (e.g. prevent /docs-something from matching /docs)
    let basePath = baseUrl.pathname;
    if (!basePath.endsWith('/')) {
      basePath += '/';
    }

    let targetPath = targetUrl.pathname;
    if (!targetPath.endsWith('/')) {
      targetPath += '/';
    }

    return targetPath.startsWith(basePath);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Core endpoint structure & body parsing
    let body: any;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { success: false, error: 'Request body must be a valid JSON object.' },
        { status: 400 }
      );
    }

    const { url } = body;
    if (!url || typeof url !== 'string') {
      return Response.json(
        { success: false, error: 'A target "url" string is required in the request body.' },
        { status: 400 }
      );
    }

    // Validate URL and extract domain/hostname
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return Response.json(
        { success: false, error: 'The provided target URL is invalid.' },
        { status: 400 }
      );
    }

    const domain = parsedUrl.hostname;

    // 2. Temporary memory data aggregation
    const crawledPagesData: CrawledPage[] = [];

    // Create an isolated Configuration and MemoryStorage client instance for this request context.
    // This prevents file conflicts and memory crosstalk in concurrent server operations.
    const storageClient = new MemoryStorage({
      persistStorage: false,
      writeMetadata: false,
    });

    const config = new Configuration({
      storageClient,
      purgeOnStart: false,
    });

    // 3. Polite & Bounded Crawler
    const crawler = new CheerioCrawler({
      minConcurrency: 2, // Set to same as maxConcurrency to maintain steady concurrency rate
      maxConcurrency: 2, // Rate-limiting constraint
      maxRequestsPerCrawl: 20, // Strict maximum page boundary
      respectRobotsTxtFile: true, // Respect target site's robots.txt rules

      // Injects browser-like headers to prevent Cloudflare/anti-bot 403 blocks
      preNavigationHooks: [
        (_crawlingContext, gotOptions) => {
          gotOptions.headers = {
            ...gotOptions.headers,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'en-US,en;q=0.9',
            'referer': 'https://www.google.com/',
          };
        },
      ],

      // Request handler performs the DOM purging and string extraction
      async requestHandler({ $, request: crawlRequest, enqueueLinks }) {
        // HTML DOM Purging & Cleaning: Completely remove layout boilerplate elements
        $('nav, footer, script, style, .cookie-banner, #header, noscript').remove();

        // Extract title and exact URL
        const title = $('title').text().trim() || 'Untitled Page';
        const pageUrl = crawlRequest.url;

        // Isolate and extract content text (prefer body, fallback to root text)
        const rawText = $('body').length ? $('body').text() : $.text();
        const cleanedText = rawText
          .replace(/[ \t]+/g, ' ')       // Collapse horizontal spacing
          .replace(/\s*\n\s*/g, '\n')     // Normalize and collapse blank lines
          .replace(/\n{2,}/g, '\n\n')     // Restrict to max 2 consecutive newlines
          .trim();

        // Aggregate inside the response list
        crawledPagesData.push({
          title,
          url: pageUrl,
          cleanedText,
        });

        // Enqueue remaining discovered links scoped strictly to target domain/site hierarchy
        await enqueueLinks({
          strategy: 'same-hostname',
          transformRequestFunction: (reqOpts) => {
            if (isUrlInHierarchy(reqOpts.url, url)) {
              return reqOpts;
            }
            return false;
          },
        });
      },

      failedRequestHandler({ request: failedRequest, error }) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Crawl request failed for ${failedRequest.url}: ${errorMsg}`);
      },
    }, config);

    // Run the isolated crawler loop
    await crawler.run([url]);

    // 4. Return aggregated page structure
    return Response.json({
      success: true,
      domain,
      pages: crawledPagesData,
    });

  } catch (error: any) {
    console.error('Unhandled error during crawler route execution:', error);
    return Response.json(
      { success: false, error: error.message || 'An unexpected error occurred during crawling.' },
      { status: 500 }
    );
  }
}