import { QdrantClient } from '@qdrant/js-client-rest';
import crypto from 'crypto';

// Prevent multiple instances of QdrantClient in development due to Next.js Hot Module Replacement (HMR)
const globalForQdrant = globalThis as unknown as {
  qdrantClient: QdrantClient | undefined;
};

export class QdrantService {
  private static clientInstance: QdrantClient | null = null;
  private static initializedCollections = new Set<string>();

  /**
   * Instantiates and configures a new QdrantClient.
   */
  private static createClient(): QdrantClient {
    const url = process.env.QDRANT_URL;
    if (!url) {
      throw new Error('QDRANT_URL is not configured in process.env.');
    }

    const apiKey = process.env.QDRANT_API_KEY && process.env.QDRANT_API_KEY.trim() !== ''
      ? process.env.QDRANT_API_KEY
      : undefined;

    console.log(`[QdrantService] Initializing QdrantClient targeting: ${url} (Authentication: ${apiKey ? 'Enabled' : 'Disabled'})`);

    return new QdrantClient({ url, apiKey });
  }

  /**
   * Returns a singleton instance of the QdrantClient.
   * Leverages globalThis in non-production environments to prevent socket exhaustion.
   */
  private static getClient(): QdrantClient {
    if (process.env.NODE_ENV === 'production') {
      if (!this.clientInstance) {
        this.clientInstance = this.createClient();
      }
      return this.clientInstance;
    } else {
      if (!globalForQdrant.qdrantClient) {
        globalForQdrant.qdrantClient = this.createClient();
      }
      return globalForQdrant.qdrantClient;
    }
  }

  /**
   * Checks if the collection exists, and creates it if it doesn't.
   * Configures vectors payload setting size to 3072 and distance metric to 'Cosine'.
   */
  public static async initializeCollection(collectionName: string): Promise<void> {
    if (this.initializedCollections.has(collectionName)) {
      return;
    }
    const client = this.getClient();
    try {
      console.log(`[QdrantService] Checking if collection "${collectionName}" exists...`);
      const response = await client.getCollections();
      const exists = response.collections.some((col) => col.name === collectionName);

      if (!exists) {
        console.log(`[QdrantService] Collection "${collectionName}" not found. Creating it...`);
        await client.createCollection(collectionName, {
          vectors: {
            size: 3072,
            distance: 'Cosine',
          },
        });
        console.log(`[QdrantService] Collection "${collectionName}" successfully created.`);
      } else {
        console.log(`[QdrantService] Collection "${collectionName}" already exists.`);
      }

      // Ensure that the domain index exists to support tenant-isolated filtering in strict mode (e.g. Qdrant Cloud)
      console.log(`[QdrantService] Ensuring payload keyword index on "domain" is present for collection "${collectionName}"...`);
      await client.createPayloadIndex(collectionName, {
        field_name: 'domain',
        field_schema: 'keyword',
      });
      console.log(`[QdrantService] Payload index on "domain" verified successfully.`);

      this.initializedCollections.add(collectionName);
    } catch (error: any) {
      console.error(
        `[QdrantService] Error connecting to Qdrant or initializing collection "${collectionName}":`,
        error
      );
      throw new Error(
        `Failed to initialize Qdrant collection: ${error.message || error}. Please ensure Qdrant is running and accessible at the configured URL.`
      );
    }
  }

  /**
   * Transforms incoming points and executes a mass upsert into the specified collection.
   * Generates a unique UUID for each point and maps the required payload fields.
   */
  public static async upsertVectors(
    collectionName: string,
    points: Array<{
      vector: number[];
      payload: {
        text: string;
        pageTitle: string;
        url: string;
        domain: string;
      };
    }>
  ): Promise<void> {
    if (points.length === 0) {
      console.log('[QdrantService] No points to upsert.');
      return;
    }

    await this.initializeCollection(collectionName);
    const client = this.getClient();
    try {
      console.log(`[QdrantService] Transforming and upserting ${points.length} points to "${collectionName}"...`);
      const transformedPoints = points.map((p) => {
        return {
          id: crypto.randomUUID(),
          vector: p.vector,
          payload: {
            text: p.payload.text,
            pageTitle: p.payload.pageTitle,
            url: p.payload.url,
            domain: p.payload.domain,
          },
        };
      });

      await client.upsert(collectionName, {
        points: transformedPoints,
      });
      console.log(`[QdrantService] Successfully indexed ${points.length} points.`);
    } catch (error: any) {
      console.error(`[QdrantService] Error upserting vectors to collection "${collectionName}":`, error);
      throw new Error(
        `Failed to upsert vectors to Qdrant: ${error.message || error}. Please ensure Qdrant is running and accessible at the configured URL.`
      );
    }
  }

  /**
   * Searches the Qdrant collection for vectors similar to the query vector,
   * enforcing a strict domain tenancy filter.
   */
  public static async searchSimilarVectors(
    collectionName: string,
    vector: number[],
    domain: string,
    limit = 4
  ): Promise<Array<{ id: string | number; score: number; payload: any }>> {
    await this.initializeCollection(collectionName);
    const client = this.getClient();
    try {
      console.log(`[QdrantService] Searching similar vectors in "${collectionName}" filtered by domain: "${domain}"...`);
      const results = await client.search(collectionName, {
        vector,
        limit,
        filter: {
          must: [
            {
              key: 'domain',
              match: {
                value: domain,
              },
            },
          ],
        },
        with_payload: true,
      });

      return results.map((r) => ({
        id: r.id,
        score: r.score,
        payload: r.payload,
      }));
    } catch (error: any) {
      console.error(`[QdrantService] Error searching similar vectors in collection "${collectionName}":`, error);
      throw new Error(
        `Failed to search similar vectors in Qdrant: ${error.message || error}. Please ensure Qdrant is running and accessible at the configured URL.`
      );
    }
  }
}
