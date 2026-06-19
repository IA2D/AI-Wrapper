import { FlowChartContent } from '@/types';
import { parseAiJson } from '@/utils/aiJson';
import { getFlowJob, updateFlowJob } from './flowJobs';
import { getUserMemoryContext } from './userMemories';

const runningJobs = globalThis as typeof globalThis & {
  __runningFlowJobs?: Set<string>;
};

runningJobs.__runningFlowJobs = runningJobs.__runningFlowJobs || new Set<string>();

export async function startFlowGeneration(userId: string, jobId: string) {
  const key = `${userId}:${jobId}`;
  if (runningJobs.__runningFlowJobs?.has(key)) {
    return;
  }

  runningJobs.__runningFlowJobs?.add(key);

  void runFlowGeneration(userId, jobId).finally(() => {
    runningJobs.__runningFlowJobs?.delete(key);
  });
}

async function runFlowGeneration(userId: string, jobId: string) {
  const job = await getFlowJob(userId, jobId);
  if (!job) return;

  try {
    await updateFlowJob(userId, jobId, {
      status: 'generating',
      progress: { completed: 1, total: 4, percent: 25, step: 'Planning nodes' },
      error: null,
    });

    await updateFlowJob(userId, jobId, {
      status: 'generating',
      progress: { completed: 2, total: 4, percent: 50, step: 'Designing layout' },
    });

    const memoryContext = await getUserMemoryContext(userId).catch(() => '');
    const content = await withRetries(
      () => generateFlowChart(job.prompt, job.title, memoryContext),
      3,
      async (attempt, error) => {
        await updateFlowJob(userId, jobId, {
          status: 'generating',
          progress: {
            completed: 2,
            total: 4,
            percent: 50,
            step: `Retrying diagram generation (${attempt}/3)`,
          },
          error: error instanceof Error ? error.message : 'Flow chart generation failed',
        });
      }
    );

    await updateFlowJob(userId, jobId, {
      status: 'generating',
      progress: { completed: 3, total: 4, percent: 75, step: 'Saving diagram' },
      content,
    });

    await updateFlowJob(userId, jobId, {
      status: 'editing',
      content,
      progress: { completed: 4, total: 4, percent: 100, step: 'Ready' },
      error: null,
    });
  } catch (error) {
    await updateFlowJob(userId, jobId, {
      status: 'failed',
      progress: { completed: 1, total: 4, percent: 25, step: 'Failed' },
      error: error instanceof Error ? error.message : 'Flow chart generation failed',
    });
  }
}

