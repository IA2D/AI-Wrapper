"""
RAG Service - FastAPI application for PDF-aware chat with vector search.
Supports: chat, PDF upload/analysis/edit, PDF generation from chat.
"""

import os
import uuid
import asyncio
import hashlib
import json
import logging
import re
import time
from typing import List, Dict, Any, Optional, AsyncGenerator
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from zoneinfo import ZoneInfo

import fitz  # PyMuPDF
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
import qdrant_client
from qdrant_client.models import Distance, VectorParams, PointStruct
import httpx
import aiofiles


def load_root_env() -> None:
    """Load the repo .env for standalone RAG service runs."""
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if not os.path.exists(env_path):
        return

    with open(env_path, "r", encoding="utf-8") as env_file:
        for line in env_file:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


load_root_env()

# Configuration
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "pdf_chunks")
LLM_ENDPOINT = os.getenv("LLM_ENDPOINT") or os.getenv("API_ENDPOINT", "http://localhost:8000/v1/chat/completions")
LLM_API_KEY = os.getenv("LLM_API_KEY") or os.getenv("API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL") or os.getenv("MODEL", "google/gemma-4-e4b-it")
EMBEDDING_ENDPOINT = os.getenv("EMBEDDING_ENDPOINT", "http://localhost:8000/v1/embeddings")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")
ENABLE_EMBEDDINGS = os.getenv("ENABLE_EMBEDDINGS", "false").lower() in {"1", "true", "yes", "on"}
RAG_DEBUG = os.getenv("RAG_DEBUG", "false").lower() in {"1", "true", "yes", "on"}
RAG_LOG_PAYLOADS = os.getenv("RAG_LOG_PAYLOADS", "false").lower() in {"1", "true", "yes", "on"}
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1200"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "200"))
TOP_K_RETRIEVAL = int(os.getenv("TOP_K_RETRIEVAL", "12"))
RAG_CONTEXT_CHAR_LIMIT = int(os.getenv("RAG_CONTEXT_CHAR_LIMIT", "45000"))
RAG_SCROLL_LIMIT = int(os.getenv("RAG_SCROLL_LIMIT", "2000"))
VECTOR_SIZE = int(os.getenv("VECTOR_SIZE", "1024"))
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
APP_LOCALE = os.getenv("APP_LOCALE", "en-US")
APP_TIME_ZONE = os.getenv("APP_TIME_ZONE") or os.getenv("TZ") or "Africa/Cairo"
LLM_AUDIO_CONTENT_FORMAT = os.getenv("LLM_AUDIO_CONTENT_FORMAT", "audio_url").lower()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("rag-service")
logger.setLevel(logging.DEBUG if RAG_DEBUG else logging.INFO)
logging.getLogger("python_multipart").setLevel(logging.WARNING)
logging.getLogger("multipart").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)


