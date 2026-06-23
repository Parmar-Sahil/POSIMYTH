import OpenAI from 'openai';
import { EmbeddingService } from './embedding.service';
import { QdrantService } from './qdrant.service';

export class RagService {
  /**
   * Generates a hallucination-resistant RAG response to the user's query
   * scoped strictly to the specified target domain.
   */
  public static async generateRagResponse(userQuery: string, domain: string): Promise<string> {
        const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured in process.env.');
    }

    // Normalize domain input to match Qdrant's stored hostname format
    let normalizedDomain = domain.trim();
    try {
      if (!normalizedDomain.includes('://')) {
        normalizedDomain = 'http://' + normalizedDomain;
      }
      normalizedDomain = new URL(normalizedDomain).hostname;
    } catch {
      normalizedDomain = domain.trim();
    }

    try {
      console.log(`[RagService] Generating embedding for user query: "${userQuery}"`);
      // Step A: Convert user query to vector
      const embedded = await EmbeddingService.generateVectors([
        { text: userQuery, url: '', pageTitle: '' },
      ]);

      if (embedded.length === 0 || !embedded[0].vector) {
        throw new Error('Failed to generate embedding for the user query.');
      }

      const queryVector = embedded[0].vector;

      // Step B: Retrieve top 4 similar chunks from Qdrant matching the domain tenancy
      console.log(`[RagService] Searching similar chunks in Qdrant for domain: "${normalizedDomain}"`);
      const matchedPoints = await QdrantService.searchSimilarVectors(
        'website_chunks',
        queryVector,
        normalizedDomain,
        4
      );

      console.log(`[RagService] Found ${matchedPoints.length} context chunks.`);

      // Step C: Extract and stitch context text chunks into a structured layout
      const contextText = matchedPoints
        .map((p, idx) => {
          const title = p.payload?.pageTitle || 'Untitled Page';
          const url = p.payload?.url || '';
          const text = p.payload?.text || '';
          return `---
SOURCE INDEX: ${idx + 1}
TITLE: ${title}
URL: ${url}
CONTENT: ${text}
---`;
        })
        .join('\n\n');

      // Step D: Construct the enhanced technical assistant prompt with strict citation rules
      const prompt = `You are an elite, production-grade Technical Support AI Assistant. Your core directive is to answer user queries with absolute factual accuracy based solely on the provided website source documentation.

=== STRATEGIC CONTEXT DOCUMENTS ===
${contextText || 'No context matches the target domain.'}
==================================

STRICT OPERATIONAL DIRECTIVES:
1. GROUNDING RULE: Answer the user's question using ONLY the factual context blocks provided above. Do not extrapolate, infer, or pull from external pre-trained knowledge.
2. FALLBACK PROTOCOL: If the answer cannot be found completely and confidently within the provided context, respond EXACTLY with this string: 'I am sorry, but the provided website documentation does not contain that information.' Do not provide incomplete answers or partial guesses.
3. FORMATTING RULE: Keep your explanation clear, well-structured, and easy to read. Use bullet points or numbered lists where appropriate to break down complex instructions.
4. MANDATORY CITATION FORMAT: You must cite the sources used to formulate your response. At the very end of your message, provide a dedicated section titled '### 🌐 Sources & References'. For every page context block you utilized to answer the question, output a clean, clickable markdown bullet point using the exact page title and URL provided in the metadata. Format it precisely as:
   * [Insert Page Title Here](Insert Exact URL Here)

Ensure that the links you output are identical to the source URLs in the context blocks.

User Question: ${userQuery}`;

      // Step E: Call Gemini 2.5 Flash on OpenRouter
      console.log('[RagService] Shipping prompt to Gemini 2.5 Flash on OpenRouter...');
      const openai = new OpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://github.com/Parmar-Sahil/POSIMYTH',
          'X-Title': 'RAG Chat Engine',
        },
      });

      const response = await openai.chat.completions.create({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      });

      const reply = response.choices[0]?.message?.content?.trim();
      if (!reply) {
        throw new Error('Empty response received from LLM.');
      }

      return reply;
    } catch (error: any) {
      console.error('[RagService] RAG response pipeline execution failed:', error);
      throw error;
    }
  }
}
