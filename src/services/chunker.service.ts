import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export interface ChunkedPage {
  text: string;
  url: string;
  pageTitle: string;
}

export class ChunkerService {
  /**
   * Segments the clean text of pages into smaller overlapping chunks.
   * Prepends the page metadata to each chunk for context preservation.
   */
  public static async segmentText(
    pages: Array<{ title: string; url: string; cleanedText: string }>
  ): Promise<ChunkedPage[]> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 700,
      chunkOverlap: 140,
    });

    const chunkedPages: ChunkedPage[] = [];

    for (const page of pages) {
      if (!page.cleanedText) {
        continue;
      }

      // Split text into array of chunk strings
      const rawChunks = await splitter.splitText(page.cleanedText);

      for (const chunkText of rawChunks) {
        // Prepend source context metadata into the text body string itself
        const prependedText = `Page Title: ${page.title} | Source: ${page.url}\n\n${chunkText}`;
        
        chunkedPages.push({
          text: prependedText,
          url: page.url,
          pageTitle: page.title,
        });
      }
    }

    return chunkedPages;
  }
}
