import { NextRequest } from 'next/server';

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8001';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyToRAG(request: NextRequest, context: RouteContext): Promise<Response> {
  const params = await context.params;
  const path = params.path.join('/');
  const targetUrl = `${RAG_SERVICE_URL.replace(/\/$/, '')}/${path}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.arrayBuffer(),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    console.error('[RAG Proxy Error]', {
      method: request.method,
      targetUrl,
      error,
    });

    return Response.json(
      {
        error: 'RAG service is unavailable',
        details: error instanceof Error ? error.message : String(error),
        hint: 'Start the Python RAG service on the VPS with `npm run start:rag` or `cd rag-service && python start.py --host 0.0.0.0 --port 8001`.',
        targetUrl,
      },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyToRAG(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyToRAG(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyToRAG(request, context);
}
