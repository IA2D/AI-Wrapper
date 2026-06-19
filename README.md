"# AI Chat with RAG System

A production-grade Next.js chat application with integrated RAG (Retrieval-Augmented Generation) system for PDF-aware conversations.

## Features

- **AI Chat**: Streaming responses with thinking mode support
- **PDF Upload**: Upload PDFs directly in chat for context-aware responses
- **RAG Pipeline**: Automatic document chunking, embedding, and retrieval
- **PDF Analysis**: Summarize documents, extract key points
- **PDF Edit Suggestions**: AI-assisted document improvements
- **Image Support**: Upload and analyze images alongside text
- **Session Management**: Persistent chat sessions with attached PDFs
- **Arabic Support**: Full support for Arabic (including Egyptian dialect)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ ChatInterface│  │ MessageInput │  │ PDFContext   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js API Routes                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ /api/chat    │  │/api/upload-pdf│ │/api/create-pdf│     │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Python RAG Service (FastAPI)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ /chat        │  │ /upload-pdf  │  │ /pdf/summarize│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Qdrant Vector DB + LLM API                     │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python RAG service dependencies
cd rag-service
pip install -r requirements.txt
```

### 2. Configure Environment

Update `.env` file:

```env
# LLM API Configuration
API_KEY="your-api-key"
API_ENDPOINT="https://your-llm-endpoint/v1/chat/completions"
MODEL="google/gemma-4-E4B-it"

# RAG Service Configuration
RAG_SERVICE_URL="http://localhost:8001"
NEXT_PUBLIC_RAG_SERVICE_URL="http://localhost:8001"
```

### 3. Start Qdrant (Vector Database)

```bash
docker run -p 6333:6333 -v qdrant_storage:/qdrant/storage qdrant/qdrant
```

### 4. Start the RAG Service

```bash
cd rag-service
python start.py
```

### 5. Start the Next.js App

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## Usage

### Chat with PDF Context

1. Upload a PDF using the document icon in the chat input
2. The PDF is automatically processed and added to chat context
3. Ask questions about the PDF - the AI will use it as primary context
4. Multiple PDFs can be attached to the same session

### PDF Analysis Commands

Ask the AI to:
- "Summarize this PDF"
- "What are the key points?"
- "Explain this document"
- "Edit this PDF" (gets edit suggestions)

### Chat without PDF

Simply type your message without uploading any PDFs - the AI will use general knowledge.

## API Routes

### Chat with RAG
```http
POST /api/chat
Content-Type: application/json

{
  "messages": [...],
  "thinkingMode": false,
  "stream": true,
  "sessionId": "session-123"
}
```

### Upload PDF
```http
POST /api/upload-pdf
Content-Type: multipart/form-data

file: <PDF file>
sessionId: session-123
```

## Project Structure

```
chatbot69/
├── app/
│   ├── api/
│   │   ├── chat/           # Chat API with RAG integration
│   │   ├── upload-pdf/     # PDF upload endpoint
│   │   └── ...
│   └── ...
├── components/
│   ├── ChatInterface.tsx   # Main chat UI with PDF support
│   ├── MessageInput.tsx    # Input with PDF upload button
│   ├── PDFContextChips.tsx # PDF attachment display
│   └── ...
├── services/
│   ├── QwenAPIClient.ts    # LLM API client
│   └── RAGClient.ts        # RAG service client
├── types/
│   └── index.ts            # Type definitions incl. PDFAttachment
├── rag-service/            # Python RAG service
│   ├── main.py             # FastAPI application
│   ├── start.py            # Startup script
│   ├── requirements.txt
│   └── README.md
└── .env                    # Environment variables
```

## Environment Variables

### Next.js App
| Variable | Description |
|----------|-------------|
| `API_KEY` | LLM API key |
| `API_ENDPOINT` | LLM endpoint URL |
| `MODEL` | Default model name |
| `RAG_SERVICE_URL` | RAG service URL (server-side) |
| `NEXT_PUBLIC_RAG_SERVICE_URL` | RAG service URL (client-side) |

### RAG Service
| Variable | Default | Description |
|----------|---------|-------------|
| `QDRANT_HOST` | `localhost` | Qdrant host |
| `QDRANT_PORT` | `6333` | Qdrant port |
| `LLM_ENDPOINT` | - | LLM API endpoint |
| `EMBEDDING_ENDPOINT` | - | Embedding API endpoint |
| `CHUNK_SIZE` | `1200` | Text chunk size in characters |
| `CHUNK_OVERLAP` | `200` | Overlap between chunks in characters |
| `TOP_K_RETRIEVAL` | `12` | Matched chunks to retrieve before neighbor expansion |
| `RAG_CONTEXT_CHAR_LIMIT` | `45000` | Maximum uploaded-document context sent to the LLM |

## Development

### Starting RAG Service for Development

```bash
cd rag-service
python start.py --reload
```

### Running Tests

```bash
npm test
```

## Performance Considerations

- **Concurrent Users**: Supports 10+ concurrent users per GPU
- **PDF Processing**: Async chunking and embedding generation
- **RAG Retrieval**: Top 5-8 chunks retrieved for optimal context
- **Streaming**: Real-time response streaming for low latency

## Technologies

### Frontend
- Next.js 15
- React 19
- TypeScript
- Tailwind CSS

### Backend
- FastAPI
- Qdrant (Vector DB)
- PyMuPDF (PDF parsing)
- HTTPX (Async HTTP client)

### LLM
- vLLM/OpenAI-compatible endpoint
- BAAI/bge-m3 (Embeddings)

## License

MIT
'UPLOAD' 
