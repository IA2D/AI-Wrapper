'use client';

import { isValidElement, useState } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { textDirection, textAlignClass } from '@/utils/textDirection';

export default function MarkdownContent({
  content,
}: {
  content: string;
}) {
  const direction = textDirection(content);
  const isRtl = direction === 'rtl';

  return (
    <div dir={direction} className={textAlignClass(content)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0 leading-7">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 ps-6">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 ps-6">{children}</ol>,
          h1: ({ children }) => <h1 className="mb-3 text-2xl font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 text-xl font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 text-lg font-semibold">{children}</h3>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table
                dir={direction}
                className={`min-w-full border-collapse text-sm ${isRtl ? 'text-right [direction:rtl]' : 'text-left [direction:ltr]'}`}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              dir="auto"
              className={`border border-gray-300 bg-gray-100 px-3 py-2 align-top [overflow-wrap:anywhere] dark:border-gray-600 dark:bg-gray-700 ${isRtl ? 'text-right' : 'text-left'}`}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              dir="auto"
              className={`border border-gray-300 px-3 py-2 align-top [overflow-wrap:anywhere] dark:border-gray-600 ${isRtl ? 'text-right' : 'text-left'}`}
            >
              {children}
            </td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="break-all text-teal-600 underline decoration-teal-300 underline-offset-2 [overflow-wrap:anywhere] dark:text-teal-400"
            >
              {children}
            </a>
          ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          code: ({ className, children }) => {
            const isBlockCode = /language-/.test(className || '');

            if (isBlockCode) {
              return (
                <code className={`${className || ''} block max-w-full whitespace-pre-wrap break-words font-mono text-[13px] leading-6`}>
                  {children}
                </code>
              );
            }

            return (
              <code className="break-words rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.9em] text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = getNodeText(children);
  const flow = parseMermaidFlow(text);

  if (flow.nodes.length > 0 && flow.edges.length > 0) {
    return <InlineFlowDiagram title="AI flow diagram" flow={flow} />;
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="group relative my-3 max-w-full rounded-xl border border-gray-200 bg-gray-950 text-gray-100 dark:border-gray-700">
      <div className="max-w-full">
        <button
          type="button"
          onClick={copyCode}
          className="sticky right-4 top-3 z-10 float-right mr-3 mt-3 rounded-md border border-white/10 bg-gray-800/95 px-2.5 py-1 text-xs font-medium text-gray-100 shadow-sm hover:bg-gray-700"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <pre className="m-0 max-w-full whitespace-pre-wrap break-words px-4 pb-4 pt-12 text-left [&_code]:block [&_code]:max-w-full [&_code]:whitespace-pre-wrap [&_code]:break-words [&_code]:bg-transparent [&_code]:p-0 [&_code]:font-mono [&_code]:text-[13px] [&_code]:leading-6 [&_code]:text-inherit" dir="ltr">
          {children}
        </pre>
      </div>
    </div>
  );
}

function InlineFlowDiagram({
  title,
  flow,
}: {
  title: string;
  flow: ReturnType<typeof parseMermaidFlow>;
}) {
  const exportSvg = () => {
    const element = document.getElementById(flow.id);
    if (!element) return;
    const svg = new XMLSerializer().serializeToString(element);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-gray-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</span>
        <button
          type="button"
          onClick={exportSvg}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          Export SVG
        </button>
      </div>
      <div className="overflow-auto p-3">
        <svg id={flow.id} width={flow.width} height={flow.height} viewBox={`0 0 ${flow.width} ${flow.height}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={title}>
          <defs>
            <marker id={`${flow.id}-arrow`} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#1c7178" />
            </marker>
            <pattern id={`${flow.id}-grid`} width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
            </pattern>
            <filter id={`${flow.id}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#0f172a" floodOpacity="0.10" />
            </filter>
          </defs>
          <rect width="100%" height="100%" fill="#f8fafc" />
          <rect width="100%" height="100%" fill={`url(#${flow.id}-grid)`} opacity="0.45" />
          {flow.edges.map((edge) => {
            const source = flow.nodes.find((node) => node.id === edge.source);
            const target = flow.nodes.find((node) => node.id === edge.target);
            if (!source || !target) return null;
            const route = routeInlineEdge(source, target, flow);
            const labelPoint = edge.label ? edgeLabelPoint(route.points) : null;

            return (
              <g key={edge.id}>
                <path
                  d={route.path}
                  fill="none"
                  stroke="#1c7178"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd={`url(#${flow.id}-arrow)`}
                />
                {edge.label && labelPoint && (
                  <g>
                    <rect
                      x={labelPoint.x - Math.max(24, edge.label.length * 3.7)}
                      y={labelPoint.y - 13}
                      width={Math.max(48, edge.label.length * 7.4)}
                      height="22"
                      rx="11"
                      fill="#ffffff"
                      stroke="#cbd5e1"
                    />
                    <text
                      x={labelPoint.x}
                      y={labelPoint.y + 3}
                      textAnchor="middle"
                      fill="#475569"
                      fontFamily="Arial, sans-serif"
                      fontSize="11"
                      fontWeight="700"
                      direction={hasArabicText(edge.label) ? 'rtl' : 'ltr'}
                      unicodeBidi="plaintext"
                    >
                      {edge.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {flow.nodes.map((node) => (
            <g key={node.id} filter={`url(#${flow.id}-shadow)`}>
              {node.type === 'decision' ? (
                <polygon
                  points={`${node.x + node.width / 2},${node.y} ${node.x + node.width},${node.y + node.height / 2} ${node.x + node.width / 2},${node.y + node.height} ${node.x},${node.y + node.height / 2}`}
                  fill="#fff"
                  stroke="#f59e0b"
                  strokeWidth="1.6"
                />
              ) : (
                <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="10" fill="#fff" stroke="#3b82f6" strokeWidth="1.6" />
              )}
              <text
                x={node.x + node.width / 2}
                y={node.y + node.height / 2 - (wrapSvgLabel(node.label, node.type).length - 1) * 7}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#0f172a"
                fontFamily="Arial, sans-serif"
                fontSize="12"
                fontWeight="700"
                direction={hasArabicText(node.label) ? 'rtl' : 'ltr'}
                unicodeBidi="plaintext"
              >
                {wrapSvgLabel(node.label, node.type).map((line, index) => (
                  <tspan key={index} x={node.x + node.width / 2} dy={index === 0 ? 0 : 15}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function parseMermaidFlow(text: string) {
  const id = `flow-${Math.random().toString(36).slice(2)}`;
  const cleaned = text.replace(/```mermaid/gi, '').replace(/```/g, '').trim();
  if (!/^(flowchart|graph)\s+/i.test(cleaned)) {
    return { id, nodes: [], edges: [], width: 0, height: 0 };
  }

  const nodes = new Map<string, InlineFlowNode>();
  const edges: Array<{ id: string; source: string; target: string; label?: string }> = [];

  const ensureNode = (token: string) => {
    const parsed = parseMermaidNode(token);
    if (!nodes.has(parsed.id)) {
      nodes.set(parsed.id, {
        ...parsed,
        x: 0,
        y: 0,
        width: parsed.type === 'decision' ? 156 : 220,
        height: parsed.type === 'decision' ? 116 : 62,
      });
    }
    return nodes.get(parsed.id)!;
  };

  cleaned.split(/\r?\n/).map((line) => line.trim().replace(/;$/, '')).filter(Boolean).forEach((line) => {
    if (/^(flowchart|graph)\s+/i.test(line) || line.startsWith('%%')) return;
    const edge = line.match(/^(.+?)\s*(?:--\s*([^->|]+?)\s*-->|-->\s*\|([^|]+)\||-->)\s*(.+)$/);
    if (!edge) return;
    const source = ensureNode(edge[1]);
    const target = ensureNode(edge[4]);
    edges.push({ id: `edge-${edges.length + 1}`, source: source.id, target: target.id, label: cleanMermaidLabel(edge[2] || edge[3] || '') });
  });

  const nodeList = layoutInlineFlow(Array.from(nodes.values()), edges);
  const width = Math.max(640, Math.max(...nodeList.map((node) => node.x + node.width)) + 110);
  const height = Math.max(340, Math.max(...nodeList.map((node) => node.y + node.height)) + 110);
  return { id, nodes: nodeList, edges, width, height };
}

function parseMermaidNode(raw: string) {
  const token = raw.trim();
  const match = token.match(/^([A-Za-z0-9_-]+)\s*([\s\S]*)$/);
  const id = match?.[1] || token;
  const shape = match?.[2] || '';
  const label = cleanMermaidLabel((shape.match(/\[([\s\S]+?)\]|\{([\s\S]+?)\}|\(([\s\S]+?)\)|"([\s\S]+?)"/)?.slice(1).find(Boolean)) || id);
  return { id, label, type: /\{/.test(shape) || /\?$/.test(label) ? 'decision' as const : 'default' as const };
}

function cleanMermaidLabel(value: string) {
  return value.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
}

type InlineFlowNode = {
  id: string;
  label: string;
  type: 'default' | 'decision';
  x: number;
  y: number;
  width: number;
  height: number;
};

type InlineFlow = {
  nodes: InlineFlowNode[];
  edges: Array<{ id: string; source: string; target: string; label?: string }>;
  width: number;
  height: number;
};

type Point = { x: number; y: number };

function layoutInlineFlow(nodes: InlineFlowNode[], edges: Array<{ source: string; target: string; label?: string }>) {
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => {
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
  });

  const rankingOutgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const rankingEdges = edges.filter((edge) => {
    if (createsCycle(edge.source, edge.target, rankingOutgoing)) {
      return false;
    }

    rankingOutgoing.get(edge.source)?.push(edge.target);
    return true;
  });
  const levels = new Map(nodes.map((node) => [node.id, 0]));

  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    rankingEdges.forEach((edge) => {
      const nextLevel = (levels.get(edge.source) || 0) + 1;
      if ((levels.get(edge.target) || 0) < nextLevel) {
        levels.set(edge.target, nextLevel);
        changed = true;
      }
    });
    if (!changed) break;
  }

  nodes.forEach((node, index) => {
    if (!levels.has(node.id)) levels.set(node.id, index);
  });

  const grouped = new Map<number, InlineFlowNode[]>();
  nodes.forEach((node) => {
    const level = levels.get(node.id) || 0;
    grouped.set(level, [...(grouped.get(level) || []), node]);
  });

  const parentIndex = new Map(nodes.map((node, index) => [node.id, index]));
  edges.forEach((edge) => {
    const sourceLevel = levels.get(edge.source) || 0;
    const targetLevel = levels.get(edge.target) || 0;
    if (targetLevel > sourceLevel) {
      parentIndex.set(edge.target, parentIndex.get(edge.source) ?? 0);
    }
  });

  grouped.forEach((group) => {
    group.sort((a, b) => {
      const parentDelta = (parentIndex.get(a.id) || 0) - (parentIndex.get(b.id) || 0);
      return parentDelta || nodes.findIndex((node) => node.id === a.id) - nodes.findIndex((node) => node.id === b.id);
    });
  });

  const placed = nodes.map((node) => {
    const level = levels.get(node.id) || 0;
    const group = grouped.get(level) || [];
    const index = group.findIndex((item) => item.id === node.id);
    const x = 360 + (index - (group.length - 1) / 2) * 310;
    const y = 56 + level * 170;
    return { ...node, x, y };
  });

  const minX = Math.min(...placed.map((node) => node.x));
  const shiftX = minX < 72 ? 72 - minX : 0;
  return placed.map((node) => ({ ...node, x: node.x + shiftX }));
}

function createsCycle(source: string, target: string, outgoing: Map<string, string[]>) {
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    if (id === source) return true;
    seen.add(id);
    stack.push(...(outgoing.get(id) || []));
  }
  return false;
}

function routeInlineEdge(source: InlineFlowNode, target: InlineFlowNode, flow: InlineFlow) {
  const from = connectionPoint(source, target);
  const to = connectionPoint(target, source, true);
  const isBackEdge = target.y <= source.y;
  const maxRight = Math.max(...flow.nodes.map((node) => node.x + node.width));
  const minLeft = Math.min(...flow.nodes.map((node) => node.x));
  const sideLane = source.x <= target.x ? maxRight + 42 : minLeft - 42;
  const verticalGap = Math.max(34, Math.min(76, (target.y - source.y) / 2));
  const points: Point[] = isBackEdge
    ? [
        from,
        { x: from.x, y: from.y + 34 },
        { x: sideLane, y: from.y + 34 },
        { x: sideLane, y: to.y - 34 },
        { x: to.x, y: to.y - 34 },
        to,
      ]
    : [
        from,
        { x: from.x, y: from.y + verticalGap },
        { x: to.x, y: from.y + verticalGap },
        to,
      ];

  return {
    points,
    path: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
  };
}

function connectionPoint(node: InlineFlowNode, other: InlineFlowNode, incoming = false): Point {
  const centerX = node.x + node.width / 2;
  const centerY = node.y + node.height / 2;
  if (incoming) {
    if (other.y >= node.y + node.height) return { x: centerX, y: node.y + node.height };
    if (Math.abs(other.x - node.x) > node.width && Math.abs(other.y - node.y) < node.height) {
      return { x: other.x < node.x ? node.x : node.x + node.width, y: centerY };
    }
    return { x: centerX, y: node.y };
  }
  if (other.y <= node.y) return { x: centerX, y: node.y };
  if (Math.abs(other.x - node.x) > node.width && Math.abs(other.y - node.y) < node.height) {
    return { x: other.x < node.x ? node.x : node.x + node.width, y: centerY };
  }
  return { x: centerX, y: node.y + node.height };
}

function edgeLabelPoint(points: Point[]) {
  if (points.length < 2) return null;
  const middle = points[Math.floor(points.length / 2)];
  const previous = points[Math.max(0, Math.floor(points.length / 2) - 1)];
  return { x: (previous.x + middle.x) / 2, y: (previous.y + middle.y) / 2 - 8 };
}

function wrapSvgLabel(label: string, type: InlineFlowNode['type']) {
  const maxChars = type === 'decision' ? 14 : 22;
  const words = label.includes(' ') ? label.split(/\s+/) : label.match(new RegExp(`.{1,${maxChars}}`, 'g')) || [label];
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function hasArabicText(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function getNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join('');
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return getNodeText(props.children);
  }

  return '';
}
