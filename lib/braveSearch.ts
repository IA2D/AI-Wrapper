import { generateId } from '@/types';
import type { SearchSource } from '@/types';

const BRAVE_WEB_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

interface BraveSearchOptions {
  count?: number;
  freshness?: 'pd' | 'pw' | 'pm' | 'py';
  searchLang?: string;
  country?: string;
  sourceType?: SearchSource['sourceType'];
}

interface SearchBundleOptions extends BraveSearchOptions {
  academic?: boolean;
}

interface ChatSearchPlan {
  enabled: boolean;
  options: SearchBundleOptions;
  reason: 'runtime-only' | 'simple-current-fact' | 'time-sensitive' | 'news' | 'research' | 'general-current';
}

function getSearchApiKey() {
  return process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY || '';
}

export function hasBraveSearchConfigured() {
  return Boolean(getSearchApiKey());
}

function stripHtml(value: unknown) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeSources(sources: SearchSource[]) {
  const seen = new Set<string>();
  const unique: SearchSource[] = [];

  for (const source of sources) {
    const key = source.url.toLowerCase().replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(source);
  }

  return unique;
}

export function shouldUseSearchForChat(message: string) {
  return getSearchPlanForChat(message).enabled;
}

export function getSearchPlanForChat(message: string): ChatSearchPlan {
  const text = message.toLowerCase();
  const arabicSearchPattern = /(?:\u0627\u0628\u062d\u062b|\u0627\u0644\u0627\u0646|\u0627\u0644\u064a\u0648\u0645|\u0627\u062e\u0631|\u0622\u062e\u0631|\u062d\u062f\u064a\u062b|\u062d\u0627\u0644\u064a|\u062d\u0627\u0644\u064a\u0627|\u0627\u0644\u0648\u064a\u0628|\u0627\u0644\u0627\u0646\u062a\u0631\u0646\u062a)/;
  const hasSearchSignal = /\b(search|browse|web|internet|latest|today|current|recent|news|price|prices|weather|schedule|date|time|202[5-9]|now|up[-\s]?to[-\s]?date)\b/i.test(text) ||
    arabicSearchPattern.test(message);
  const runtimeOnlyQuestion = /\b(what\s+(time|date)\s+is\s+it|current\s+(time|date)|today'?s?\s+date|time\s+now|date\s+today|day\s+is\s+it)\b/i.test(text) ||
    /(?:\u0643\u0627\u0645\s+\u0627\u0644\u0633\u0627\u0639\u0629|\u0627\u0644\u0633\u0627\u0639\u0629\s+\u0643\u0627\u0645|\u062a\u0627\u0631\u064a\u062e\s+\u0627\u0644\u064a\u0648\u0645|\u0627\u0644\u0646\u0647\u0627\u0631\u062f\u0647\s+\u0643\u0627\u0645|\u0627\u0644\u064a\u0648\u0645\s+\u0643\u0627\u0645)/.test(message);
  const asksForNews = /\b(news|headline|headlines|breaking|latest|recent|today)\b/i.test(text) ||
    /(?:\u0627\u062e\u0628\u0627\u0631|\u0623\u062e\u0628\u0627\u0631|\u0639\u0627\u062c\u0644|\u0622\u062e\u0631|\u0627\u062e\u0631|\u0627\u0644\u064a\u0648\u0645)/.test(message);
  const asksForResearch = /\b(research|academic|study|paper|journal|citation|evidence|sources|peer[-\s]?reviewed)\b/i.test(text) ||
    /(?:\u0628\u062d\u062b|\u062f\u0631\u0627\u0633\u0629|\u0645\u0635\u0627\u062f\u0631|\u0623\u062f\u0644\u0629|\u0627\u062f\u0644\u0629)/.test(message);
  const asksForSimpleCurrentFact = /\b(who(?:'s|\s+is)?\s+(?:the\s+)?(?:current\s+)?(?:president|prime minister|ceo|chair(?:man|woman)?|mayor|governor|king|queen|leader|minister)\s+of|current\s+(?:president|prime minister|ceo|chair(?:man|woman)?|mayor|governor|king|queen|leader|minister)\s+of)\b/i.test(text) ||
    /(?:\u0645\u0646\s+\u0647\u0648\s+)?(?:\u0627\u0644\u0631\u0626\u064a\u0633|\u0631\u0626\u064a\u0633|\u0645\u064a\u0646\s+\u0631\u0626\u064a\u0633|\u0627\u0644\u0645\u062f\u064a\u0631\s+\u0627\u0644\u062a\u0646\u0641\u064a\u0630\u064a).*(?:\u0627\u0644\u062d\u0627\u0644\u064a|\u062d\u0627\u0644\u064a\u0627)?/.test(message);
  const asksForTimeSensitiveData = /\b(price|prices|stock|weather|forecast|schedule|score|scores|standings|exchange rate|rate)\b/i.test(text) ||
    /(?:\u0633\u0639\u0631|\u0627\u0644\u0637\u0642\u0633|\u062c\u062f\u0648\u0644|\u0645\u0628\u0627\u0631\u0627\u0629|\u0646\u062a\u064a\u062c\u0629|\u0633\u0639\u0631\s+\u0627\u0644\u0635\u0631\u0641)/.test(message);

  if (!hasSearchSignal) {
    return { enabled: false, options: {}, reason: 'runtime-only' };
  }

  if (runtimeOnlyQuestion && !asksForNews && !asksForTimeSensitiveData) {
    return { enabled: false, options: {}, reason: 'runtime-only' };
  }

  if (asksForResearch) {
    return { enabled: true, options: { count: 8, academic: true, freshness: 'py' }, reason: 'research' };
  }

  if (asksForSimpleCurrentFact) {
    return { enabled: true, options: { count: 2 }, reason: 'simple-current-fact' };
  }

  if (asksForTimeSensitiveData) {
    return { enabled: true, options: { count: 2, freshness: 'pd' }, reason: 'time-sensitive' };
  }

  if (asksForNews) {
    return { enabled: true, options: { count: 5, freshness: 'pm' }, reason: 'news' };
  }

  return { enabled: true, options: { count: 3 }, reason: 'general-current' };
}

export async function braveSearch(query: string, options: BraveSearchOptions = {}): Promise<SearchSource[]> {
  const apiKey = getSearchApiKey();
  if (!apiKey || !query.trim()) return [];

  const url = new URL(BRAVE_WEB_SEARCH_ENDPOINT);
  url.searchParams.set('q', query.slice(0, 400));
  url.searchParams.set('count', String(Math.min(20, Math.max(1, options.count || 6))));
  url.searchParams.set('safesearch', 'moderate');
  url.searchParams.set('text_decorations', 'false');
  url.searchParams.set('spellcheck', 'true');

  if (options.freshness) url.searchParams.set('freshness', options.freshness);
  if (options.searchLang || process.env.BRAVE_SEARCH_LANG) {
    url.searchParams.set('search_lang', options.searchLang || process.env.BRAVE_SEARCH_LANG || 'en');
  }
  if (options.country || process.env.BRAVE_SEARCH_COUNTRY) {
    url.searchParams.set('country', options.country || process.env.BRAVE_SEARCH_COUNTRY || 'US');
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Brave search failed: ${response.status} ${response.statusText}${details ? ` - ${details.slice(0, 300)}` : ''}`);
  }

  const data = await response.json();
  const results = Array.isArray(data?.web?.results) ? data.web.results : [];
  const accessedAt = new Date().toISOString();

  return results.map((result: any): SearchSource => ({
    id: generateId(),
    title: stripHtml(result.title) || result.url || 'Untitled source',
    url: String(result.url || ''),
    displayUrl: stripHtml(result.profile?.long_name || result.meta_url?.netloc || result.url),
    description: stripHtml(result.description || result.extra_snippets?.join(' ')),
    publishedDate: result.age || result.page_age || result.published || undefined,
    accessedAt,
    query,
    context: stripHtml(result.description || result.extra_snippets?.join(' ')).slice(0, 900),
    sourceType: options.sourceType || 'web',
  })).filter((source: SearchSource) => source.url);
}

export async function searchForContext(query: string, options: SearchBundleOptions = {}) {
  const baseCount = options.academic ? 5 : options.count || 6;
  const searches = [
    braveSearch(query, { ...options, count: baseCount, sourceType: options.sourceType || 'web' }),
  ];

  if (options.academic) {
    searches.push(braveSearch(`${query} filetype:pdf OR site:.edu OR site:gov research study report`, {
      ...options,
      count: 5,
      sourceType: 'academic',
    }));
  }

  const settled = await Promise.allSettled(searches);
  const sources = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  return dedupeSources(sources).slice(0, options.count || (options.academic ? 10 : 6));
}

export function formatSearchContext(sources: SearchSource[]) {
  if (sources.length === 0) return '';

  return sources.map((source, index) => [
    `[${index + 1}] ${source.title}`,
    `URL: ${source.url}`,
    source.publishedDate ? `Published/age: ${source.publishedDate}` : '',
    `Accessed: ${source.accessedAt}`,
    source.context ? `Context: ${source.context}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}