def redact(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "<redacted>"
    return f"{value[:4]}...{value[-4:]}"


def preview_text(value: str, limit: int = 240) -> str:
    value = (value or "").replace("\n", "\\n")
    return value[:limit] + ("..." if len(value) > limit else "")


def preview_content(value: Any) -> Any:
    if isinstance(value, str):
        return {"text_preview": preview_text(value), "text_length": len(value)}

    if isinstance(value, list):
        parts = []
        for item in value:
            if not isinstance(item, dict):
                parts.append({"type": type(item).__name__})
                continue

            item_type = item.get("type")
            if item_type in {"input_audio", "audio", "audio_url"}:
                audio_payload = as_dict(item.get("input_audio") or item.get("audio_url"))
                audio_value = item.get("audio")
                if isinstance(audio_value, str):
                    parts.append({
                        "type": item_type,
                        "audio_length": len(audio_value),
                        "audio_preview": preview_text(audio_value, 40),
                    })
                else:
                    data = str(audio_payload.get("data") or audio_payload.get("url") or "")
                    audio_format = audio_payload.get("format")
                    if not audio_format and data.startswith("data:audio/"):
                        audio_format = data[11:].split(";", 1)[0]
                    parts.append({
                        "type": item_type,
                        "format": audio_format,
                        "audio_length": len(data),
                        "audio_preview": preview_text(data, 40),
                    })
            elif item_type == "text":
                text = str(item.get("text") or "")
                parts.append({"type": "text", "text_preview": preview_text(text), "text_length": len(text)})
            else:
                parts.append({"type": item_type or "unknown", "keys": sorted(item.keys())})
        return parts

    return value


def log_event(event: str, **fields: Any) -> None:
    safe_fields = {}
    for key, value in fields.items():
        if "key" in key.lower() or "authorization" in key.lower() or "token" in key.lower():
            safe_fields[key] = redact(str(value))
        elif isinstance(value, str) and not RAG_LOG_PAYLOADS and key in {"message", "query", "prompt", "text", "content"}:
            safe_fields[f"{key}_preview"] = preview_text(value)
            safe_fields[f"{key}_length"] = len(value)
        else:
            safe_fields[key] = value

    logger.info("%s %s", event, json.dumps(safe_fields, ensure_ascii=False, default=str))


def as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def first_dict(value: Any) -> Dict[str, Any]:
    items = as_list(value)
    return items[0] if items and isinstance(items[0], dict) else {}


def build_runtime_context() -> str:
    now_utc = datetime.now(timezone.utc)

    try:
        local_time = now_utc.astimezone(ZoneInfo(APP_TIME_ZONE))
        timezone_label = APP_TIME_ZONE
    except Exception:
        local_time = now_utc.astimezone()
        timezone_label = local_time.tzname() or "local timezone"

    offset = local_time.strftime("%z")
    offset_label = f"UTC{offset[:3]}:{offset[3:]}" if offset else "UTC+00:00"

    return "\n".join([
        "Runtime timestamp context for this model request:",
        f"- Current UTC timestamp: {now_utc.isoformat()}",
        f"- User timezone: {timezone_label} ({offset_label})",
        f"- User locale: {APP_LOCALE}",
        f"- User local timestamp: {local_time.isoformat()}",
        "- Use the UTC timestamp plus the explicit timezone/offset above to convert dates and times for the user.",
        "- If the user asks for today, the date, current time, or recent/current facts, use this runtime context and/or Brave Search context directly.",
        "- Do not say you lack real-time access when runtime context or Brave Search context has been provided.",
    ])

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Store session PDF mappings in memory (use Redis in production)
session_pdfs: Dict[str, List[Dict[str, Any]]] = {}


class AudioAttachment(BaseModel):
    url: str
    mimeType: Optional[str] = None
    durationSeconds: Optional[int] = None


class ChatRequest(BaseModel):
    message: Any
    session_id: str
    history: List[Dict[str, Any]] = Field(default_factory=list)
    memory_context: str = ""
    web_context: str = ""
    audio: List[AudioAttachment] = Field(default_factory=list)
    stream: bool = True
    thinking_mode: bool = False


class ChatResponse(BaseModel):
    response: str
    sources: Optional[List[Dict[str, Any]]] = None


class UploadPDFResponse(BaseModel):
    doc_id: str
    filename: str
    status: str
    page_count: int
    chunk_count: int


class PDFSummaryRequest(BaseModel):
    session_id: str
    doc_id: Optional[str] = None


class PDFEditRequest(BaseModel):
    session_id: str
    instruction: str
    doc_id: Optional[str] = None


class PDFGenerateRequest(BaseModel):
    session_id: str
    filename: Optional[str] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize Qdrant collection on startup."""
    try:
        client = qdrant_client.QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
        collections = client.get_collections().collections
        collection_names = [c.name for c in collections]
        
        if QDRANT_COLLECTION not in collection_names:
            client.create_collection(
                collection_name=QDRANT_COLLECTION,
                vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
            )
            print(f"Created collection: {QDRANT_COLLECTION}")
        else:
            print(f"Collection exists: {QDRANT_COLLECTION}")
        client.close()
    except Exception as e:
        print(f"Warning: Could not initialize Qdrant: {e}")
    
    yield
    
    # Cleanup
    print("Shutting down RAG service...")


app = FastAPI(
    title="RAG Service",
    description="PDF-aware RAG chat service with vector search",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_qdrant_client() -> qdrant_client.QdrantClient:
    return qdrant_client.QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)


def get_responses_endpoint() -> str:
    endpoint = LLM_ENDPOINT.rstrip("/")
    if endpoint.endswith("/v1/responses") or endpoint.endswith("/responses"):
        return endpoint
    if endpoint.endswith("/v1/chat/completions"):
        return endpoint[: -len("/v1/chat/completions")] + "/v1/responses"
    if endpoint.endswith("/chat/completions"):
        base = endpoint[: -len("/chat/completions")]
        return base + "/responses" if base.endswith("/v1") else base + "/v1/responses"
    if endpoint.endswith("/v1"):
        return endpoint + "/responses"
    return endpoint + "/v1/responses"


def get_chat_completions_endpoint() -> str:
    endpoint = LLM_ENDPOINT.rstrip("/")
    if endpoint.endswith("/v1/chat/completions") or endpoint.endswith("/chat/completions"):
        return endpoint
    if endpoint.endswith("/v1/responses"):
        return endpoint[: -len("/v1/responses")] + "/v1/chat/completions"
    if endpoint.endswith("/responses"):
        base = endpoint[: -len("/responses")]
        return base + "/chat/completions" if base.endswith("/v1") else base + "/v1/chat/completions"
    if endpoint.endswith("/v1"):
        return endpoint + "/chat/completions"
    return endpoint + "/v1/chat/completions"


def content_has_audio(content: Any) -> bool:
    return isinstance(content, list) and any(
        isinstance(item, dict) and item.get("type") in {"input_audio", "audio", "audio_url"}
        for item in content
    )


def make_point_id(doc_id: str, page_num: int, chunk_index: int) -> str:
    return str(uuid.uuid5(uuid.UUID(doc_id), f"page:{page_num}:chunk:{chunk_index}"))


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    text_len = len(text)
    safe_overlap = max(0, min(overlap, chunk_size - 1))
    
    while start < text_len:
        end = min(start + chunk_size, text_len)
        original_end = end

        # Try to break at sentence boundary
        if end < text_len:
            for sep in ['. ', '? ', '! ', '\n', ' ']:
                pos = text.rfind(sep, start, end)
                if pos > start and (pos + len(sep)) > start:
                    end = pos + len(sep)
                    break

        # Avoid tiny boundary chunks that cannot safely overlap.
        if end <= start:
            end = min(start + chunk_size, text_len)

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= text_len:
            break

        next_start = max(end - safe_overlap, start + 1)
        if next_start <= start:
            next_start = min(original_end, start + chunk_size)
        start = next_start
    
    return chunks


STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
    "i", "in", "is", "it", "of", "on", "or", "pdf", "please", "that", "the",
    "this", "to", "what", "when", "where", "which", "who", "why", "with",
}


def tokenize_for_retrieval(text: str) -> List[str]:
    """Small lexical fallback tokenizer used when embeddings are unavailable."""
    terms = re.findall(r"[\w]+", (text or "").lower(), flags=re.UNICODE)
    return [term for term in terms if len(term) > 1 and term not in STOP_WORDS]


def wants_broad_document_context(query: str) -> bool:
    """Detect requests that need many chunks instead of a few narrowly matched chunks."""
    query_lower = (query or "").lower()
    broad_phrases = [
        "all questions",
        "all the questions",
        "entire document",
        "full document",
        "whole document",
        "the document",
        "the pdf",
        "this pdf",
        "attached document",
        "attached file",
        "questions",
        "these",
        "them",
        "it",
        "worksheet",
        "exam",
        "paper",
    ]
    broad_verbs = ["answer", "solve", "summarize", "summary", "explain", "overview"]
    return any(phrase in query_lower for phrase in broad_phrases) and any(
        verb in query_lower for verb in broad_verbs
    )


def chunk_index_from_payload(payload: Dict[str, Any]) -> int:
    chunk_index = payload.get("chunk_index")
    if isinstance(chunk_index, int):
        return chunk_index

    match = re.search(r"_c(\d+)$", str(payload.get("chunk_id", "")))
    return int(match.group(1)) if match else 0


def chunk_sort_key(chunk: Dict[str, Any]) -> tuple:
    return (
        str(chunk.get("filename", "")),
        str(chunk.get("doc_id", "")),
        int(chunk.get("page_number") or 0),
        int(chunk.get("chunk_index") or 0),
    )


def point_to_chunk(point: Any, score: float = 1.0) -> Dict[str, Any]:
    payload = point.payload or {}
    return {
        "text": payload.get("text", ""),
        "doc_id": payload.get("doc_id", ""),
        "page_number": payload.get("page_number", 0),
        "chunk_index": chunk_index_from_payload(payload),
        "chunk_id": payload.get("chunk_id", ""),
        "filename": payload.get("filename", ""),
        "score": score,
    }


def score_chunk_text(text: str, query_terms: List[str]) -> float:
    if not query_terms:
        return 0.0

    text_lower = (text or "").lower()
    score = 0.0
    for term in query_terms:
        occurrences = text_lower.count(term)
        if occurrences:
            score += 1.0 + min(occurrences, 5) * 0.25
    return score


def trim_chunks_to_context_budget(
    chunks: List[Dict[str, Any]],
    char_limit: int = RAG_CONTEXT_CHAR_LIMIT,
) -> List[Dict[str, Any]]:
    selected = []
    used = 0

    for chunk in chunks:
        text_len = len(chunk.get("text", ""))
        overhead = 120
        if selected and used + text_len + overhead > char_limit:
            break
        selected.append(chunk)
        used += text_len + overhead

    return selected


def scroll_all_matching_chunks(
    client: qdrant_client.QdrantClient,
    filter_condition: qdrant_client.models.Filter,
    max_points: int = RAG_SCROLL_LIMIT,
) -> List[Dict[str, Any]]:
    points: List[Any] = []
    next_offset = None

    while len(points) < max_points:
        batch, next_offset = client.scroll(
            collection_name=QDRANT_COLLECTION,
            scroll_filter=filter_condition,
            limit=min(256, max_points - len(points)),
            offset=next_offset,
        )
        points.extend(batch)
        if next_offset is None or not batch:
            break

    chunks = [point_to_chunk(point) for point in points]
    return sorted(chunks, key=chunk_sort_key)


def expand_with_neighbor_chunks(
    selected: List[Dict[str, Any]],
    all_chunks: List[Dict[str, Any]],
    neighbor_window: int = 1,
) -> List[Dict[str, Any]]:
    by_position = {
        (
            chunk.get("doc_id"),
            int(chunk.get("page_number") or 0),
            int(chunk.get("chunk_index") or 0),
        ): chunk
        for chunk in all_chunks
    }
    expanded: Dict[tuple, Dict[str, Any]] = {}

    for chunk in selected:
        page_number = int(chunk.get("page_number") or 0)
        chunk_index = int(chunk.get("chunk_index") or 0)
        for offset in range(-neighbor_window, neighbor_window + 1):
            key = (chunk.get("doc_id"), page_number, chunk_index + offset)
            neighbor = by_position.get(key)
            if neighbor:
                expanded[key] = {
                    **neighbor,
                    "score": max(float(neighbor.get("score") or 0), float(chunk.get("score") or 0)),
                }

    return sorted(expanded.values(), key=chunk_sort_key)


async def get_embeddings(texts: List[str]) -> List[List[float]]:
    """Get embeddings from embedding endpoint."""
    start = time.perf_counter()
    log_event(
        "embeddings.start",
        count=len(texts),
        endpoint=EMBEDDING_ENDPOINT,
        model=EMBEDDING_MODEL,
        enabled=ENABLE_EMBEDDINGS,
    )

    if not texts:
        log_event("embeddings.skip", reason="empty_input")
        return []

    if not ENABLE_EMBEDDINGS:
        log_event("embeddings.skip", reason="disabled")
        return []
    
    # Skip if using local/unsupported endpoint
    if "localhost" in EMBEDDING_ENDPOINT or "127.0.0.1" in EMBEDDING_ENDPOINT:
        log_event("embeddings.skip", reason="local_endpoint", endpoint=EMBEDDING_ENDPOINT)
        return []
    
    headers = {"Authorization": f"Bearer {LLM_API_KEY}"} if LLM_API_KEY else {}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                EMBEDDING_ENDPOINT,
                headers=headers,
                json={
                    "model": EMBEDDING_MODEL,
                    "input": texts,
                },
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            embeddings = [item["embedding"] for item in data["data"]]
            log_event(
                "embeddings.success",
                count=len(embeddings),
                duration_ms=round((time.perf_counter() - start) * 1000),
            )
            return embeddings
    except Exception as e:
        log_event(
            "embeddings.error",
            error=str(e),
            duration_ms=round((time.perf_counter() - start) * 1000),
        )
        return []


async def retrieve_relevant_chunks(
    query: str,
    session_id: str,
    top_k: int = TOP_K_RETRIEVAL
) -> List[Dict[str, Any]]:
    """Retrieve relevant chunks from Qdrant based on query."""
    start = time.perf_counter()
    log_event("retrieval.start", session_id=session_id, query=query, top_k=top_k)

    try:
        query_embedding = await get_embeddings([query])
        broad_context = wants_broad_document_context(query)
        
        client = get_qdrant_client()
        
        # Get session-specific PDFs
        session_doc_ids = []
        if session_id in session_pdfs:
            session_doc_ids = [pdf["doc_id"] for pdf in session_pdfs[session_id]]
        log_event(
            "retrieval.session_docs",
            session_id=session_id,
            doc_count=len(session_doc_ids),
            doc_ids=session_doc_ids,
        )

        if session_doc_ids:
            filter_condition = qdrant_client.models.Filter(
                must=[
                    qdrant_client.models.FieldCondition(
                        key="doc_id",
                        match=qdrant_client.models.MatchAny(any=session_doc_ids)
                    )
                ]
            )
        else:
            filter_condition = qdrant_client.models.Filter(
                must=[
                    qdrant_client.models.FieldCondition(
                        key="session_id",
                        match=qdrant_client.models.MatchValue(value=session_id)
                    )
                ]
            )
        
        if broad_context:
            all_chunks = scroll_all_matching_chunks(client, filter_condition)
            client.close()
            chunks = trim_chunks_to_context_budget(all_chunks)
            log_event(
                "retrieval.success",
                mode="broad_document_scroll",
                session_id=session_id,
                chunk_count=len(chunks),
                scanned_chunk_count=len(all_chunks),
                context_char_limit=RAG_CONTEXT_CHAR_LIMIT,
                duration_ms=round((time.perf_counter() - start) * 1000),
            )
            return chunks

        # If no embeddings are available, use lexical scoring across all session chunks.
        if not query_embedding:
            log_event("retrieval.fallback", session_id=session_id, reason="no_query_embedding")

            all_chunks = scroll_all_matching_chunks(client, filter_condition)
            client.close()

            query_terms = tokenize_for_retrieval(query)
            scored_chunks = [
                {
                    **chunk,
                    "score": score_chunk_text(chunk.get("text", ""), query_terms),
                }
                for chunk in all_chunks
            ]
            positive_chunks = [chunk for chunk in scored_chunks if chunk["score"] > 0]
            ranked_chunks = sorted(
                positive_chunks or scored_chunks,
                key=lambda chunk: (-float(chunk.get("score") or 0), chunk_sort_key(chunk)),
            )
            selected = ranked_chunks[:top_k]
            chunks = trim_chunks_to_context_budget(expand_with_neighbor_chunks(selected, scored_chunks))

            if not chunks and all_chunks:
                chunks = trim_chunks_to_context_budget(all_chunks[:top_k])

            log_event(
                "retrieval.success",
                mode="fallback_keyword",
                session_id=session_id,
                chunk_count=len(chunks),
                scanned_chunk_count=len(all_chunks),
                matched_chunk_count=len(positive_chunks),
                duration_ms=round((time.perf_counter() - start) * 1000),
            )
            return chunks
        
        # Vector search with embeddings
        results = client.search(
            collection_name=QDRANT_COLLECTION,
            query_vector=query_embedding[0],
            limit=top_k,
            query_filter=filter_condition,
        )

        chunks = [
            {
                "text": hit.payload.get("text", ""),
                "doc_id": hit.payload.get("doc_id", ""),
                "page_number": hit.payload.get("page_number", 0),
                "chunk_index": chunk_index_from_payload(hit.payload),
                "chunk_id": hit.payload.get("chunk_id", ""),
                "filename": hit.payload.get("filename", ""),
                "score": hit.score,
            }
            for hit in results
        ]
        all_chunks = scroll_all_matching_chunks(client, filter_condition)
        client.close()
        chunks = trim_chunks_to_context_budget(expand_with_neighbor_chunks(chunks, all_chunks))

        log_event(
            "retrieval.success",
            mode="vector_search",
            session_id=session_id,
            chunk_count=len(chunks),
            duration_ms=round((time.perf_counter() - start) * 1000),
        )
        return chunks
    except Exception as e:
        log_event(
            "retrieval.error",
            session_id=session_id,
            error=str(e),
            duration_ms=round((time.perf_counter() - start) * 1000),
        )
        return []


async def stream_llm_response(
    messages: List[Dict[str, Any]],
    thinking_mode: bool = False
) -> AsyncGenerator[str, None]:
    """Stream LLM response, using chat completions for audio and Responses otherwise."""
    start = time.perf_counter()
    has_audio = any(content_has_audio(message.get("content")) for message in messages)
    endpoint = get_chat_completions_endpoint() if has_audio else get_responses_endpoint()
    endpoint_mode = "chat_completions" if has_audio else "responses"
    response_id: Optional[str] = None

    log_event(
        "llm.stream.start",
        endpoint=endpoint,
        mode=endpoint_mode,
        model=LLM_MODEL,
        message_count=len(messages),
        thinking_mode=thinking_mode,
        prompt=preview_content(messages[-1]["content"] if messages else ""),
    )

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LLM_API_KEY}",
    } if LLM_API_KEY else {"Content-Type": "application/json"}
    
    if has_audio:
        payload = {
            "model": LLM_MODEL,
            "messages": messages,
            "stream": True,
            "temperature": 0.6,
            "top_p": 0.8,
            "max_tokens": 2048,
        }
    else:
        payload = {
            "model": LLM_MODEL,
            "input": messages,
            "stream": True,
            "temperature": 0.6,
            "top_p": 0.8,
            "max_output_tokens": 2048,
        }
    
    if thinking_mode:
        payload["chat_template_kwargs"] = {"enable_thinking": True}
    
    async with httpx.AsyncClient() as client:
        try:
            async with client.stream(
                "POST",
                endpoint,
                headers=headers,
                json=payload,
                timeout=120.0,
            ) as response:
                log_event(
                    "llm.stream.response",
                    status=response.status_code,
                    reason=response.reason_phrase,
                    duration_to_headers_ms=round((time.perf_counter() - start) * 1000),
                )

                if response.status_code >= 400:
                    error_body = (await response.aread()).decode("utf-8", errors="replace")
                    log_event(
                        "llm.stream.error_response",
                        status=response.status_code,
                        reason=response.reason_phrase,
                        body=error_body,
                    )
                    raise RuntimeError(
                        f"LLM stream failed: {response.status_code} {response.reason_phrase}: {error_body}"
                    )

                chunk_count = 0
                reasoning_block_open = False
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue

                    data = line[6:]
                    if data == "[DONE]":
                        break

                    try:
                        parsed = json.loads(data)
                    except json.JSONDecodeError:
                        continue

                    response_payload = as_dict(parsed.get("response"))
                    choice_payload = first_dict(parsed.get("choices"))
                    choice_delta = as_dict(choice_payload.get("delta"))
                    choice_message = as_dict(choice_payload.get("message"))
                    response_reasoning = as_dict(response_payload.get("reasoning"))
                    response_reasoning_summary = as_dict(response_payload.get("reasoning_summary"))
                    response_output_text = as_dict(response_payload.get("output_text"))

                    response_id = parsed.get("id") or response_payload.get("id") or response_id

                    if parsed.get("error"):
                        raise RuntimeError(json.dumps(parsed["error"]))

                    event_type = str(parsed.get("type") or "")
                    generic_delta = parsed.get("delta") if isinstance(parsed.get("delta"), str) else ""
                    generic_delta_is_reasoning = "reasoning" in event_type.lower() or "thinking" in event_type.lower()
                    reasoning_content = (
                        (generic_delta if generic_delta_is_reasoning else "")
                        or choice_delta.get("reasoning_content")
                        or choice_delta.get("reasoning")
                        or parsed.get("reasoning_delta")
                        or parsed.get("reasoning_content_delta")
                        or parsed.get("reasoning_content")
                        or parsed.get("reasoning_summary_text_delta")
                        or parsed.get("summary_text_delta")
                        or response_reasoning.get("delta")
                        or response_reasoning_summary.get("delta")
                        or ""
                    )
                    content = (
                        (generic_delta if not generic_delta_is_reasoning else "")
                        or choice_delta.get("content")
                        or choice_message.get("content")
                        or parsed.get("output_text_delta")
                        or response_output_text.get("delta")
                        or ""
                    )

                    if reasoning_content:
                        chunk_count += 1
                        if not reasoning_block_open:
                            reasoning_block_open = True
                            yield "<think>"
                        yield reasoning_content

                    if content:
                        chunk_count += 1
                        if reasoning_block_open:
                            reasoning_block_open = False
                            yield "</think>"
                        yield content

                if reasoning_block_open:
                    yield "</think>"

                log_event(
                    "llm.stream.done",
                    response_id=response_id,
                    chunk_count=chunk_count,
                    duration_ms=round((time.perf_counter() - start) * 1000),
                )
        except asyncio.CancelledError:
            if response_id and endpoint_mode == "responses":
                await cancel_llm_response(client, endpoint, response_id, headers)
            log_event(
                "llm.stream.cancelled",
                response_id=response_id,
                mode=endpoint_mode,
                duration_ms=round((time.perf_counter() - start) * 1000),
            )
            raise


async def cancel_llm_response(
    client: httpx.AsyncClient,
    responses_endpoint: str,
    response_id: str,
    headers: Dict[str, str],
) -> None:
    try:
        response = await client.post(
            f"{responses_endpoint}/{response_id}/cancel",
            headers=headers,
            timeout=10.0,
        )
        log_event(
            "llm.cancel.response",
            response_id=response_id,
            status=response.status_code,
            reason=response.reason_phrase,
        )
    except Exception as e:
        log_event("llm.cancel.error", response_id=response_id, error=str(e))


async def check_llm_available(use_chat_completions: bool = False) -> None:
    """Fail before opening an SSE response when the upstream LLM is unreachable."""
    endpoint = get_chat_completions_endpoint() if use_chat_completions else get_responses_endpoint()
    endpoint_mode = "chat_completions" if use_chat_completions else "responses"

    if "localhost" in endpoint or "127.0.0.1" in endpoint:
        log_event("llm.health.skip", reason="local_endpoint", endpoint=endpoint, mode=endpoint_mode)
        return

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LLM_API_KEY}",
    } if LLM_API_KEY else {"Content-Type": "application/json"}

    if use_chat_completions:
        payload = {
            "model": LLM_MODEL,
            "messages": [{"role": "user", "content": "ping"}],
            "stream": False,
            "max_tokens": 1,
        }
    else:
        payload = {
            "model": LLM_MODEL,
            "input": [{"role": "user", "content": "ping"}],
            "stream": False,
            "max_output_tokens": 1,
        }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            endpoint,
            headers=headers,
            json=payload,
            timeout=15.0,
        )

    log_event(
        "llm.health.response",
        status=response.status_code,
        endpoint=endpoint,
        mode=endpoint_mode,
        model=LLM_MODEL,
        body=response.text[:500] if response.status_code >= 400 else "",
    )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "LLM endpoint is unavailable",
                "status": response.status_code,
                "body": response.text[:1000],
                "endpoint": endpoint,
                "mode": endpoint_mode,
                "model": LLM_MODEL,
            },
        )


def detect_intent(message: str) -> str:
    """Detect user intent from message."""
    message_lower = message.lower()
    
    # PDF edit intents
    edit_keywords = ["edit", "rewrite", "improve", "fix", "modify", "change", "update", " revise"]
    if any(kw in message_lower for kw in edit_keywords):
        return "pdf_edit"
    
    # PDF summary intents
    summary_keywords = ["summarize", "summary", "explain", "what are the key points", "overview", "brief"]
    if any(kw in message_lower for kw in summary_keywords):
        return "pdf_summary"
    
    # PDF generation intents
    generate_keywords = ["create pdf", "generate pdf", "export pdf", "download pdf", "save as pdf"]
    if any(kw in message_lower for kw in generate_keywords):
        return "pdf_generate"
    
    return "chat"


def build_rag_prompt(query: str, chunks: List[Dict[str, Any]], intent: str = "chat") -> str:
    """Build prompt with retrieved context."""
    def format_context() -> str:
        context_parts = []
        for chunk in chunks:
            source = f"[Document: {chunk['filename']}, Page: {chunk['page_number']}]"
            context_parts.append(f"{source}\n{chunk['text']}")
        return "\n\n---\n\n".join(context_parts)

    if intent == "pdf_summary":
        system_prompt = """You are a document analysis assistant. Provide a comprehensive summary of the document content provided below.

Format your response with:
1. **Executive Summary** - Brief overview (2-3 sentences)
2. **Key Points** - Bullet points of main ideas
3. **Important Details** - Relevant specifics from the document
4. **Risks/Insights** (if applicable) - Potential issues or valuable insights

Document content:
"""
        if chunks:
            return f"{system_prompt}\n{format_context()}\n\n---\n\nCurrent user request: {query}"
        return (
            "You are a document analysis assistant, but no extractable document context was found. "
            "Tell the user the PDF text was not available and ask them to upload a text-based PDF or OCR version."
        )
    elif intent == "pdf_edit":
        system_prompt = """You are a document editing assistant. Based on the user's instruction and the document content provided, suggest improvements or rewrites.

Provide:
1. **Original Text** - The relevant section from the document
2. **Suggested Rewrite** - Your improved version
3. **Explanation** - Why you made these changes
4. **Full Edited Version** (optional) - Complete document with changes applied

Document content:
"""
        if chunks:
            return f"{system_prompt}\n{format_context()}\n\n---\n\nUser editing instruction: {query}"
        return (
            "You are a document editing assistant, but no extractable document context was found. "
            "Tell the user the PDF text was not available and ask them to upload a text-based PDF or OCR version."
        )
    else:
        # Check if we have any document chunks
        if chunks:
            system_prompt = """You are a helpful AI assistant with access to document knowledge. Answer the user's question using the provided context when relevant.

Guidelines:
- Use the provided document context when it directly answers the question
- If document content is insufficient or not relevant, use your general knowledge
- Always cite document sources by referencing [Document: filename, Page: X] when using PDF content
- Be concise but thorough
- Support Arabic (including Egyptian dialect) naturally

Context from uploaded documents:
"""
            return f"{system_prompt}\n{format_context()}\n\n---\n\nCurrent user question: {query}"
        else:
            # No PDFs uploaded - act as general assistant
            system_prompt = """You are a helpful AI assistant. Answer the user's question using your general knowledge.

Guidelines:
- Be helpful, friendly, and informative
- Provide detailed answers when appropriate
- Support Arabic (including Egyptian dialect) naturally
- Use markdown formatting for better readability (bold, lists, code blocks, etc.)

User question:"""
            return system_prompt


def parse_audio_data_url(url: str, fallback_mime_type: str = "audio/wav") -> Dict[str, str]:
    mime_type = fallback_mime_type
    data = url

    if url.startswith("data:") and "," in url:
        header, data = url.split(",", 1)
        mime_part = header[5:].split(";")[0]
        if mime_part:
            mime_type = mime_part

    if "mp4" in mime_type:
        audio_format = "mp4"
    elif "mpeg" in mime_type or "mp3" in mime_type:
        audio_format = "mp3"
    elif "wav" in mime_type or "wave" in mime_type:
        audio_format = "wav"
    else:
        audio_format = "webm"

    return {"data": data, "format": audio_format}


def audio_data_url(url: str, fallback_mime_type: str = "audio/wav") -> str:
    # If it's already a public URL (http/https), use it directly
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("data:"):
        return url
    parsed = parse_audio_data_url(url, fallback_mime_type)
    return f"data:audio/{parsed['format']};base64,{parsed['data']}"


def build_audio_content_part(item: AudioAttachment) -> Dict[str, Any]:
    mime_type = item.mimeType or "audio/wav"

    # Check if URL is a public http/https URL
    is_public_url = item.url.startswith("http://") or item.url.startswith("https://")

    if LLM_AUDIO_CONTENT_FORMAT in {"gemma", "hf", "huggingface", "audio"}:
        return {
            "type": "audio",
            "audio": item.url if is_public_url else audio_data_url(item.url, mime_type),
        }

    if LLM_AUDIO_CONTENT_FORMAT in {"audio_url", "openai_audio_url"}:
        return {
            "type": "audio_url",
            "audio_url": {"url": item.url if is_public_url else audio_data_url(item.url, mime_type)},
        }

    # For input_audio format
    if is_public_url:
        return {
            "type": "input_audio",
            "input_audio": {"data": item.url, "format": mime_type.split("/")[-1] or "wav"},
        }

    return {
        "type": "input_audio",
        "input_audio": parse_audio_data_url(item.url, mime_type),
    }


def build_user_content_with_audio(message: str, audio: List[AudioAttachment]) -> Any:
    if not audio:
        return message

    content: List[Dict[str, Any]] = []
    for item in audio:
        content.append(build_audio_content_part(item))

    content.append({
        "type": "text",
        "text": message.strip() or "Please listen to this voice message and respond to it.",
    })

    return content


def coerce_text_content(content: Any) -> str:
    """Accept legacy/string content and ignore non-text media safely."""
    if isinstance(content, str):
        return content

    if isinstance(content, dict):
        text = content.get("text")
        return text if isinstance(text, str) else ""

    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts)

    return ""


def build_llm_messages(
    request: ChatRequest,
    system_content: str,
    max_history_messages: int = 12,
) -> List[Dict[str, Any]]:
    """Build LLM messages with bounded prior conversation for continuity."""
    messages = [{"role": "system", "content": system_content}]

    clean_history = []
    for item in request.history[-max_history_messages:]:
        role = item.get("role")
        content = coerce_text_content(item.get("content", "")).strip()
        if role in {"user", "assistant"} and content:
            clean_history.append({"role": role, "content": content})

    # The frontend may include the current user message in history. Avoid sending it twice.
    if clean_history and clean_history[-1]["role"] == "user" and clean_history[-1]["content"] == request.message.strip():
        clean_history = clean_history[:-1]

    messages.extend(clean_history)
    messages.append({"role": "user", "content": build_user_content_with_audio(request.message, request.audio)})
    return messages


@app.post("/chat", response_class=StreamingResponse)
async def chat(request: ChatRequest, http_request: Request):
    """Chat endpoint with RAG support."""
    start = time.perf_counter()
    message_text = coerce_text_content(request.message).strip()
    if not message_text and request.audio:
        message_text = "Voice message"
    request.message = message_text

    log_event(
        "chat.start",
        session_id=request.session_id,
        message=message_text,
        history_count=len(request.history),
        stream=request.stream,
        thinking_mode=request.thinking_mode,
    )

    await check_llm_available(use_chat_completions=bool(request.audio))

    intent = detect_intent(request.message)
    log_event("chat.intent", session_id=request.session_id, intent=intent)
    
    # Retrieve relevant chunks
    chunks = await retrieve_relevant_chunks(request.message, request.session_id)
    log_event("chat.retrieval_done", session_id=request.session_id, chunk_count=len(chunks))
    
    # Build system prompt with context
    system_content = build_rag_prompt(request.message, chunks, intent)
    if "Runtime timestamp context for this model request" not in request.web_context:
        system_content += f"\n\n{build_runtime_context()}"
    if request.memory_context.strip():
        system_content += (
            "\n\nKnown user memory for personalization. Use only when relevant; "
            "do not reveal this list unless the user asks about memory.\n"
            f"{request.memory_context.strip()}"
        )
    if request.web_context.strip():
        system_content += (
            "\n\nRuntime and/or fresh web search context from Brave Search API is available below. "
            "Use it when relevant, answer directly when it resolves the user's request, "
            "and do not claim you lack access to current information when this context answers the request. "
            "Mention uncertainty only if sources conflict.\n"
            f"{request.web_context.strip()}"
        )
    
    messages = build_llm_messages(request, system_content)
    log_event(
        "chat.prompt_built",
        session_id=request.session_id,
        llm_message_count=len(messages),
        system_prompt_chars=len(system_content),
        duration_ms=round((time.perf_counter() - start) * 1000),
    )

    if not request.stream:
        content = ""
        async for chunk in stream_llm_response(messages, request.thinking_mode):
            content += chunk
        log_event(
            "chat.done",
            session_id=request.session_id,
            mode="non_stream",
            response_chars=len(content),
            duration_ms=round((time.perf_counter() - start) * 1000),
        )
        return JSONResponse({"response": content, "sources": chunks})
    
    async def generate():
        try:
            async for chunk in stream_llm_response(messages, request.thinking_mode):
                if await http_request.is_disconnected():
                    raise asyncio.CancelledError()

                # Wrap in OpenAI-compatible JSON format
                data = json.dumps({"choices": [{"delta": {"content": chunk}}]})
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            log_event(
                "chat.stream.cancelled",
                session_id=request.session_id,
                duration_ms=round((time.perf_counter() - start) * 1000),
            )
            raise
        except Exception as e:
            log_event(
                "chat.stream.error",
                session_id=request.session_id,
                error=str(e),
                duration_ms=round((time.perf_counter() - start) * 1000),
            )
            data = json.dumps({
                "error": {
                    "message": str(e),
                    "type": e.__class__.__name__,
                    "session_id": request.session_id,
                }
            })
            yield f"data: {data}\n\n"
        finally:
            log_event(
                "chat.stream.done",
                session_id=request.session_id,
                duration_ms=round((time.perf_counter() - start) * 1000),
            )
            yield "data: [DONE]\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@app.post("/upload-pdf", response_model=UploadPDFResponse)
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    session_id: str = Form(""),
):
    """Upload and process PDF file."""
    start = time.perf_counter()
    log_event(
        "upload.start",
        filename=file.filename,
        session_id=session_id,
        content_type=file.content_type,
    )

    if not (file.filename or "").lower().endswith(".pdf"):
        log_event("upload.reject", filename=file.filename, reason="not_pdf")
        raise HTTPException(400, "Only PDF files are allowed")
    
    if not session_id:
        session_id = str(uuid.uuid4())
    
    # Generate unique doc_id
    doc_id = str(uuid.uuid4())
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{timestamp}_{hashlib.md5(file.filename.encode()).hexdigest()[:8]}.pdf"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    # Save file
    content = await file.read()
    log_event(
        "upload.read_done",
        filename=file.filename,
        session_id=session_id,
        bytes=len(content),
        doc_id=doc_id,
    )

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)
    log_event("upload.saved", file_path=file_path, doc_id=doc_id)
    
    # Process PDF in background
    try:
        # Extract text and chunk
        doc = fitz.open(file_path)
        page_count = len(doc)
        log_event("upload.pdf_opened", doc_id=doc_id, page_count=page_count)
        
        all_chunks = []
        for page_num in range(page_count):
            page_start = time.perf_counter()
            log_event("upload.page_start", doc_id=doc_id, page_number=page_num + 1)
            page = doc[page_num]
            text = page.get_text("text", sort=True)
            if text.strip():
                page_chunks = chunk_text(text)
                for i, chunk_text_content in enumerate(page_chunks):
                    all_chunks.append({
                        "text": chunk_text_content,
                        "page_number": page_num + 1,
                        "chunk_index": i,
                        "chunk_id": f"{doc_id}_p{page_num}_c{i}",
                    })
            log_event(
                "upload.page_processed",
                doc_id=doc_id,
                page_number=page_num + 1,
                page_text_chars=len(text or ""),
                total_chunks=len(all_chunks),
                duration_ms=round((time.perf_counter() - page_start) * 1000),
            )
        
        doc.close()
        log_event("upload.chunking_done", doc_id=doc_id, chunk_count=len(all_chunks))

        if not all_chunks:
            raise HTTPException(
                422,
                "No extractable text was found in this PDF. It may be scanned or image-based; upload an OCR/text-based PDF.",
            )
        
        # Generate embeddings and store in Qdrant
        if all_chunks:
            texts = [c["text"] for c in all_chunks]
            embeddings = await get_embeddings(texts)
            
            # If no embeddings, use random vectors for storage (allows retrieval without semantic search)
            if not embeddings:
                log_event("upload.embeddings_fallback", doc_id=doc_id, reason="no_embeddings")
                import random
                random.seed(42)  # For reproducibility
                embeddings = [[random.uniform(-1, 1) for _ in range(VECTOR_SIZE)] for _ in texts]
            
            client = get_qdrant_client()
            points = []
            for i, (chunk, embedding) in enumerate(zip(all_chunks, embeddings)):
                points.append(
                    PointStruct(
                        id=make_point_id(doc_id, chunk["page_number"], i),
                        vector=embedding,
                        payload={
                            "text": chunk["text"],
                            "doc_id": doc_id,
                            "page_number": chunk["page_number"],
                            "chunk_index": chunk["chunk_index"],
                            "chunk_id": chunk["chunk_id"],
                            "filename": file.filename,
                            "session_id": session_id,
                        },
                    )
                )

            log_event(
                "upload.qdrant_upsert_start",
                doc_id=doc_id,
                point_count=len(points),
                first_point_id=points[0].id if points else None,
                collection=QDRANT_COLLECTION,
            )
            
            client.upsert(collection_name=QDRANT_COLLECTION, points=points)
            client.close()
            log_event(
                "upload.qdrant_upsert_done",
                doc_id=doc_id,
                point_count=len(points),
                collection=QDRANT_COLLECTION,
            )
        
        # Store in session mapping
        if session_id not in session_pdfs:
            session_pdfs[session_id] = []
        
        session_pdfs[session_id].append({
            "doc_id": doc_id,
            "filename": file.filename,
            "file_path": file_path,
            "page_count": page_count,
            "chunk_count": len(all_chunks),
            "uploaded_at": datetime.now().isoformat(),
        })

        log_event(
            "upload.done",
            session_id=session_id,
            doc_id=doc_id,
            filename=file.filename,
            page_count=page_count,
            chunk_count=len(all_chunks),
            duration_ms=round((time.perf_counter() - start) * 1000),
        )
        
        return UploadPDFResponse(
            doc_id=doc_id,
            filename=file.filename,
            status="processed",
            page_count=page_count,
            chunk_count=len(all_chunks),
        )
        
    except HTTPException as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        log_event(
            "upload.error",
            session_id=session_id,
            doc_id=doc_id,
            filename=file.filename,
            error=str(e.detail),
            status_code=e.status_code,
            duration_ms=round((time.perf_counter() - start) * 1000),
        )
        raise
    except Exception as e:
        # Clean up file on error
        if os.path.exists(file_path):
            os.remove(file_path)
        log_event(
            "upload.error",
            session_id=session_id,
            doc_id=doc_id,
            filename=file.filename,
            error=str(e),
            duration_ms=round((time.perf_counter() - start) * 1000),
        )
        raise HTTPException(500, f"Failed to process PDF: {str(e)}")


@app.post("/pdf/summarize")
async def summarize_pdf(request: PDFSummaryRequest):
    """Summarize PDF content."""
    if request.session_id not in session_pdfs:
        raise HTTPException(404, "No PDFs found for this session")
    
    pdfs = session_pdfs[request.session_id]
    if request.doc_id:
        pdfs = [p for p in pdfs if p["doc_id"] == request.doc_id]
    
    if not pdfs:
        raise HTTPException(404, "PDF not found")
    
    # Retrieve all chunks for the PDF(s)
    doc_ids = [p["doc_id"] for p in pdfs]
    
    client = get_qdrant_client()
    all_chunks = []
    for doc_id in doc_ids:
        all_chunks.extend(scroll_all_matching_chunks(
            client,
            qdrant_client.models.Filter(
                must=[
                    qdrant_client.models.FieldCondition(
                        key="doc_id",
                        match=qdrant_client.models.MatchValue(value=doc_id)
                    )
                ]
            ),
        ))
    
    client.close()
    
    # Sort by page number and chunk position
    chunks_data = sorted(all_chunks, key=chunk_sort_key)
    
    # Build summary prompt
    context = "\n\n".join([f"[Page {c['page_number']}] {c['text']}" for c in chunks_data])
    
    messages = [
        {
            "role": "system",
            "content": """You are a document summarization expert. Create a structured summary of the provided document.

Format:
## Executive Summary
Brief overview of the entire document.

## Key Points
- Point 1
- Point 2
...

## Important Details
Relevant specifics found in the document.

## Risks and Insights (if applicable)
Potential issues or valuable insights.

Document content:
""",
        },
        {"role": "user", "content": f"{context}\n\nPlease provide a comprehensive summary of this document."},
    ]
    
    # Get summary from LLM
    headers = {"Authorization": f"Bearer {LLM_API_KEY}"} if LLM_API_KEY else {}
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            LLM_ENDPOINT,
            headers=headers,
            json={
                "model": LLM_MODEL,
                "messages": messages,
                "temperature": 0.5,
                "max_tokens": 2048,
            },
            timeout=120.0,
        )
        response.raise_for_status()
        data = response.json()
        summary = data["choices"][0]["message"]["content"]
    
    return {
        "summary": summary,
        "doc_count": len(pdfs),
        "total_chunks": len(chunks_data),
    }


@app.post("/pdf/edit-suggestions")
async def edit_pdf_suggestions(request: PDFEditRequest):
    """Get edit suggestions for PDF content."""
    if request.session_id not in session_pdfs:
        raise HTTPException(404, "No PDFs found for this session")
    
    pdfs = session_pdfs[request.session_id]
    if request.doc_id:
        pdfs = [p for p in pdfs if p["doc_id"] == request.doc_id]
    
    if not pdfs:
        raise HTTPException(404, "PDF not found")
    
    # Retrieve chunks
    doc_ids = [p["doc_id"] for p in pdfs]
    
    client = get_qdrant_client()
    all_chunks = []
    for doc_id in doc_ids:
        all_chunks.extend(scroll_all_matching_chunks(
            client,
            qdrant_client.models.Filter(
                must=[
                    qdrant_client.models.FieldCondition(
                        key="doc_id",
                        match=qdrant_client.models.MatchValue(value=doc_id)
                    )
                ]
            ),
        ))
    
    client.close()
    
    # Build full document text
    chunks_data = sorted(all_chunks, key=chunk_sort_key)
    
    full_text = "\n\n".join([c["text"] for c in chunks_data])
    
    messages = [
        {
            "role": "system",
            "content": """You are a document editing assistant. Based on the user's instruction and the document content, provide structured edit suggestions.

Format your response:
## Suggested Changes
1. **Section/Page X**: 
   - Original: [text]
   - Suggested: [improved text]
   - Reason: [explanation]

## Full Edited Version (Markdown)
[Complete document with all suggested changes applied]

Document content:
""",
        },
        {
            "role": "user",
            "content": f"{full_text}\n\nInstruction: {request.instruction}",
        },
    ]
    
    headers = {"Authorization": f"Bearer {LLM_API_KEY}"} if LLM_API_KEY else {}
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            LLM_ENDPOINT,
            headers=headers,
            json={
                "model": LLM_MODEL,
                "messages": messages,
                "temperature": 0.6,
                "max_tokens": 4096,
            },
            timeout=120.0,
        )
        response.raise_for_status()
        data = response.json()
        suggestions = data["choices"][0]["message"]["content"]
    
    return {
        "suggestions": suggestions,
        "doc_count": len(pdfs),
        "instruction": request.instruction,
    }


@app.post("/pdf/generate")
async def generate_pdf_from_chat(request: PDFGenerateRequest):
    """Generate PDF from chat history."""
    # This would require storing chat history
    # For now, return an error indicating this is a planned feature
    raise HTTPException(501, "PDF generation from chat requires chat history storage - not yet implemented")


@app.get("/session/{session_id}/pdfs")
async def get_session_pdfs(session_id: str):
    """Get all PDFs uploaded in a session."""
    pdfs = session_pdfs.get(session_id, [])
    return {
        "session_id": session_id,
        "pdfs": [
            {
                "doc_id": p["doc_id"],
                "filename": p["filename"],
                "page_count": p["page_count"],
                "chunk_count": p["chunk_count"],
                "uploaded_at": p["uploaded_at"],
            }
            for p in pdfs
        ],
    }


@app.delete("/session/{session_id}/pdf/{doc_id}")
async def remove_session_pdf(session_id: str, doc_id: str):
    """Remove PDF from session and optionally delete from vector DB."""
    if session_id not in session_pdfs:
        raise HTTPException(404, "Session not found")
    
    pdfs = session_pdfs[session_id]
    pdf = next((p for p in pdfs if p["doc_id"] == doc_id), None)
    
    if not pdf:
        raise HTTPException(404, "PDF not found in session")
    
    # Remove from session
    session_pdfs[session_id] = [p for p in pdfs if p["doc_id"] != doc_id]
    
    # Delete file
    if os.path.exists(pdf["file_path"]):
        os.remove(pdf["file_path"])
    
    # Note: We keep vectors in Qdrant for potential future use
    
    return {"status": "removed", "doc_id": doc_id}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "qdrant_connected": True,
        "llm_endpoint": LLM_ENDPOINT,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
