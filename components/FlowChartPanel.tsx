'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Edge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  MarkerType,
  Node,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import type { Connection, EdgeChange, EdgeProps, NodeChange, NodeProps } from '@xyflow/react';
import { FlowChartContent, FlowChartJob } from '@/types';

const nodeTypes = { visualNode: VisualNode };
const edgeTypes = { visualEdge: VisualEdge };

function VisualNode({ data }: NodeProps) {
  const handleClass = '!h-0 !w-0 !border-0 !bg-transparent !opacity-0';
  const label = String(data.label || '');
  const nodeType = String(data.nodeType || inferNodeType(label));

  if (nodeType === 'decision') {
    return (
      <div className="relative h-[132px] w-[132px]">
        <Handle id="target-top" type="target" position={Position.Top} className={handleClass} />
        <Handle id="source-top" type="source" position={Position.Top} className={handleClass} />
        <Handle id="target-right" type="target" position={Position.Right} className={handleClass} />
        <Handle id="source-right" type="source" position={Position.Right} className={handleClass} />
        <div className="absolute inset-4 rotate-45 border border-amber-500 bg-white shadow-[0_12px_30px_rgba(245,158,11,0.16)]" />
        <div className="absolute inset-0 flex items-center justify-center px-5 text-center text-xs font-semibold leading-snug text-slate-900" dir={hasArabicText(label) ? 'rtl' : 'ltr'}>
          {label}
        </div>
        <Handle id="target-bottom" type="target" position={Position.Bottom} className={handleClass} />
        <Handle id="source-bottom" type="source" position={Position.Bottom} className={handleClass} />
        <Handle id="target-left" type="target" position={Position.Left} className={handleClass} />
        <Handle id="source-left" type="source" position={Position.Left} className={handleClass} />
      </div>
    );
  }

  return (
    <div className="min-w-[190px] max-w-[240px] rounded-xl border border-teal-500 bg-white px-4 py-3 text-center text-sm font-semibold leading-snug text-slate-900 shadow-[0_12px_30px_rgba(28,113,120,0.14)]">
      <Handle id="target-top" type="target" position={Position.Top} className={handleClass} />
      <Handle id="source-top" type="source" position={Position.Top} className={handleClass} />
      <Handle id="target-right" type="target" position={Position.Right} className={handleClass} />
      <Handle id="source-right" type="source" position={Position.Right} className={handleClass} />
      <div className="break-words" dir={hasArabicText(label) ? 'rtl' : 'ltr'}>{label}</div>
      <Handle id="target-bottom" type="target" position={Position.Bottom} className={handleClass} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} className={handleClass} />
      <Handle id="target-left" type="target" position={Position.Left} className={handleClass} />
      <Handle id="source-left" type="source" position={Position.Left} className={handleClass} />
    </div>
  );
}

function VisualEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
}: EdgeProps) {
  const labelText = label ? String(label) : '';
  const isBackLoop = targetY < sourceY - 40 &&
    ((sourcePosition === Position.Left && targetPosition === Position.Left) ||
      (sourcePosition === Position.Right && targetPosition === Position.Right));
  const sideOffset = sourcePosition === Position.Left ? -82 : 82;
  const sideX = sourceX + sideOffset;
  const [path, labelX, labelY] = isBackLoop
    ? [
        `M ${sourceX},${sourceY} C ${sideX},${sourceY} ${sideX},${targetY} ${targetX},${targetY}`,
        sideX,
        (sourceY + targetY) / 2,
      ] as const
    : getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 18,
        offset: 28,
      });

  return (
    <>
      <path
        id={id}
        d={path}
        markerEnd={markerEnd}
        fill="none"
        stroke="#1c7178"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {labelText ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded-full border border-teal-100 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm"
            dir={hasArabicText(labelText) ? 'rtl' : 'ltr'}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function layoutNodesForView(content: FlowChartContent | null) {
  const nodes = content?.nodes || [];
  const edges = content?.edges || [];

  if (nodes.length > 0 && nodes.every((node) => Number.isFinite(Number(node.x)) && Number.isFinite(Number(node.y)))) {
    return nodes;
  }

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
      x: 360 + (index - (total - 1) / 2) * 300,
      y: level * 160,
    };
  });
}

