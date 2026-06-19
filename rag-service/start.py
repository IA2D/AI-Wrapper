#!/usr/bin/env python3
"""
RAG Service Startup Script
Handles environment setup and graceful shutdown.
"""

import os
import sys
import signal
import argparse
from pathlib import Path


def load_root_env():
    """Load ../.env when running the RAG service directly."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_root_env()

def check_dependencies():
    """Check if all required dependencies are installed."""
    try:
        import fastapi
        import uvicorn
        import qdrant_client
        import fitz  # PyMuPDF
        import httpx
        print("✓ All dependencies are installed")
        return True
    except ImportError as e:
        print(f"✗ Missing dependency: {e}")
        print("Please install requirements: pip install -r requirements.txt")
        return False

def check_qdrant():
    """Check if Qdrant is accessible."""
    try:
        import qdrant_client
        host = os.getenv("QDRANT_HOST", "localhost")
        port = int(os.getenv("QDRANT_PORT", "6333"))
        client = qdrant_client.QdrantClient(host=host, port=port)
        client.get_collections()
        print(f"✓ Qdrant is accessible at {host}:{port}")
        client.close()
        return True
    except Exception as e:
        print(f"⚠ Warning: Could not connect to Qdrant: {e}")
        print("  The service will start but vector storage may not work.")
        print("  Make sure Qdrant is running: docker run -p 6333:6333 qdrant/qdrant")
        return False

def main():
    parser = argparse.ArgumentParser(description="RAG Service Startup")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8001, help="Port to bind to (default: 8001)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development")
    parser.add_argument("--workers", type=int, default=1, help="Number of worker processes (default: 1)")
    args = parser.parse_args()

    print("=" * 60)
    print("RAG Service Startup")
    print("=" * 60)

    # Check dependencies
    if not check_dependencies():
        sys.exit(1)

    # Check Qdrant
    check_qdrant()

    # Setup upload directory
    upload_dir = Path(os.getenv("UPLOAD_DIR", "./uploads"))
    upload_dir.mkdir(parents=True, exist_ok=True)
    print(f"✓ Upload directory: {upload_dir.absolute()}")

    # Show configuration
    print("\nConfiguration:")
    print(f"  LLM Endpoint: {os.getenv('LLM_ENDPOINT') or os.getenv('API_ENDPOINT', 'http://localhost:8000/v1/chat/completions')}")
    print(f"  Embedding Endpoint: {os.getenv('EMBEDDING_ENDPOINT', 'http://localhost:8000/v1/embeddings')}")
    print(f"  Embeddings Enabled: {os.getenv('ENABLE_EMBEDDINGS', 'false')}")
    print(f"  RAG Debug: {os.getenv('RAG_DEBUG', 'false')}")
    print(f"  Log Payloads: {os.getenv('RAG_LOG_PAYLOADS', 'false')}")
    print(f"  Qdrant: {os.getenv('QDRANT_HOST', 'localhost')}:{os.getenv('QDRANT_PORT', '6333')}")
    print(f"  Vector Size: {os.getenv('VECTOR_SIZE', '1024')}")
    print(f"  Chunk Size: {os.getenv('CHUNK_SIZE', '600')}")
    print(f"  Chunk Overlap: {os.getenv('CHUNK_OVERLAP', '100')}")
    print()

    # Start server
    print(f"Starting server on {args.host}:{args.port}")
    print("Press Ctrl+C to stop")
    print("=" * 60)

    import uvicorn
    uvicorn.run(
        "main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        workers=args.workers if not args.reload else 1,
        log_level="info",
    )

if __name__ == "__main__":
    main()
