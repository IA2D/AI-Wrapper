import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { getFlowJob, updateFlowJob } from '@/lib/flowJobs';
import { FlowChartContent } from '@/types';
import { parseAiJson } from '@/utils/aiJson';

function sendEvent(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`event: ${event}\n`));
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireCurrentUser();
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const job = await getFlowJob(user.id, id);
  if (!job) return NextResponse.json({ error: 'Flow chart job not found' }, { status: 404 });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await updateFlowJob(user.id, id, {
          status: 'generating',
          progress: { completed: 1, total: 3, percent: 33, step: 'Planning nodes' },
          error: null,
        });
        sendEvent(controller, 'progress', { completed: 1, total: 3, percent: 33, step: 'Planning nodes' });

        sendEvent(controller, 'progress', { completed: 2, total: 3, percent: 66, step: 'Designing layout' });
        const content = await generateFlowChart(job.prompt, job.title);

        await updateFlowJob(user.id, id, {
          status: 'editing',
          content,
          progress: { completed: 3, total: 3, percent: 100, step: 'Ready' },
          error: null,
        });
        sendEvent(controller, 'progress', { completed: 3, total: 3, percent: 100, step: 'Ready' });
        sendEvent(controller, 'completed', { content });
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Flow chart generation failed';
        await updateFlowJob(user.id, id, {
          status: 'failed',
          progress: { completed: 1, total: 3, percent: 33, step: 'Failed' },
          error: message,
        });
        sendEvent(controller, 'error', { error: message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

async function generateFlowChart(prompt: string, title: string): Promise<FlowChartContent> {
  const apiKey = process.env.API_KEY;
  const endpoint = process.env.API_ENDPOINT;
  const model = process.env.MODEL;

  if (!apiKey || !endpoint || !model) {
    throw new Error('API configuration is missing');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.4,
      max_tokens: 1800,
      messages: [
        {
          role: 'system',
          content: `Create visually clear flow charts. Return only JSON:
{
  "title": "Chart title",
  "nodes": [{"id":"start","label":"Start","type":"input","x":0,"y":0}],
  "edges": [{"id":"e1","source":"start","target":"next","label":"optional"}]
}
Use 8-22 nodes. Use short labels, but preserve the user's domain entities. Types can be input, default, decision, output. Use decision for question/branch nodes. Place nodes in a left-to-right or top-to-bottom layout with x/y coordinates.`,
        },
        { role: 'user', content: `Title: ${title}\nPrompt: ${prompt}` },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Flow chart AI request failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.output_text || data.output?.[0]?.content?.[0]?.text || data.choices?.[0]?.message?.content || '';
  const json = parseAiJson(text);

  return normalizeFlowContent(json, title);
}

function normalizeFlowContent(value: any, fallbackTitle: string): FlowChartContent {
  const nodes = Array.isArray(value.nodes) ? value.nodes : [];
  const edges = Array.isArray(value.edges) ? value.edges : [];
  const normalizedNodes = nodes.map((node: any, index: number) => ({
    id: String(node.id || `node-${index + 1}`),
    label: String(node.label || node.name || `Step ${index + 1}`),
    type: node.type === 'input' || node.type === 'output' || node.type === 'decision' ? node.type : 'default',
    x: 0,
    y: 0,
  }));
  const normalizedEdges = edges.map((edge: any, index: number) => ({
    id: String(edge.id || `edge-${index + 1}`),
    source: String(edge.source),
    target: String(edge.target),
    label: edge.label ? String(edge.label) : undefined,
  })).filter((edge: any) => (
    normalizedNodes.some((node: FlowChartContent['nodes'][number]) => node.id === edge.source) &&
    normalizedNodes.some((node: FlowChartContent['nodes'][number]) => node.id === edge.target)
  ));

  return {
    title: String(value.title || fallbackTitle || 'Flow chart'),
    nodes: autoLayoutNodes(normalizedNodes, normalizedEdges),
    edges: normalizedEdges,
  };
}

function autoLayoutNodes(
  nodes: FlowChartContent['nodes'],
  edges: FlowChartContent['edges']
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const terminalIds = new Set(nodes.filter(isTerminalNode).map((node) => node.id));
  const incomingSources = new Map(nodes.map((node) => [node.id, [] as string[]]));

  edges.forEach((edge) => {
    if (nodeById.has(edge.source) && nodeById.has(edge.target) && !terminalIds.has(edge.source)) {
      incomingSources.get(edge.target)?.push(edge.source);
    }
  });

  const levels = new Map<string, number>();
  const resolveLevel = (id: string, path = new Set<string>()): number => {
    if (levels.has(id)) return levels.get(id) || 0;
    const node = nodeById.get(id);
    if (!node || terminalIds.has(id)) return 0;

    const sources = incomingSources.get(id)?.filter((source) => !terminalIds.has(source)) || [];
    if (node.type === 'input' || node.label.trim().toLowerCase() === 'start' || sources.length === 0) {
      levels.set(id, 0);
      return 0;
    }

    let best = 0;
    const nextPath = new Set(path);
    nextPath.add(id);

    sources.forEach((source) => {
      if (nextPath.has(source)) return;
      best = Math.max(best, resolveLevel(source, nextPath) + 1);
    });

    levels.set(id, best);
    return best;
  };

  nodes.forEach((node) => resolveLevel(node.id));

  const maxNonTerminalLevel = Math.max(
    0,
    ...nodes
      .filter((node) => !terminalIds.has(node.id))
      .map((node) => levels.get(node.id) || 0)
  );
  terminalIds.forEach((id) => levels.set(id, maxNonTerminalLevel + 1));

  const grouped = new Map<number, FlowChartContent['nodes']>();
  nodes.forEach((node) => {
    const level = levels.get(node.id) || 0;
    grouped.set(level, [...(grouped.get(level) || []), node]);
  });

  return nodes.map((node) => {
    const level = levels.get(node.id) || 0;
    const group = grouped.get(level) || [];
    const index = group.findIndex((item) => item.id === node.id);
    const total = group.length;

    return {
      ...node,
      x: 420 + (index - (total - 1) / 2) * 340,
      y: level * 160,
    };
  });
}

function isTerminalNode(node?: FlowChartContent['nodes'][number]) {
  if (!node) return false;
  const label = node.label.trim().toLowerCase();
  const id = node.id.trim().toLowerCase();
  return node.type === 'output' || label === 'end' || label === 'النهاية' || label === 'نهاية' || id === 'end';
}
