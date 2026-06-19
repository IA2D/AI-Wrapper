# RAG Service

FastAPI-based RAG (Retrieval-Augmented Generation) service for PDF-aware chat with vector search.

## Features

- **PDF Upload & Processing**: Extract text, chunk, and embed PDF documents
- **Vector Search**: Store and retrieve document chunks using Qdrant
- **Chat with RAG**: Automatically include PDF context in chat responses
- **PDF Analysis**: Summarize and analyze uploaded PDFs
- **PDF Edit Suggestions**: AI-assisted document improvements
- **Streaming Responses**: Real-time AI response streaming
- **Arabic Support**: Full support for Arabic text including Egyptian dialect

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Next.js App  │────▶│   Node.js    │────▶│   RAG API    │
│   (Frontend)  │     │   API Routes │     │(Python/FastAPI)│
└──────────────┘     └──────────────┘     └──────┬───────┘
       │                                           │
       │                                           ▼
       │                                    ┌──────────────┐
       │                                    │   Qdrant     │
       │                                    │ (Vector DB)  │
       │                                    └──────────────┘
       │                                           ▲
       │                                           │
       ▼                                           │
┌──────────────┐                          ┌──────────────┐
│  LLM API     │◀─────────────────────────│  vLLM/OAI    │
│  (RunPod)    │                          │  Compatible  │
└──────────────┘                          └──────────────┘
```

## Installation

1. Install Python dependencies:
```bash
cd rag-service
pip install -r requirements.txt
```

2. Start Qdrant (Docker):
```bash
docker run -p 6333:6333 -v qdrant_storage:/qdrant/storage qdrant/qdrant
```

3. Start the RAG service:
```bash
python start.py
```

Or with options:
```bash
python start.py --port 8001 --reload
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QDRANT_HOST` | `localhost` | Qdrant server host |
| `QDRANT_PORT` | `6333` | Qdrant server port |
| `QDRANT_COLLECTION` | `pdf_chunks` | Vector collection name |
| `LLM_ENDPOINT` | `http://localhost:8000/v1/chat/completions` | LLM API endpoint |
| `LLM_API_KEY` | `` | LLM API key (if required) |
| `LLM_MODEL` | `google/gemma-4-E4B-it` | Default LLM model |
| `EMBEDDING_ENDPOINT` | `http://localhost:8000/v1/embeddings` | Embedding API endpoint |
| `EMBEDDING_MODEL` | `BAAI/bge-m3` | Embedding model |
| `CHUNK_SIZE` | `1200` | Text chunk size (characters) |
| `CHUNK_OVERLAP` | `200` | Chunk overlap (characters) |
| `TOP_K_RETRIEVAL` | `12` | Number of matched chunks to retrieve before neighbor expansion |
| `RAG_CONTEXT_CHAR_LIMIT` | `45000` | Maximum uploaded-document context sent to the LLM |
| `RAG_SCROLL_LIMIT` | `2000` | Maximum stored chunks scanned for fallback retrieval |
| `VECTOR_SIZE` | `1024` | Embedding vector dimension |
| `UPLOAD_DIR` | `./uploads` | PDF upload directory |

## API Endpoints

### Chat with RAG
```http
POST /chat
Content-Type: application/json

{
  "message": "What is discussed in the document?",
  "session_id": "session-123",
  "stream": true,
  "thinking_mode": false
}
```

### Upload PDF
```http
POST /upload-pdf
Content-Type: multipart/form-data

file: <PDF file>
session_id: session-123
```

### Summarize PDF
```http
POST /pdf/summarize
Content-Type: application/json

{
  "session_id": "session-123",
  "doc_id": "optional-doc-id"
}
```

### Get Edit Suggestions
```http
POST /pdf/edit-suggestions
Content-Type: application/json

{
  "session_id": "session-123",
  "instruction": "Improve the introduction",
  "doc_id": "optional-doc-id"
}
```

### List Session PDFs
```http
GET /session/{session_id}/pdfs
```

### Health Check
```http
GET /health
```

## Performance

- Supports 10+ concurrent users per GPU
- Async PDF chunking and embedding generation
- Optimized RAG retrieval (top 5-8 chunks only)
- Streaming responses for low latency

## License

MIT