export default function FlowChartPanel() {
  const [jobs, setJobs] = useState<FlowChartJob[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [content, setContent] = useState<FlowChartContent | null>(null);
  const [progress, setProgress] = useState<FlowChartJob['progress']>({ completed: 0, total: 3, percent: 0, step: 'Idle' });
  const [status, setStatus] = useState<FlowChartJob['status']>('setup');
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [graphNodes, setGraphNodes] = useState<Node[]>([]);
  const [graphEdges, setGraphEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const visibleContent = status === 'editing' || status === 'completed' ? content : null;
  const displayContent = useMemo(() => prepareFlowForDisplay(visibleContent), [visibleContent]);

  const nodes = useMemo<Node[]>(() => layoutNodesForView(displayContent).map((node) => ({
    id: node.id,
    type: 'visualNode',
    data: { label: node.label, nodeType: node.type || inferNodeType(node.label) },
    position: { x: node.x || 0, y: node.y || 0 },
  })), [displayContent]);
  const edges = useMemo<Edge[]>(() => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    return (displayContent?.edges || []).map((edge) => {
      const handles = getEdgeHandles(edge, nodeMap);

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
        type: 'visualEdge',
        label: edge.label,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#1c7178', strokeWidth: 2 },
      };
    });
  }, [displayContent, nodes]);
  const selectedNode = graphNodes.find((node) => node.id === selectedNodeId) || null;
  const selectedEdge = graphEdges.find((edge) => edge.id === selectedEdgeId) || null;
  const editableContent = useMemo<FlowChartContent | null>(() => {
    if (!displayContent) return null;

    return {
      title: displayContent.title,
      nodes: graphNodes.map((node) => ({
        id: node.id,
        label: String(node.data?.label || ''),
        type: node.id === 'start' ? 'input' : node.id === 'end' ? 'output' : String(node.data?.nodeType || inferNodeType(String(node.data?.label || ''))) as FlowChartContent['nodes'][number]['type'],
        x: node.position.x,
        y: node.position.y,
      })),
      edges: graphEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: typeof edge.label === 'string' ? edge.label : undefined,
      })),
    };
  }, [displayContent, graphEdges, graphNodes]);

  useEffect(() => {
    setGraphNodes(nodes);
    setGraphEdges(edges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [edges, nodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setGraphNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setGraphEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setGraphEdges((current) => addEdge({
      ...connection,
      id: `edge-${Date.now()}`,
      type: 'visualEdge',
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#1c7178', strokeWidth: 2 },
    }, current));
  }, []);

  const updateSelectedNodeLabel = (label: string) => {
    setGraphNodes((current) => current.map((node) => (
      node.id === selectedNodeId ? { ...node, data: { ...node.data, label } } : node
    )));
  };

  const updateSelectedEdge = (updates: Partial<Edge>) => {
    setGraphEdges((current) => current.map((edge) => (
      edge.id === selectedEdgeId ? { ...edge, ...updates } : edge
    )));
  };

  const addNode = () => {
    const id = `node-${Date.now()}`;
    setGraphNodes((current) => [
      ...current,
      {
        id,
        type: 'visualNode',
        data: { label: 'New Step' },
        position: { x: 360, y: 120 + current.length * 90 },
      },
    ]);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  };

  const deleteSelected = () => {
    if (selectedNodeId) {
      setGraphNodes((current) => current.filter((node) => node.id !== selectedNodeId));
      setGraphEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
      setSelectedNodeId(null);
      return;
    }

    if (selectedEdgeId) {
      setGraphEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  };

  const saveEditedFlow = async () => {
    if (!editableContent) return;

    setContent(editableContent);
    setError(null);

    if (!jobId) return;

    const response = await fetch(`/api/flow-jobs/${encodeURIComponent(jobId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: editableContent,
        status: 'editing',
        progress: { completed: 4, total: 4, percent: 100, step: 'Edited' },
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error || 'Failed to save flow edits');
      return;
    }

    await loadJobs();
  };

  const loadJobs = async () => {
    const response = await fetch('/api/flow-jobs');
    const data = await response.json().catch(() => ({}));
    if (response.ok) setJobs(data.jobs || []);
  };

  useEffect(() => {
    void loadJobs();
  }, []);

  const loadJob = (job: FlowChartJob) => {
    setJobId(job.id);
    setTitle(job.title);
    setPrompt(job.prompt);
    setContent(job.content || null);
    setProgress(job.progress || { completed: 0, total: 3, percent: 0, step: 'Idle' });
    setStatus(job.status);
    setError(job.error || null);
  };

  const startNewFlow = () => {
    setJobId(null);
    setTitle('');
    setPrompt('');
    setContent(null);
    setError(null);
    setStatus('setup');
    setProgress({ completed: 0, total: 3, percent: 0, step: 'Idle' });
  };

  const deleteJob = async (id: string) => {
    const response = await fetch(`/api/flow-jobs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || 'Failed to delete flow chart job');
      return;
    }

    if (id === jobId) {
      startNewFlow();
    }

    await loadJobs();
  };

  const generate = async () => {
    if (!prompt.trim()) return;

    setError(null);
    setIsGenerating(true);
    setStatus('generating');
    setProgress({ completed: 0, total: 3, percent: 0, step: 'Creating job' });

    try {
      let currentJobId = jobId;

      if (!currentJobId) {
        const response = await fetch('/api/flow-jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title || prompt.slice(0, 70), prompt }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Failed to create flow job');
        currentJobId = data.job.id;
        setJobId(currentJobId);
      } else {
        await fetch(`/api/flow-jobs/${encodeURIComponent(currentJobId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title || prompt.slice(0, 70), prompt }),
        });
      }

      if (!currentJobId) throw new Error('Flow job id is missing');

      const startResponse = await fetch(`/api/flow-jobs/${encodeURIComponent(currentJobId)}/generate`, { method: 'POST' });
      const startData = await startResponse.json().catch(() => ({}));
      if (!startResponse.ok) throw new Error(startData.error || 'Failed to start flow generation');

      await pollFlowJob(currentJobId, {
        onUpdate: (job) => {
          setStatus(job.status);
          setProgress(job.progress || { completed: 0, total: 4, percent: 0, step: 'Generating' });
          if (job.error) setError(job.error);
        },
        onComplete: (job) => {
          if (job.content) {
            setContent(job.content);
          }
          setStatus(job.status);
          setProgress(job.progress || { completed: 4, total: 4, percent: 100, step: 'Ready' });
          setError(job.error || null);
        },
      });
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate flow chart');
      setStatus('failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const exportPng = async () => {
    if (!exportRef.current) return;

    const dataUrl = await toPng(exportRef.current, {
      backgroundColor: '#f8fafc',
      pixelRatio: 2,
      filter: (node) => !(
        node instanceof HTMLElement &&
        (node.classList.contains('react-flow__controls') || node.classList.contains('react-flow__panel'))
      ),
    });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${displayContent?.title || 'flow-chart'}.png`;
    link.click();
  };
  const exportBounds = useMemo(() => calculateExportBounds(graphNodes), [graphNodes]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 text-gray-900 dark:text-gray-100">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Flow Diagram Creation</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Generate visual flow charts, save jobs, and export PNG.</p>
        </div>
        <button
          onClick={startNewFlow}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium dark:border-gray-600"
        >
          New flow
        </button>
      </div>

      {jobs.length > 0 && (
        <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Saved flow jobs</h3>
            <button onClick={loadJobs} className="text-xs font-medium text-teal-600 dark:text-teal-300">Refresh</button>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {jobs.slice(0, 9).map((job) => (
              <div
                key={job.id}
                className="rounded-lg border border-gray-200 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
              >
                <button type="button" onClick={() => loadJob(job)} className="w-full text-left">
                  <div className="truncate text-sm font-medium">{job.title}</div>
                  <div className="mt-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{job.status}</span>
                    <span>{job.progress?.percent || 0}%</span>
                  </div>
                </button>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => deleteJob(job.id)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <label className="block">
            <span className="text-sm font-medium">Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Flow description</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 h-40 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900" />
          </label>
          <button onClick={generate} disabled={!prompt.trim() || isGenerating} className="w-full rounded-lg bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-500 disabled:opacity-60">
            {isGenerating ? 'Generating...' : status === 'failed' ? 'Retry generation' : displayContent ? 'Regenerate flow' : 'Generate flow'}
          </button>
          <div>
            <div className="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{progress.step}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700">
              <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
          {status === 'failed' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
              <div className="font-medium">Flow generation failed.</div>
              <div className="mt-1">{error || 'The job stopped before it finished.'}</div>
              <button
                onClick={generate}
                disabled={!prompt.trim() || isGenerating}
                className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
              >
                Retry / continue
              </button>
            </div>
          )}
          {status === 'generating' && !isGenerating && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              <div className="font-medium">This flow job did not finish.</div>
              <button
                onClick={generate}
                disabled={!prompt.trim()}
                className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
              >
                Continue generation
              </button>
            </div>
          )}
          {displayContent && (
            <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div className="flex gap-2">
                <button onClick={addNode} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium dark:border-gray-600">
                  Add node
                </button>
                <button onClick={deleteSelected} disabled={!selectedNodeId && !selectedEdgeId} className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300">
                  Delete
                </button>
              </div>

              {selectedNode && (
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Node label</span>
                  <input
                    value={String(selectedNode.data?.label || '')}
                    onChange={(event) => updateSelectedNodeLabel(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                  />
                </label>
              )}

              {selectedEdge && (
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Edge label</span>
                    <input
                      value={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''}
                      onChange={(event) => updateSelectedEdge({ label: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Source</span>
                      <select
                        value={selectedEdge.source}
                        onChange={(event) => updateSelectedEdge({ source: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                      >
                        {graphNodes.map((node) => <option key={node.id} value={node.id}>{String(node.data?.label || node.id)}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Target</span>
                      <select
                        value={selectedEdge.target}
                        onChange={(event) => updateSelectedEdge({ target: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                      >
                        {graphNodes.map((node) => <option key={node.id} value={node.id}>{String(node.data?.label || node.id)}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={saveEditedFlow} className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-950">
                  Save edits
                </button>
                <button onClick={exportPng} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium dark:border-gray-600">
                  Export PNG
                </button>
              </div>
            </div>
          )}
          {error && status !== 'failed' && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
        </div>

        <div ref={chartRef} className="h-[640px] overflow-hidden rounded-lg border border-gray-200 bg-slate-50 dark:border-gray-700">
          <ReactFlowProvider>
            <ReactFlow
              nodes={graphNodes}
              edges={graphEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              nodesDraggable
              nodesConnectable
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => {
                setSelectedNodeId(node.id);
                setSelectedEdgeId(null);
              }}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(null);
              }}
              elementsSelectable
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#cbd5e1" gap={18} />
              <Controls />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </div>

      <div className="pointer-events-none fixed left-[-100000px] top-0 opacity-0">
        <div
          ref={exportRef}
          className="relative overflow-hidden rounded-xl border border-slate-300 bg-slate-50"
          style={{ width: exportBounds.width, height: exportBounds.height }}
        >
          <ReactFlowProvider>
            <ReactFlow
              nodes={graphNodes.map((node) => ({
                ...node,
                position: {
                  x: node.position.x - exportBounds.minX + exportBounds.padding,
                  y: node.position.y - exportBounds.minY + exportBounds.padding,
                },
              }))}
              edges={graphEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              zoomOnScroll={false}
              panOnDrag={false}
              fitView={false}
              proOptions={{ hideAttribution: true }}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            >
              <Background color="#cbd5e1" gap={18} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  );
}

function calculateExportBounds(nodes: Node[]) {
  const padding = 96;
  const nodeWidth = 250;
  const nodeHeight = 76;

  if (nodes.length === 0) {
    return { minX: 0, minY: 0, width: 720, height: 420, padding };
  }

  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxX = Math.max(...nodes.map((node) => node.position.x + nodeWidth));
  const maxY = Math.max(...nodes.map((node) => node.position.y + nodeHeight));

  return {
    minX,
    minY,
    width: Math.ceil(maxX - minX + padding * 2),
    height: Math.ceil(maxY - minY + padding * 2),
    padding,
  };
}

function prepareFlowForDisplay(content: FlowChartContent | null) {
  if (!content) return content;

  const normalized: FlowChartContent = {
    ...content,
    nodes: content.nodes.map((node) => ({
      ...node,
      type: node.type || inferNodeType(node.label),
    })),
  };

  if (isFoodDeliveryFlow(normalized.nodes)) {
    return canonicalizeFoodDeliveryFlow(normalized.title);
  }

  if (!isCommerceFlow(normalized.nodes)) {
    return {
      ...normalized,
      edges: normalized.edges.filter((edge) => !isTerminalNode(normalized.nodes.find((node) => node.id === edge.source))),
    };
  }

  if (normalized.nodes.every((node) => Number.isFinite(Number(node.x)) && Number.isFinite(Number(node.y)))) {
    return normalized;
  }

  return canonicalizeCommerceFlow(normalized);
}

function isFoodDeliveryFlow(nodes: FlowChartContent['nodes']) {
  const text = nodes.map((node) => node.label).join('\n').toLowerCase();
  return /food|restaurant|menu|driver|pickup|delivery|delivered|coupon/.test(text) &&
    /order|cart|payment|item/.test(text);
}

function isCommerceFlow(nodes: FlowChartContent['nodes']) {
  if (nodes.some((node) => /restaurant|driver|food|delivery|pickup|coupon/i.test(node.label))) {
    return false;
  }

  return nodes.some((node) => /cart|basket|سلة|عربة/i.test(node.label)) &&
    nodes.some((node) => /payment|pay|checkout|دفع|الدفع|شراء/i.test(node.label)) &&
    nodes.some((node) => /order|confirmation|confirm|طلب|تأكيد|النهاية|نهاية/i.test(node.label));
}

function canonicalizeCommerceFlow(content: FlowChartContent): FlowChartContent {
  const useArabic = content.nodes.some((node) => hasArabicText(node.label));
  const labels = useArabic
    ? [
        ['start', 'البداية', 'input'],
        ['browse-products', 'تصفح المنتجات', 'default'],
        ['add-to-cart', 'إضافة إلى السلة', 'default'],
        ['cart-empty', 'هل توجد عناصر في السلة؟', 'decision'],
        ['checkout', 'الانتقال للدفع', 'default'],
        ['shipping', 'إدخال معلومات الشحن', 'default'],
        ['payment-method', 'اختيار طريقة الدفع', 'default'],
        ['complete-payment', 'معالجة الدفع', 'default'],
        ['payment-success', 'هل الدفع ناجح؟', 'decision'],
        ['order-confirmation', 'تأكيد الطلب', 'default'],
        ['end', 'النهاية', 'output'],
      ] as const
    : [
        ['start', 'Start', 'input'],
        ['browse-products', 'Browse Products', 'default'],
        ['add-to-cart', 'Add to Cart', 'default'],
        ['cart-empty', 'Items in Cart?', 'decision'],
        ['checkout', 'Proceed to Checkout', 'default'],
        ['shipping', 'Enter Shipping Details', 'default'],
        ['payment-method', 'Select Payment Method', 'default'],
        ['complete-payment', 'Complete Payment', 'default'],
        ['payment-success', 'Payment Successful?', 'decision'],
        ['order-confirmation', 'Order Confirmation', 'default'],
        ['end', 'End', 'output'],
      ] as const;

  return {
    title: content.title,
    nodes: labels.map(([id, label, type], index) => ({
      id,
      label,
      type,
      x: 360,
      y: index * 140,
    })),
    edges: [
      { id: 'edge-start-browse', source: 'start', target: 'browse-products' },
      { id: 'edge-browse-add', source: 'browse-products', target: 'add-to-cart' },
      { id: 'edge-add-cart-empty', source: 'add-to-cart', target: 'cart-empty' },
      { id: 'edge-cart-empty-yes', source: 'cart-empty', target: 'checkout', label: useArabic ? 'نعم' : 'Yes' },
      { id: 'edge-cart-empty-no', source: 'cart-empty', target: 'browse-products', label: useArabic ? 'لا' : 'No' },
      { id: 'edge-checkout-shipping', source: 'checkout', target: 'shipping' },
      { id: 'edge-shipping-payment-method', source: 'shipping', target: 'payment-method' },
      { id: 'edge-payment-method-complete', source: 'payment-method', target: 'complete-payment' },
      { id: 'edge-complete-payment-success', source: 'complete-payment', target: 'payment-success' },
      { id: 'edge-payment-success-no', source: 'payment-success', target: 'payment-method', label: useArabic ? 'لا' : 'No' },
      { id: 'edge-payment-success-yes', source: 'payment-success', target: 'order-confirmation', label: useArabic ? 'نعم' : 'Yes' },
      { id: 'edge-confirmation-end', source: 'order-confirmation', target: 'end' },
    ],
  };
}

function canonicalizeFoodDeliveryFlow(title: string): FlowChartContent {
  const mainX = 420;
  const branchX = 760;
  const terminalX = 1080;
  const nodes: FlowChartContent['nodes'] = [
    { id: 'start', label: 'Start', type: 'input', x: mainX, y: 0 },
    { id: 'open-app', label: 'User Opens App', type: 'default', x: mainX, y: 150 },
    { id: 'select-restaurant', label: 'Select Restaurant', type: 'default', x: mainX, y: 300 },
    { id: 'choose-items', label: 'Choose Menu Items', type: 'default', x: mainX, y: 450 },
    { id: 'review-cart', label: 'Review Cart', type: 'default', x: mainX, y: 600 },
    { id: 'coupon-available', label: 'Coupon Available?', type: 'decision', x: mainX + 30, y: 760 },
    { id: 'apply-coupon', label: 'Apply Coupon', type: 'default', x: branchX, y: 790 },
    { id: 'pay', label: 'Submit Payment', type: 'default', x: mainX, y: 950 },
    { id: 'payment-success', label: 'Payment Succeeds?', type: 'decision', x: mainX + 30, y: 1110 },
    { id: 'retry-or-cancel', label: 'Retry Payment?', type: 'decision', x: branchX, y: 1140 },
    { id: 'cancelled', label: 'Order Cancelled', type: 'output', x: terminalX, y: 1140 },
    { id: 'send-restaurant', label: 'Send Order to Restaurant', type: 'default', x: mainX, y: 1310 },
    { id: 'restaurant-accepts', label: 'Restaurant Accepts?', type: 'decision', x: mainX + 30, y: 1470 },
    { id: 'restaurant-rejects', label: 'Notify User and Refund', type: 'output', x: branchX, y: 1500 },
    { id: 'assign-driver', label: 'Driver Assigned', type: 'default', x: mainX, y: 1670 },
    { id: 'pickup-food', label: 'Food Picked Up', type: 'default', x: mainX, y: 1820 },
    { id: 'deliver-food', label: 'Food Delivered', type: 'default', x: mainX, y: 1970 },
    { id: 'rate-order', label: 'User Rates Order', type: 'default', x: mainX, y: 2120 },
    { id: 'end', label: 'End', type: 'output', x: mainX, y: 2270 },
  ];

  return {
    title,
    nodes,
    edges: [
      { id: 'edge-start-open', source: 'start', target: 'open-app' },
      { id: 'edge-open-select', source: 'open-app', target: 'select-restaurant' },
      { id: 'edge-select-choose', source: 'select-restaurant', target: 'choose-items' },
      { id: 'edge-choose-review', source: 'choose-items', target: 'review-cart' },
      { id: 'edge-review-coupon', source: 'review-cart', target: 'coupon-available' },
      { id: 'edge-coupon-yes', source: 'coupon-available', target: 'apply-coupon', label: 'Yes' },
      { id: 'edge-coupon-no', source: 'coupon-available', target: 'pay', label: 'No' },
      { id: 'edge-apply-pay', source: 'apply-coupon', target: 'pay' },
      { id: 'edge-pay-success', source: 'pay', target: 'payment-success' },
      { id: 'edge-payment-yes', source: 'payment-success', target: 'send-restaurant', label: 'Yes' },
      { id: 'edge-payment-no', source: 'payment-success', target: 'retry-or-cancel', label: 'No' },
      { id: 'edge-retry-yes', source: 'retry-or-cancel', target: 'pay', label: 'Yes' },
      { id: 'edge-retry-no', source: 'retry-or-cancel', target: 'cancelled', label: 'No' },
      { id: 'edge-send-accepts', source: 'send-restaurant', target: 'restaurant-accepts' },
      { id: 'edge-accepts-yes', source: 'restaurant-accepts', target: 'assign-driver', label: 'Yes' },
      { id: 'edge-accepts-no', source: 'restaurant-accepts', target: 'restaurant-rejects', label: 'No' },
      { id: 'edge-driver-pickup', source: 'assign-driver', target: 'pickup-food' },
      { id: 'edge-pickup-deliver', source: 'pickup-food', target: 'deliver-food' },
      { id: 'edge-deliver-rate', source: 'deliver-food', target: 'rate-order' },
      { id: 'edge-rate-end', source: 'rate-order', target: 'end' },
    ],
  };
}

function hasArabicText(value: string) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(value);
}

function inferNodeType(label: string): FlowChartContent['nodes'][number]['type'] {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'start' || normalized === 'البداية') return 'input';
  if (normalized === 'end' || normalized === 'النهاية' || normalized === 'نهاية') return 'output';
  if (
    /\?$/.test(normalized) ||
    /^(is|are|does|do|did|has|have|can|should|whether)\b/i.test(normalized) ||
    /هل\b|نجاح|ناجح|متاح|available|succeeds|successful|accepts|approved|required|fail|pass|critical|retry/i.test(label)
  ) {
    return 'decision';
  }
  return 'default';
}

function isTerminalNode(node?: FlowChartContent['nodes'][number]) {
  if (!node) return false;
  const label = node.label.trim().toLowerCase();
  const id = node.id.trim().toLowerCase();
  return node.type === 'output' || label === 'end' || label === 'النهاية' || label === 'نهاية' || id === 'end';
}

function getEdgeHandles(
  edge: FlowChartContent['edges'][number],
  nodes: Map<string, Node>
) {
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);

  if (!source || !target) {
    return { sourceHandle: 'source-bottom', targetHandle: 'target-top' };
  }

  const deltaY = target.position.y - source.position.y;
  const deltaX = target.position.x - source.position.x;

  if (deltaY < -40) {
    const label = edge.label?.toLowerCase() || '';
    const side = label === 'no' || label === 'لا' ? 'right' : 'left';
    return { sourceHandle: `source-${side}`, targetHandle: `target-${side}` };
  }

  if (Math.abs(deltaY) < 110 && Math.abs(deltaX) > 80) {
    return deltaX > 0
      ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
      : { sourceHandle: 'source-left', targetHandle: 'target-right' };
  }

  if (Math.abs(deltaX) > 220 && deltaY > 0) {
    return deltaX > 0
      ? { sourceHandle: 'source-right', targetHandle: 'target-top' }
      : { sourceHandle: 'source-left', targetHandle: 'target-top' };
  }

  return { sourceHandle: 'source-bottom', targetHandle: 'target-top' };
}

async function pollFlowJob(
  jobId: string,
  handlers: {
    onUpdate: (job: FlowChartJob) => void;
    onComplete: (job: FlowChartJob) => void;
  }
) {
  const timeoutAt = Date.now() + 10 * 60 * 1000;

  while (Date.now() < timeoutAt) {
    const response = await fetch(`/api/flow-jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Failed to check flow job status');
    }

    const job = data.job as FlowChartJob;

    if (job.status === 'editing' || job.status === 'completed' || job.status === 'failed') {
      handlers.onComplete(job);
      return;
    }

    handlers.onUpdate(job);
    await wait(1500);
  }

  throw new Error('Flow chart generation timed out. You can retry or continue this job.');
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