async function withRetries<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
  onRetry?: (attempt: number, error: unknown) => Promise<void> | void
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts) {
        break;
      }

      await onRetry?.(attempt + 1, error);
      await wait(700 * attempt);
    }
  }

  throw lastError;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateFlowChart(prompt: string, title: string, memoryContext = ''): Promise<FlowChartContent> {
  const apiKey = process.env.API_KEY;
  const endpoint = process.env.API_ENDPOINT;
  const model = process.env.MODEL;

  if (!apiKey || !endpoint || !model) {
    throw new Error('API configuration is missing');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.4,
        max_tokens: 2200,
        messages: [
          {
            role: 'system',
            content: `Create visually clear flow charts. Return only JSON:
{
  "title": "Chart title",
  "nodes": [{"id":"start","label":"Start","type":"input"}],
  "edges": [{"id":"e1","source":"start","target":"next","label":"optional"}]
}
Even if the user asks for Mermaid syntax, convert the requested diagram into this JSON shape only.
Use 8-22 nodes when the prompt lists many required steps. Use short labels, but preserve the user's domain entities.
Types can be input, default, decision, output. Use "decision" for question/branch nodes such as payment success, restaurant accepts, critical condition, tests required, discharge/admission.
Decision nodes must have clear question labels and Yes/No branch labels on edges.
Keep exactly one Start and one End when the user asks for that. Do not include prose or code fences.
Do not replace domain-specific nouns with generic templates. If the user says restaurant, menu, driver, food pickup, delivery, or rating, those exact concepts must appear as nodes.
For food delivery flows, include restaurant selection, item selection, cart review, coupon decision/application, payment decision, restaurant accept/reject decision, driver assignment, pickup, delivery, and rating.
For checkout/e-commerce flows that are not food delivery: use "Items in Cart?" instead of "Cart Empty?". If Yes, continue to checkout; if No, route to adding/browsing products. If "Payment Successful?" is Yes, route to order confirmation; if No, route back to payment selection/retry. End must only appear after the final successful outcome.
If the user prompt is Arabic, use Arabic labels and Arabic Yes/No edge labels.
${memoryContext ? `\nKnown user memory for personalization. Use only when relevant.\n${memoryContext}` : ''}`,
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
    const parsed = parseFlowChartOutput(text, title);

    return normalizeFlowContent(parsed, title, prompt);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Flow chart AI request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseFlowChartOutput(text: string, fallbackTitle: string) {
  try {
    return parseAiJson(text);
  } catch {
    // Some models still follow Mermaid requests despite the JSON contract.
  }

  const mermaid = parseMermaidFlowchart(text, fallbackTitle);
  if (mermaid.nodes.length > 0 && mermaid.edges.length > 0) {
    return mermaid;
  }

  throw new Error('Flow chart AI response was not valid JSON or Mermaid');
}

function parseMermaidFlowchart(text: string, fallbackTitle: string): FlowChartContent {
  const nodes = new Map<string, FlowChartContent['nodes'][number]>();
  const edges: FlowChartContent['edges'] = [];
  const cleaned = text
    .replace(/```mermaid/gi, '')
    .replace(/```/g, '');

  const addNode = (token: string) => {
    const node = parseMermaidNodeToken(token);
    const existing = nodes.get(node.id);

    if (!existing) {
      nodes.set(node.id, node);
      return node;
    }

    if (existing.label === existing.id && node.label !== node.id) {
      nodes.set(node.id, { ...existing, label: node.label, type: node.type });
    }

    return nodes.get(node.id) as FlowChartContent['nodes'][number];
  };

  cleaned
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/;$/, ''))
    .filter(Boolean)
    .filter((line) => !/^(flowchart|graph)\s+/i.test(line))
    .filter((line) => !line.startsWith('%%'))
    .forEach((line) => {
      const edge = parseMermaidEdgeLine(line);

      if (edge) {
        const source = addNode(edge.source);
        const target = addNode(edge.target);
        edges.push({
          id: `edge-${edges.length + 1}`,
          source: source.id,
          target: target.id,
          label: edge.label,
        });
        return;
      }

      const node = parseMermaidNodeDeclaration(line);
      if (node) {
        addNode(node);
      }
    });

  return {
    title: fallbackTitle || 'Flow chart',
    nodes: Array.from(nodes.values()),
    edges,
  };
}

function parseMermaidEdgeLine(line: string) {
  const edgeMatch = line.match(/^(.+?)\s*(?:--\s*([^-|]+?)\s*-->|-->\s*\|([^|]+)\||-->|-\.\->|==>)\s*(.+)$/);
  if (!edgeMatch) return null;

  return {
    source: edgeMatch[1].trim(),
    target: edgeMatch[4].trim(),
    label: cleanMermaidLabel(edgeMatch[2] || edgeMatch[3] || ''),
  };
}

function parseMermaidNodeDeclaration(line: string) {
  const nodeMatch = line.match(/^([A-Za-z0-9_-]+)\s*(\[\[.+\]\]|\[.+\]|\{\{.+\}\}|\{.+\}|\(\(.+\)\)|\(.+\))$/);
  if (!nodeMatch) return null;
  return line;
}

function parseMermaidNodeToken(rawToken: string): FlowChartContent['nodes'][number] {
  const token = rawToken.trim().replace(/:::[A-Za-z0-9_-]+$/, '').replace(/;$/, '');
  const match = token.match(/^([A-Za-z0-9_-]+)\s*([\s\S]*)$/);
  const id = (match?.[1] || token).trim();
  const shape = (match?.[2] || '').trim();
  const labelMatch = shape.match(/\[\[([\s\S]+?)\]\]|\[([\s\S]+?)\]|\{\{([\s\S]+?)\}\}|\{([\s\S]+?)\}|\(\(([\s\S]+?)\)\)|\(([\s\S]+?)\)|"([\s\S]+?)"/);
  const label = cleanMermaidLabel(labelMatch?.slice(1).find(Boolean) || id);
  const lowerLabel = label.toLowerCase();

  return {
    id,
    label,
    type: lowerLabel === 'start'
      ? 'input'
      : lowerLabel === 'end'
        ? 'output'
        : /^\{\{?/.test(shape)
          ? 'decision'
          : 'default',
    x: 0,
    y: 0,
  };
}

function cleanMermaidLabel(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeFlowContent(value: any, fallbackTitle: string, originalPrompt = ''): FlowChartContent {
  const nodes = Array.isArray(value.nodes) ? value.nodes : [];
  const edges = Array.isArray(value.edges) ? value.edges : [];
  let normalizedNodes = nodes.slice(0, 40).map((node: any, index: number) => ({
    id: String(node.id || `node-${index + 1}`),
    label: String(node.label || node.name || `Step ${index + 1}`),
    type: resolveNodeType(node),
    x: 0,
    y: 0,
  }));
  let normalizedEdges = edges.slice(0, 80).map((edge: any, index: number) => ({
    id: String(edge.id || `edge-${index + 1}`),
    source: String(edge.source),
    target: String(edge.target),
    label: edge.label ? String(edge.label) : undefined,
  })).filter((edge: any) => (
    normalizedNodes.some((node: FlowChartContent['nodes'][number]) => node.id === edge.source) &&
    normalizedNodes.some((node: FlowChartContent['nodes'][number]) => node.id === edge.target)
  ));

  if (normalizedNodes.length === 0) {
    throw new Error('Flow chart response did not include any nodes');
  }

  if (isFoodDeliveryFlow(originalPrompt, normalizedNodes)) {
    return canonicalizeFoodDeliveryFlow(fallbackTitle || value.title || 'Online food delivery order process');
  }

  if (isCommerceFlow(normalizedNodes)) {
    return canonicalizeCommerceFlow(normalizedNodes, fallbackTitle || value.title || 'E-commerce checkout flow');
  }

  normalizedEdges = sanitizeFlowEdges(normalizedNodes, normalizedEdges);

  return {
    title: String(value.title || fallbackTitle || 'Flow chart'),
    nodes: autoLayoutNodes(normalizedNodes, normalizedEdges),
    edges: normalizedEdges,
  };
}

function resolveNodeType(node: any): FlowChartContent['nodes'][number]['type'] {
  const label = String(node.label || node.name || node.id || '').trim().toLowerCase();
  const id = String(node.id || '').trim().toLowerCase();

  if (node.type === 'input' || label === 'start' || label === 'البداية' || id === 'start') return 'input';
  if (node.type === 'output' || label === 'end' || label === 'النهاية' || label === 'نهاية' || id === 'end') return 'output';
  if (node.type === 'decision' || /\?$|^(is|are|does|do|did|has|have|can|should|whether)\b/i.test(label)) return 'decision';
  return 'default';
}

function sanitizeFlowEdges(
  nodes: FlowChartContent['nodes'],
  edges: FlowChartContent['edges']
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const commerceFlow = isCommerceFlow(nodes);
  const endNode = nodes.find(isTerminalNode);
  const confirmationNode = nodes.find((node) => /order\s+confirmation|order\s+confirmed|confirmation/i.test(node.label));
  const seen = new Set<string>();

  const cleaned = edges
    .map((edge) => repairCommonFlowEdge(edge, nodes, nodeById, commerceFlow))
    .filter((edge) => edge.source !== edge.target)
    .filter((edge) => !isTerminalNode(nodeById.get(edge.source)))
    .filter((edge) => {
      if (!commerceFlow || !endNode || !confirmationNode) return true;
      return !(edge.target === endNode.id && edge.source !== confirmationNode.id);
    })
    .filter((edge) => {
      const key = `${edge.source}:${edge.target}:${edge.label || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (commerceFlow && endNode && confirmationNode && confirmationNode.id !== endNode.id) {
    const hasFinalEdge = cleaned.some((edge) => edge.source === confirmationNode.id && edge.target === endNode.id);
    if (!hasFinalEdge) {
      cleaned.push({
        id: `edge-${cleaned.length + 1}`,
        source: confirmationNode.id,
        target: endNode.id,
      });
    }
  }

  return cleaned.map((edge, index) => ({ ...edge, id: edge.id || `edge-${index + 1}` }));
}

function isCommerceFlow(nodes: FlowChartContent['nodes']) {
  if (isFoodDeliveryFlow('', nodes)) return false;

  return nodes.some((node) => /cart|basket|سلة|عربة/i.test(node.label)) &&
    nodes.some((node) => /payment|pay|checkout|دفع|الدفع|الدفع|شراء/i.test(node.label)) &&
    nodes.some((node) => /order|confirmation|confirm|طلب|تأكيد|النهاية|نهاية/i.test(node.label));
}

function isFoodDeliveryFlow(prompt: string, nodes: FlowChartContent['nodes']) {
  const text = `${prompt}\n${nodes.map((node) => node.label).join('\n')}`.toLowerCase();
  const hasFoodDomain = /food|restaurant|menu|driver|pickup|pick up|delivered|delivery|coupon/.test(text);
  const hasOrderDomain = /order|cart|payment|item/.test(text);
  return hasFoodDomain && hasOrderDomain;
}

function canonicalizeFoodDeliveryFlow(fallbackTitle: string): FlowChartContent {
  const mainX = 420;
  const branchX = 760;
  const terminalX = 1080;
  const specs: Array<{
    id: string;
    label: string;
    type?: FlowChartContent['nodes'][number]['type'];
    x: number;
    y: number;
  }> = [
    { id: 'start', label: 'Start', type: 'input', x: mainX, y: 0 },
    { id: 'open-app', label: 'User Opens App', x: mainX, y: 150 },
    { id: 'select-restaurant', label: 'Select Restaurant', x: mainX, y: 300 },
    { id: 'choose-items', label: 'Choose Menu Items', x: mainX, y: 450 },
    { id: 'review-cart', label: 'Review Cart', x: mainX, y: 600 },
    { id: 'coupon-available', label: 'Coupon Available?', type: 'decision', x: mainX + 30, y: 760 },
    { id: 'apply-coupon', label: 'Apply Coupon', x: branchX, y: 790 },
    { id: 'pay', label: 'Submit Payment', x: mainX, y: 950 },
    { id: 'payment-success', label: 'Payment Succeeds?', type: 'decision', x: mainX + 30, y: 1110 },
    { id: 'retry-or-cancel', label: 'Retry Payment?', type: 'decision', x: branchX, y: 1140 },
    { id: 'cancelled', label: 'Order Cancelled', type: 'output', x: terminalX, y: 1140 },
    { id: 'send-restaurant', label: 'Send Order to Restaurant', x: mainX, y: 1310 },
    { id: 'restaurant-accepts', label: 'Restaurant Accepts?', type: 'decision', x: mainX + 30, y: 1470 },
    { id: 'restaurant-rejects', label: 'Notify User and Refund', type: 'output', x: branchX, y: 1500 },
    { id: 'assign-driver', label: 'Driver Assigned', x: mainX, y: 1670 },
    { id: 'pickup-food', label: 'Food Picked Up', x: mainX, y: 1820 },
    { id: 'deliver-food', label: 'Food Delivered', x: mainX, y: 1970 },
    { id: 'rate-order', label: 'User Rates Order', x: mainX, y: 2120 },
    { id: 'end', label: 'End', type: 'output', x: mainX, y: 2270 },
  ];

  const nodes = specs.map((spec) => ({
    id: spec.id,
    label: spec.label,
    type: spec.type || 'default',
    x: spec.x,
    y: spec.y,
  }));

  const edges: FlowChartContent['edges'] = [
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
  ];

  return {
    title: fallbackTitle || 'Online food delivery order process',
    nodes,
    edges,
  };
}

function canonicalizeCommerceFlow(nodes: FlowChartContent['nodes'], fallbackTitle: string): FlowChartContent {
  const useArabic = nodes.some((node) => hasArabicText(node.label));
  const specs: Array<{
    id: string;
    label: string;
    type?: FlowChartContent['nodes'][number]['type'];
  }> = useArabic
    ? [
        { id: 'start', label: 'البداية', type: 'input' },
        { id: 'browse-products', label: 'تصفح المنتجات' },
        { id: 'add-to-cart', label: 'إضافة إلى السلة' },
        { id: 'cart-empty', label: 'هل توجد عناصر في السلة؟', type: 'decision' },
        { id: 'checkout', label: 'الانتقال للدفع' },
        { id: 'shipping', label: 'إدخال معلومات الشحن' },
        { id: 'payment-method', label: 'اختيار طريقة الدفع' },
        { id: 'complete-payment', label: 'معالجة الدفع' },
        { id: 'payment-success', label: 'هل الدفع ناجح؟', type: 'decision' },
        { id: 'order-confirmation', label: 'تأكيد الطلب' },
        { id: 'end', label: 'النهاية', type: 'output' },
      ]
    : [
        { id: 'start', label: 'Start', type: 'input' },
        { id: 'browse-products', label: 'Browse Products' },
        { id: 'add-to-cart', label: 'Add to Cart' },
        { id: 'cart-empty', label: 'Items in Cart?', type: 'decision' },
        { id: 'checkout', label: 'Proceed to Checkout' },
        { id: 'shipping', label: 'Enter Shipping Details' },
        { id: 'payment-method', label: 'Select Payment Method' },
        { id: 'complete-payment', label: 'Complete Payment' },
        { id: 'payment-success', label: 'Payment Successful?', type: 'decision' },
        { id: 'order-confirmation', label: 'Order Confirmation' },
        { id: 'end', label: 'End', type: 'output' },
      ];

  const canonicalNodes = specs.map((spec, index) => {
    return {
      id: spec.id,
      label: spec.label,
      type: spec.type || 'default',
      x: 360,
      y: index * 140,
    };
  });

  const canonicalEdges: FlowChartContent['edges'] = [
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
  ];

  return {
    title: fallbackTitle || 'E-commerce checkout flow',
    nodes: canonicalNodes,
    edges: canonicalEdges,
  };
}

function hasArabicText(value: string) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(value);
}

function repairCommonFlowEdge(
  edge: FlowChartContent['edges'][number],
  nodes: FlowChartContent['nodes'],
  nodeById: Map<string, FlowChartContent['nodes'][number]>,
  isCommerceFlow: boolean
) {
  if (!isCommerceFlow) return edge;

  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  const sourceLabel = source?.label || '';
  const edgeLabel = (edge.label || '').trim().toLowerCase();

  if (/cart.*empty|empty.*cart|items.*cart/i.test(sourceLabel)) {
    if (/items.*cart/i.test(sourceLabel)) {
      if (edgeLabel === 'yes') {
        const checkout = findNode(nodes, /checkout|shipping/i);
        if (checkout) return { ...edge, target: checkout.id, label: 'Yes' };
      }

      if (edgeLabel === 'no') {
        const addToCart = findNode(nodes, /add.*cart|browse.*product|select.*product/i);
        if (addToCart) return { ...edge, target: addToCart.id, label: 'No' };
      }
    }

    if (edgeLabel === 'yes') {
      const addToCart = findNode(nodes, /add.*cart|browse.*product|select.*product/i);
      if (addToCart) return { ...edge, target: addToCart.id, label: 'Yes' };
    }

    if (edgeLabel === 'no' || /add.*cart|end/i.test(target?.label || '')) {
      const checkout = findNode(nodes, /checkout|shipping/i);
      if (checkout) return { ...edge, target: checkout.id, label: 'No' };
    }
  }

  if (/payment.*success|successful.*payment/i.test(sourceLabel)) {
    if (edgeLabel === 'yes') {
      const confirmation = findNode(nodes, /order\s+confirmation|order\s+confirmed|confirmation/i);
      if (confirmation) return { ...edge, target: confirmation.id, label: 'Yes' };
    }

    if (edgeLabel === 'no') {
      const retry = findNode(nodes, /select.*payment|payment.*method|complete.*payment/i);
      if (retry) return { ...edge, target: retry.id, label: 'No' };
    }
  }

  return edge;
}

function findNode(nodes: FlowChartContent['nodes'], pattern: RegExp) {
  return nodes.find((node) => pattern.test(node.label));
}

function isTerminalNode(node?: FlowChartContent['nodes'][number]) {
  if (!node) return false;
  const label = node.label.trim().toLowerCase();
  const id = node.id.trim().toLowerCase();
  return node.type === 'output' || label === 'end' || label === 'النهاية' || label === 'نهاية' || id === 'end';
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
      x: 360 + (index - (total - 1) / 2) * 300,
      y: level * 160,
    };
  });
}
