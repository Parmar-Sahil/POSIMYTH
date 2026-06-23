import { NextRequest, NextResponse } from 'next/server';
import { CrawlerService } from '@/services/crawler.service';
import { ChunkerService } from '@/services/chunker.service';
import { EmbeddingService } from '@/services/embedding.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Core endpoint structure & body parsing
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Request body must be a valid JSON object.' },
        { status: 400 }
      );
    }

    const { url } = body;
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A target "url" string is required in the request body.' },
        { status: 400 }
      );
    }

    // Validate target URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'The provided target URL is invalid.' },
        { status: 400 }
      );
    }

    // 2. Orchestration pipeline (Crawler -> Chunker -> Embedder)
    console.log(`[API] Starting ingestion pipeline for URL: ${url}`);
    
    // Step A: Crawl
    const pages = await CrawlerService.crawlSite(url);
    console.log(`[API] Crawl completed. Found ${pages.length} pages.`);

    // Step B: Chunk
    const chunks = await ChunkerService.segmentText(pages);
    console.log(`[API] Segmentation completed. Created ${chunks.length} chunks.`);

    // Step C: Embed
    const vectors = await EmbeddingService.generateVectors(chunks);
    console.log(`[API] Embedding generation completed. Generated ${vectors.length} vectors.`);

    // 3. Return final vectors and payloads
    return NextResponse.json({
      success: true,
      url,
      total_chunks: chunks.length,
      data: vectors,
    });

  } catch (error: any) {
    console.error('[API Internal Error] Pipeline failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'An unexpected error occurred during pipeline execution.' },
      { status: 500 }
    );
  }
}