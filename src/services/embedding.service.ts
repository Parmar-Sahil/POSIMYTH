import OpenAI from 'openai';

export interface GeneratedVector {
  vector: number[];
  payload: {
    text: string;
    url: string;
    pageTitle: string;
    domain: string;
  };
}

export class EmbeddingService {
  /**
   * Generates high-dimensional vector embeddings for text chunks using the
   * google/gemini-embedding-2 model on OpenRouter.
   */
  public static async generateVectors(
    chunks: Array<{ text: string; url: string; pageTitle: string }>
  ): Promise<GeneratedVector[]> {
    if (chunks.length === 0) {
      return [];
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured in process.env.');
    }

    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });

    const results: GeneratedVector[] = [];
    const batchSize = 16; // Process in polite batches to avoid payload size errors

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const inputs = batch.map((c) => c.text);

      try {
        const response = await openai.embeddings.create({
          model: 'google/gemini-embedding-2',
          input: inputs,
          encoding_format: 'float',
        });

        if (response.data && response.data.length === batch.length) {
          for (let j = 0; j < batch.length; j++) {
            let domain = '';
            try {
              domain = new URL(batch[j].url).hostname;
            } catch {
              domain = '';
            }

            results.push({
              vector: response.data[j].embedding,
              payload: {
                text: batch[j].text,
                url: batch[j].url,
                pageTitle: batch[j].pageTitle,
                domain,
              },
            });
          }
        } else {
          throw new Error(`Embedding response count mismatch. Expected ${batch.length}, got ${response.data?.length}`);
        }
      } catch (error: any) {
        console.error(`Failed generating embeddings batch starting at index ${i}:`, error);
        throw error;
      }
    }

    return results;
  }
}
