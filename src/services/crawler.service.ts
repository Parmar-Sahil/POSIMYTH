import { CheerioCrawler } from '@crawlee/cheerio';
import { Configuration } from '@crawlee/core';
import { MemoryStorage } from '@crawlee/memory-storage';

export interface CrawledPage {
  title: string;
  url: string;
  cleanedText: string;
}

export class CrawlerService {
  /**
   * Helper to check if a target URL is within the path hierarchy of the base URL.
   */
  private static isUrlInHierarchy(targetUrlStr: string, baseUrlStr: string): boolean {
    try {
      const targetUrl = new URL(targetUrlStr);
      const baseUrl = new URL(baseUrlStr);

      if (targetUrl.hostname !== baseUrl.hostname) {
        return false;
      }

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

  /**
   * Performs a polite, bounded, and domain-scoped web crawl.
   * Purges HTML layout boilerplate and aggregates the clean text from pages.
   */
  public static async crawlSite(url: string): Promise<CrawledPage[]> {
    const crawledPagesData: CrawledPage[] = [];

    // Isolated MemoryStorage and Configuration to prevent concurrent request storage pollution
    const storageClient = new MemoryStorage({
      persistStorage: false,
      writeMetadata: false,
    });

    const config = new Configuration({
      storageClient,
      purgeOnStart: false,
    });

    const crawler = new CheerioCrawler({
      minConcurrency: 2,
      maxConcurrency: 2,
      maxRequestsPerCrawl: 20,
      respectRobotsTxtFile: true,

      // Injects browser-like headers to avoid anti-bot blocks
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

      async requestHandler({ $, request: crawlRequest, enqueueLinks }) {
        // HTML DOM Purging & Cleaning
        $('nav, footer, script, style, .cookie-banner, #header, noscript').remove();

        const title = $('title').text().trim() || 'Untitled Page';
        const pageUrl = crawlRequest.url;

        // Isolate and extract content text
        const rawText = $('body').length ? $('body').text() : $.text();
        const cleanedText = rawText
          .replace(/[ \t]+/g, ' ')
          .replace(/\s*\n\s*/g, '\n')
          .replace(/\n{2,}/g, '\n\n')
          .trim();

        crawledPagesData.push({
          title,
          url: pageUrl,
          cleanedText,
        });

        // Enqueue undiscovered links strictly within domain site hierarchy
        await enqueueLinks({
          strategy: 'same-hostname',
          transformRequestFunction: (reqOpts) => {
            if (CrawlerService.isUrlInHierarchy(reqOpts.url, url)) {
              return reqOpts;
            }
            return false;
          },
        });
      },

      failedRequestHandler({ request: failedRequest, error }) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Crawler failed request for ${failedRequest.url}: ${errorMsg}`);
      },
    }, config);

    // Run the crawler inside its isolated Configuration context scope
    await Configuration.storage.run(config, async () => {
      await crawler.run([url]);
    });

    return crawledPagesData;
  }
}
