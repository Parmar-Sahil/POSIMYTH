import { NextRequest, NextResponse } from 'next/server';
import { CrawlerService } from '@/services/crawler.service';
import { ChunkerService } from '@/services/chunker.service';
import { EmbeddingService } from '@/services/embedding.service';
import { QdrantService } from '@/services/qdrant.service';

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
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'The provided target URL is invalid.' },
        { status: 400 }
      );
    }

    const domain = parsedUrl.hostname;

    // 2. Orchestration pipeline (Crawler -> Chunker -> Embedder -> Qdrant)
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

    // Step D: Initialize collection
    await QdrantService.initializeCollection('website_chunks');

    // Step E: Upsert vectors
    await QdrantService.upsertVectors('website_chunks', vectors);
    console.log(`[API] Vector database indexing completed for domain: ${domain}`);

    // 3. Return high-level success summary
    return Response.json({
      success: true,
      message: "Ingestion pipeline completed successfully.",
      domain,
      total_chunks_indexed: vectors.length,
    });

  } catch (error: any) {
    console.error('[API Internal Error] Pipeline failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'An unexpected error occurred during pipeline execution.' },
      { status: 500 }
    );
  }
}