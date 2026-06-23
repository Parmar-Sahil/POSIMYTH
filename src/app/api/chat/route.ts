import { NextRequest, NextResponse } from 'next/server';
import { RagService } from '@/services/rag.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Parse JSON body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Request body must be a valid JSON object.' },
        { status: 400 }
      );
    }

    // 2. Validate input parameters
    const { message, domain } = body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { success: false, error: 'A target "message" string is required in the request body.' },
        { status: 400 }
      );
    }

    if (!domain || typeof domain !== 'string' || !domain.trim()) {
      return NextResponse.json(
        { success: false, error: 'A target "domain" string is required in the request body.' },
        { status: 400 }
      );
    }

    console.log(`[API Chat] Processing request for domain: "${domain}", query length: ${message.length}`);

    // 3. Call RAG Pipeline
    const aiResponse = await RagService.generateRagResponse(message.trim(), domain.trim());

    // 4. Return clean response
    return Response.json({
      success: true,
      reply: aiResponse,
    });
  } catch (error: any) {
    console.error('[API Chat Internal Error] RAG execution failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'An unexpected error occurred during RAG generation.' },
      { status: 500 }
    );
  }
}
