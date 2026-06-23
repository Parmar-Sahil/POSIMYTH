# RAG Workspace Engine 🚀

---

## 📚 Architecture Overview

The project follows a **strict Separation of Concerns (SoC)** pattern, where each piece of functionality lives in an isolated service class. This makes the codebase **easily testable, extensible, and maintainable**.

| Service | Responsibility |
|---|---|
| **CrawlerService** | Fetches a website, respects `robots.txt`, limits concurrency (max 2) and request count (max 20). Uses `crawlee` + `Cheerio` to strip navigation, footers, scripts, styles, and cookie‑banner boiler‑plate, returning clean textual fragments. |
| **ChunkerService** | Splits cleaned page text into overlapping chunks (size: **700 tokens**, overlap: **140 tokens**) – a sweet spot that captures complete semantic thoughts while staying comfortably inside LLM context windows. |
| **EmbeddingService** | Calls **Google Gemini Embedding‑2** (via OpenRouter) to transform each chunk into a 3072‑dimensional vector. |
| **QdrantService** | Persists vectors and their payload (`pageTitle`, `url`, `domain`, `text`). Handles collection creation, upserts, and **payload‑filtered search** to guarantee tenant isolation. |
| **RagService** | Orchestrates retrieval, prompt construction and response generation. It queries Qdrant for the top‑k most similar chunks, builds a hallucination‑resistant system prompt, and streams the answer back to the front‑end. |

---

## 🛠️ Engineering Design Choices

### Chunk Size & Overlap
- **Chunk size:** `700` tokens
- **Overlap:** `140` tokens

These parameters were chosen after benchmarking common documentation pages. A 700‑token chunk comfortably fits into most LLM context windows (including Gemini‑2) while still holding a full logical thought. The 140‑token overlap ensures that semantic boundaries that straddle chunk edges are retained, improving retrieval relevance without exploding the number of vectors.

### OpenRouter Integration
We interact with **OpenRouter** using the **OpenAI‑compatible HTTP interface**. This gives us two major advantages:
1. **Provider agnostic** – swapping from Google Gemini to Anthropic, Mistral, or any OpenAI‑compatible model requires only a change to the `OPENROUTER_API_KEY` and model name in `.env.local`.
2. **Unified request shape** – our `RagService` does not need to know the underlying vendor, reducing coupling and future‑proofing the codebase.

### Data Isolation Strategy (Multi‑Session Tenancy)
- Every indexed website gets its own **domain‑scoped workspace** (`ChatSession.id`).
- Vectors are stored with a `domain` payload field.
- **Qdrant payload filters** are applied on every similarity search (`searchSimilarVectors`) to ensure only vectors belonging to the active domain are returned.
- Front‑end state (`sessions`, `activeSessionId`) is persisted in `localStorage`, preventing cross‑talk between sessions even after a page refresh.

---

## ⚙️ Local Setup Instructions

> **Prerequisites**
> - Docker Desktop (or Docker Engine) installed
> - Node.js ≥ 20 (LTS) and `npm`
> - An **OpenRouter** API key with access to the Gemini‑2 embedding model


1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/rag_chat.git
   cd rag_chat
   ```

2. **Create a `.env.local` file** at the repo root (copy the template below):
   ```dotenv
   # ----------------------------
   # Server configuration
   # ----------------------------
   PORT=3000

   # ----------------------------
   # Qdrant configuration
   # ----------------------------
   QDRANT_URL=http://localhost:6333
   QDRANT_COLLECTION=rags

   # ----------------------------
   # OpenRouter / LLM configuration
   # ----------------------------
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   # Model name must be an OpenAI‑compatible identifier, e.g. "google/gemini-1.5-flash"
   OPENROUTER_MODEL=google/gemini-1.5-flash

   # ----------------------------
   # Crawler configuration
   # ----------------------------
   CRAWLER_MAX_CONCURRENCY=2
   CRAWLER_MAX_REQUESTS=20
   ```

3. **Start the Qdrant vector store** using Docker Compose:
   ```bash
   docker compose up -d   # spins up Qdrant on http://localhost:6333
   ```
   Verify it’s running: `curl http://localhost:6333/health`

4. **Install Node dependencies**
   ```bash
   npm ci    # clean install based on package‑lock.json
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser. The UI will load with the **collapsible dark‑mode dashboard**.

6. **Production build (optional)**
   ```bash
   npm run build   # creates an optimized Next.js build
   npm start       # starts the compiled server
   ```

---

## 🐳 Docker Quick‑Start (All‑in‑One)

If you prefer an isolated environment, you can run the whole stack inside Docker (including the Next.js server). Add a `Dockerfile` and a `docker-compose.yml` entry like the following (already present in the repo):

```yaml
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
  web:
    build: .
    command: npm run start
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    depends_on:
      - qdrant
volumes:
  qdrant_data:
```

Then simply run:
```bash
docker compose up -d --build
```
The application will be reachable at `http://localhost:3000`.

---

## 🔑 API Keys & Secrets

- **OpenRouter API Key** – stored in `.env.local` as `OPENROUTER_API_KEY`. Keep this secret; never commit it to source control.
- **Qdrant** – runs locally without authentication for development. In production you may enable TLS/username‑password; update `QDRANT_URL` accordingly.

---

## 📖 How to Use the Application

1. **Index a website** – paste a root URL into the *Ingest New Website* form on the left sidebar. The crawler respects `robots.txt` and will fetch up to 20 pages.
2. **Chat** – select a workspace (domain) from the list, type a question in the input bar, and the system will retrieve the most relevant chunks and generate an answer.
3. **Multi‑session** – you can create as many workspaces as you like. Switching between them instantly changes the retrieval scope thanks to the Qdrant payload filter.
4. **Persistence** – all sessions and chat histories are saved to `localStorage`. Refreshing the page retains your data.

---

## 📦 Project Structure (high‑level)
```
src/
├─ app/               # Next.js pages & API routes
│  └─ api/
│     ├─ chat/       # POST → RagService
│     └─ crawl/      # POST → CrawlerService → Chunker → Embedding → Qdrant
├─ services/          # Core isolated services (SoC)
│  ├─ crawler.service.ts
│  ├─ chunker.service.ts
│  ├─ embedding.service.ts
│  ├─ qdrant.service.ts
│  └─ rag.service.ts
└─ ...
```

*Built with love, coffee, and a relentless focus on **clean architecture**.*

---
