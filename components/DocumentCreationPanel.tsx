'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DocumentCreationJob, DocumentExportFormat, DocumentOutlinePlan, DocumentSectionPlan, DocumentTemplateId, DocumentToolKind, PDFContentStructure, SearchSource } from '@/types';
import { normalizeDocumentContent, textWithPreservedStructure, valueToText } from '@/utils/documentStructure';
import { containsRtl, textAlignClass, textDirection } from '@/utils/textDirection';

type Phase = 'setup' | 'outline' | 'generating' | 'editing';

const DOCUMENT_FORMATS: Array<{ value: DocumentExportFormat; label: string; kind: DocumentToolKind }> = [
  { value: 'pdf', label: 'Document PDF', kind: 'document' },
  { value: 'doc', label: 'Word DOC', kind: 'document' },
  { value: 'docx', label: 'Word DOCX', kind: 'document' },
  { value: 'sheet', label: 'Excel Sheet', kind: 'excel' },
  { value: 'presentation', label: 'Presentation', kind: 'presentation' },
];

const DOCUMENT_TEMPLATES: Array<{ id: DocumentTemplateId; label: string; description: string }> = [
  { id: 'executive', label: 'Executive', description: 'Clean reports, strong hierarchy, boardroom feel' },
  { id: 'research', label: 'Research', description: 'Dense citations, tables, academic spacing' },
  { id: 'modern', label: 'Modern', description: 'Fresh color, roomy layout, visual sections' },
  { id: 'academic', label: 'Academic', description: 'Formal paper style with restrained typography' },
  { id: 'dashboard', label: 'Dashboard', description: 'Metric-forward sheets and visual summaries' },
  { id: 'pitch', label: 'Pitch', description: 'Presentation-first, bold slides, high contrast' },
];

export default function DocumentCreationPanel({ thinkingMode }: { thinkingMode: boolean }) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [jobId, setJobId] = useState<string | null>(null);
  const [savedJobs, setSavedJobs] = useState<DocumentCreationJob[]>([]);
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [minPageCount, setMinPageCount] = useState(2);
  const [pageCount, setPageCount] = useState(5);
  const [exportFormat, setExportFormat] = useState<DocumentExportFormat>('pdf');
  const [templateId, setTemplateId] = useState<DocumentTemplateId>('executive');
  const [includeTables, setIncludeTables] = useState(true);
  const [includeCharts, setIncludeCharts] = useState(false);
  const [enableSearch, setEnableSearch] = useState(false);
  const [outline, setOutline] = useState<DocumentOutlinePlan | null>(null);
  const [generatedContent, setGeneratedContent] = useState<PDFContentStructure | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [activeSectionDraft, setActiveSectionDraft] = useState('');
  const [completedCount, setCompletedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const documentKind = useMemo<DocumentToolKind>(() => {
    return DOCUMENT_FORMATS.find((format) => format.value === exportFormat)?.kind || 'document';
  }, [exportFormat]);
  const includedSections = outline?.sections.filter((section) => section.include) || [];
  const plannedPages = includedSections.reduce((sum, section) => sum + section.pageCount, 0);
  const progress = includedSections.length ? Math.round((completedCount / includedSections.length) * 100) : 0;
  const hasSavedGeneratedSections = Boolean(generatedContent?.sections?.length);

  const loadJobs = async () => {
    const response = await fetch('/api/document-jobs');
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      setSavedJobs(data.jobs || []);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const persistJob = async (updates: Partial<DocumentCreationJob>, explicitJobId = jobId) => {
    if (!explicitJobId) return null;

    const response = await fetch(`/api/document-jobs/${encodeURIComponent(explicitJobId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      await loadJobs();
      return data.job as DocumentCreationJob;
    }

    return null;
  };

  const createJob = async (outlinePlan?: DocumentOutlinePlan) => {
    const response = await fetch('/api/document-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: outlinePlan?.title || title || 'Untitled document job',
        prompt,
        status: outlinePlan ? 'outline' : 'setup',
        pageCount,
        pageRange: { min: minPageCount, max: pageCount },
        documentKind,
        exportFormat,
        templateId,
        includeTables,
        includeCharts,
        enableSearch,
        outline: outlinePlan || null,
        content: null,
        progress: { completed: 0, total: outlinePlan?.sections.filter((section) => section.include).length || 0, percent: 0 },
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data.error || 'Failed to save document job');

    setJobId(data.job.id);
    await loadJobs();
    return data.job.id as string;
  };

  const loadJob = (job: DocumentCreationJob) => {
    setJobId(job.id);
    setTitle(job.title);
    setPrompt(job.prompt);
    setPageCount(job.pageCount);
    setMinPageCount(job.pageRange?.min || Math.max(1, Math.floor(job.pageCount * 0.6)));
    setExportFormat(job.exportFormat);
    setTemplateId(job.templateId || 'executive');
    setIncludeTables(job.includeTables);
    setIncludeCharts(job.includeCharts);
    setEnableSearch(Boolean(job.enableSearch));
    setOutline(job.outline || null);
    setGeneratedContent(job.content || null);
    setCompletedCount(job.progress?.completed || 0);
    setActiveSectionId(job.status === 'generating' || job.status === 'failed' ? null : job.progress?.activeSectionId || null);
    setActiveSectionDraft('');
    setError(job.error || null);

    if (job.status === 'outline' || job.status === 'failed') {
      setPhase(job.outline ? 'outline' : 'setup');
    } else if (job.status === 'generating') {
      setPhase(job.content ? 'generating' : 'outline');
    } else if (job.status === 'editing' || job.status === 'completed') {
      setPhase(job.content ? 'editing' : 'outline');
    } else {
      setPhase('setup');
    }
  };

  const requestOutline = async () => {
    if (!prompt.trim()) return;

    setIsBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'outline',
          prompt,
          title,
          pageCount,
          pageRange: { min: minPageCount, max: pageCount },
          documentKind,
          exportFormat,
          templateId,
          includeTables,
          includeCharts,
          enableSearch,
          thinkingMode,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(data.error || 'Failed to create document plan');
      const outlinePlan = data.outline as DocumentOutlinePlan;
      setOutline(outlinePlan);
      if (jobId) {
        await persistJob({
          title: outlinePlan.title,
          prompt,
          status: 'outline',
          pageCount,
          documentKind,
          exportFormat,
          templateId,
          includeTables,
          includeCharts,
          enableSearch,
          outline: outlinePlan,
          progress: { completed: 0, total: outlinePlan.sections.filter((section) => section.include).length, percent: 0 },
          error: null,
        });
      } else {
        await createJob(outlinePlan);
      }
      setPhase('outline');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document plan');
    } finally {
      setIsBusy(false);
    }
  };

  const updateSection = (sectionId: string, updates: Partial<DocumentSectionPlan>) => {
    setOutline((current) => current && {
      ...current,
      sections: current.sections.map((section) => (
        section.id === sectionId ? { ...section, ...updates } : section
      )),
    });
  };

  const generateSections = async () => {
    if (!outline || includedSections.length === 0) return;

    setPhase('generating');
    const startingContent = generatedContent?.sections?.length
      ? normalizeDocumentContent(generatedContent)
      : { title: outline.title, sections: [] };
    let latestContent = startingContent;
    const startingCompleted = includedSections.filter((section) => (
      startingContent.sections.some((contentSection) => sectionMatchesPlan(contentSection, section))
    )).length;
    let latestCompleted = startingCompleted;
    setGeneratedContent(startingContent);
    setCompletedCount(startingCompleted);
    setActiveSectionDraft('');
    setError(null);
    const currentJobId = jobId || await createJob(outline);
    await persistJob({
      status: 'generating',
      outline,
      content: startingContent,
      progress: {
        completed: startingCompleted,
        total: includedSections.length,
        percent: includedSections.length ? Math.round((startingCompleted / includedSections.length) * 100) : 0,
        activeSectionId: null,
      },
      error: null,
    }, currentJobId);

    try {
      const response = await fetch('/api/generate-file/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          jobId: currentJobId,
          title: outline.title,
          documentKind: outline.documentKind,
          exportFormat: outline.exportFormat,
          templateId: outline.templateId || templateId,
          sections: includedSections,
          thinkingMode,
          enableSearch,
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start streamed document generation');
      }

      await readDocumentStream(response, {
        onSectionStarted: (section) => {
          setActiveSectionId(section.id);
          setActiveSectionDraft('');
          setError(null);
        },
        onSectionRetry: (data) => {
          setActiveSectionDraft('');
          setError(`Retrying section generation (${data.attempt}/${data.maxAttempts})...`);
        },
        onSectionDelta: (chunk) => setActiveSectionDraft((draft) => `${draft}${chunk}`),
        onSectionCompleted: (content) => {
          setError(null);
          latestContent = normalizeDocumentContent({
            title: latestContent.title || outline.title,
            sections: [...(latestContent.sections || []), ...content.sections],
          });
          latestCompleted = includedSections.filter((section) => (
            latestContent.sections.some((contentSection) => sectionMatchesPlan(contentSection, section))
          )).length;
          setCompletedCount(latestCompleted);
          setGeneratedContent(latestContent);
          setActiveSectionDraft('');
        },
        onProgress: (completed) => {
          latestCompleted = completed;
          setCompletedCount(completed);
        },
        onCompleted: (content) => {
          setError(null);
          latestContent = normalizeDocumentContent(content);
          setGeneratedContent(latestContent);
          setActiveSectionId(null);
          setActiveSectionDraft('');
          setPhase('editing');
          void persistJob({
            status: 'editing',
            content: normalizeDocumentContent(content),
            progress: { completed: includedSections.length, total: includedSections.length, percent: 100, activeSectionId: null },
            error: null,
          }, currentJobId);
        },
        onError: (message) => {
          throw new Error(message);
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate document';
      setError(`${message} Saved progress is kept. Press Resume generation to continue from the next unfinished section.`);
      await persistJob({
        status: 'failed',
        content: latestContent,
        progress: {
          completed: latestCompleted,
          total: includedSections.length,
          percent: includedSections.length ? Math.round((latestCompleted / includedSections.length) * 100) : 0,
          activeSectionId: null,
        },
        error: message,
      }, currentJobId);
      setPhase('outline');
    }
  };

  const exportDocument = async (format: DocumentExportFormat) => {
    if (!generatedContent) return;

    try {
      setError(null);
      const response = await fetch('/api/export-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: normalizeDocumentContent(generatedContent),
          format,
          filename: generatedContent.title || 'document',
          templateId,
          pageRange: { min: minPageCount, max: pageCount },
          pageCount,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Export failed');
      }
      const data = await response.blob();
      const extension = format === 'sheet' ? 'xlsx' : format === 'presentation' ? 'pptx' : format === 'doc' ? 'docx' : format;
      downloadBlob(data, `${generatedContent.title || 'document'}.${extension}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const updateGeneratedSection = (index: number, value: string) => {
    setGeneratedContent((current) => current && {
      ...current,
      sections: current.sections.map((section, sectionIndex) => (
        sectionIndex === index ? { ...section, content: value } : section
      )),
    });
  };

  const saveCurrentJob = async () => {
    if (!jobId) {
      await createJob(outline || undefined);
      return;
    }

    await persistJob({
      title: generatedContent?.title || outline?.title || title || 'Untitled document job',
      prompt,
      status: generatedContent ? 'editing' : outline ? 'outline' : 'setup',
      pageCount,
      pageRange: { min: minPageCount, max: pageCount },
      documentKind,
      exportFormat,
      templateId,
      includeTables,
      includeCharts,
      enableSearch,
      outline,
      content: generatedContent ? normalizeDocumentContent(generatedContent) : null,
      progress: {
        completed: completedCount,
        total: includedSections.length,
        percent: includedSections.length ? Math.round((completedCount / includedSections.length) * 100) : 0,
        activeSectionId,
      },
      error,
    });
  };

  const startFreshJob = () => {
    setJobId(null);
    setPhase('setup');
    setPrompt('');
    setTitle('');
    setMinPageCount(2);
    setPageCount(5);
    setExportFormat('pdf');
    setTemplateId('executive');
    setIncludeTables(true);
    setIncludeCharts(false);
    setEnableSearch(false);
    setOutline(null);
    setGeneratedContent(null);
    setActiveSectionId(null);
    setActiveSectionDraft('');
    setCompletedCount(0);
    setError(null);
  };

  const deleteJob = async (id: string) => {
    const response = await fetch(`/api/document-jobs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || 'Failed to delete document job');
      return;
    }

    if (id === jobId) {
      startFreshJob();
    }

    await loadJobs();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 text-gray-900 dark:text-gray-100">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Document Creation</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Plan first, generate in stream mode, reopen the job at any stage.</p>
        </div>
        <button onClick={startFreshJob} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium dark:border-gray-600">New document job</button>
      </div>

      {savedJobs.length > 0 && (
        <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Saved jobs</h3>
            <button onClick={loadJobs} className="text-xs font-medium text-blue-600 dark:text-blue-300">Refresh</button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {savedJobs.slice(0, 6).map((job) => (
              <div
                key={job.id}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  job.id === jobId
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700'
                }`}
              >
                <button type="button" onClick={() => loadJob(job)} className="w-full text-left">
                  <div className="truncate text-sm font-medium">{job.title}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
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

      {phase === 'setup' && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900" placeholder="Optional" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Document type</span>
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as DocumentExportFormat)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900">
                {DOCUMENT_FORMATS.map((format) => <option key={format.value} value={format.value}>{format.label}</option>)}
              </select>
            </label>
          </div>

          <div>
            <span className="text-sm font-medium">Template</span>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {DOCUMENT_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setTemplateId(template.id)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    templateId === template.id
                      ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                      : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="text-sm font-semibold">{template.label}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{template.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Minimum pages</span>
              <input
                type="number"
                min={1}
                max={100}
                value={minPageCount}
                onChange={(event) => {
                  const next = Math.min(100, Math.max(1, Number(event.target.value)));
                  setMinPageCount(next);
                  setPageCount((current) => Math.max(next, current));
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Maximum pages</span>
              <input
                type="number"
                min={minPageCount}
                max={100}
                value={pageCount}
                onChange={(event) => setPageCount(Math.min(100, Math.max(minPageCount, Number(event.target.value))))}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
              <input type="checkbox" checked={includeTables} onChange={(event) => setIncludeTables(event.target.checked)} />
              <span className="text-sm">Include tables where useful</span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
              <input type="checkbox" checked={includeCharts} onChange={(event) => setIncludeCharts(event.target.checked)} />
              <span className="text-sm">Include chart-ready data</span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
              <input type="checkbox" checked={enableSearch} onChange={(event) => setEnableSearch(event.target.checked)} />
              <span className="text-sm">Use Brave web/academic search</span>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium">Research request</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-1 h-40 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900" placeholder="Describe what you want the AI to create..." />
          </label>

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</div>}

          <button onClick={requestOutline} disabled={!prompt.trim() || isBusy} className="rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-500 disabled:opacity-60">
            {isBusy ? 'Planning...' : 'Create section plan'}
          </button>
        </div>
      )}

      {phase === 'outline' && outline && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <input value={valueToText(outline.title)} onChange={(event) => setOutline({ ...outline, title: event.target.value })} className="text-lg font-semibold bg-transparent outline-none" />
              <div className="text-sm text-gray-500">Planned pages: {plannedPages} / {outline.totalPages}</div>
            </div>
          </div>

          {outline.sections.map((section) => (
            <div key={section.id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="grid gap-3 md:grid-cols-[auto_1fr_110px] md:items-center">
                <input type="checkbox" checked={section.include} onChange={(event) => updateSection(section.id, { include: event.target.checked })} />
                <input value={valueToText(section.heading)} onChange={(event) => updateSection(section.id, { heading: event.target.value })} className="rounded-lg border border-gray-300 bg-white px-3 py-2 font-medium dark:border-gray-600 dark:bg-gray-900" />
                <input type="number" min={1} max={10} value={section.pageCount} onChange={(event) => updateSection(section.id, { pageCount: Math.min(10, Math.max(1, Number(event.target.value))) })} className="rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900" />
              </div>
              <textarea value={valueToText(section.summary)} onChange={(event) => updateSection(section.id, { summary: event.target.value })} className="mt-3 h-20 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900" />
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={section.allowTables} onChange={(event) => updateSection(section.id, { allowTables: event.target.checked })} /> Tables</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={section.allowCharts} onChange={(event) => updateSection(section.id, { allowCharts: event.target.checked })} /> Charts</label>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Body size
                  <input
                    type="number"
                    min={8}
                    max={18}
                    step={0.5}
                    value={section.style?.bodyFontSize || 10.5}
                    onChange={(event) => updateSection(section.id, {
                      style: { ...defaultSectionStyle(section), bodyFontSize: Number(event.target.value) },
                    })}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                </label>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Table size
                  <input
                    type="number"
                    min={6}
                    max={14}
                    step={0.5}
                    value={section.style?.tableFontSize || 8}
                    onChange={(event) => updateSection(section.id, {
                      style: { ...defaultSectionStyle(section), tableFontSize: Number(event.target.value) },
                    })}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                </label>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Density
                  <select
                    value={section.style?.density || 'normal'}
                    onChange={(event) => updateSection(section.id, {
                      style: { ...defaultSectionStyle(section), density: event.target.value as 'compact' | 'normal' | 'spacious' },
                    })}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  >
                    <option value="compact">Compact</option>
                    <option value="normal">Normal</option>
                    <option value="spacious">Spacious</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Layout
                  <select
                    value={section.style?.layout || 'single-column'}
                    onChange={(event) => updateSection(section.id, {
                      style: { ...defaultSectionStyle(section), layout: event.target.value as 'single-column' | 'two-column' | 'table-first' | 'slide' },
                    })}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  >
                    <option value="single-column">Single column</option>
                    <option value="two-column">Two column</option>
                    <option value="table-first">Table first</option>
                    <option value="slide">Slide</option>
                  </select>
                </label>
              </div>
            </div>
          ))}

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</div>}

          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPhase('setup')} className="rounded-lg border border-gray-300 px-4 py-2.5 font-medium dark:border-gray-600">Back</button>
            <button onClick={saveCurrentJob} className="rounded-lg border border-gray-300 px-4 py-2.5 font-medium dark:border-gray-600">Save plan</button>
            <button onClick={generateSections} disabled={includedSections.length === 0} className="rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-500 disabled:opacity-60">
              {hasSavedGeneratedSections ? 'Resume generation' : 'Confirm and generate'}
            </button>
          </div>
        </div>
      )}

      {phase === 'generating' && generatedContent && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>{activeSectionId ? `Generating ${outline?.sections.find((section) => section.id === activeSectionId)?.heading}` : enableSearch ? 'Searching sources...' : 'Finalizing'}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /></div>
            {activeSectionDraft && (
              <div className="mt-3 max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                <div className="mb-1 font-medium text-gray-800 dark:text-gray-100">Live stream</div>
                <div className="whitespace-pre-wrap">{activeSectionDraft}</div>
              </div>
            )}
            {!activeSectionId && (
              <button onClick={generateSections} className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500">
                Resume generation
              </button>
            )}
          </div>
          {groupDisplaySections(normalizeDocumentContent(generatedContent).sections).map((group) => (
            <section key={group.key} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              {valueToText(group.heading) && <h3 className="font-semibold">{valueToText(group.heading)}</h3>}
              {group.sections.map((section, sectionIndex) => (
                <DocumentSectionPreview
                  key={section.id || sectionIndex}
                  section={section}
                  sources={isSourcesSection(section) ? normalizeDocumentContent(generatedContent).sources : undefined}
                  hideHeading
                />
              ))}
            </section>
          ))}
        </div>
      )}

      {phase === 'editing' && generatedContent && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <input value={generatedContent.title || ''} onChange={(event) => setGeneratedContent({ ...generatedContent, title: event.target.value })} className="w-full bg-transparent text-xl font-semibold outline-none" />
          </div>
          {normalizeDocumentContent(generatedContent).sections.map((section, index) => (
            <div
              key={section.id || index}
              className={`rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 ${
                isExtractedTable(section) ? '-mt-2 border-t-0 pt-2' : ''
              }`}
            >
              {section.type !== 'table' && valueToText(section.heading) && (
                <h3 className="mb-2 font-semibold">{valueToText(section.heading)}</h3>
              )}
              {section.type === 'table' && section.rows?.length ? (
                <EditableTable
                  rows={section.rows}
                  onChange={(rows) => setGeneratedContent((current) => current && {
                    ...current,
                    sections: current.sections.map((item, sectionIndex) => (
                      sectionIndex === index ? { ...item, type: 'table', rows, content: '' } : item
                    )),
                  })}
                />
              ) : isSourcesSection(section) && normalizeDocumentContent(generatedContent).sources?.length ? (
                <SourcesSectionPreview sources={normalizeDocumentContent(generatedContent).sources || []} />
              ) : (
                <textarea value={valueToText(section.content)} onChange={(event) => updateGeneratedSection(index, event.target.value)} className="h-52 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900" />
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <span className="text-sm font-medium">Export as</span>
            {DOCUMENT_FORMATS.filter((format) => (
              generatedContent && (documentKind === 'document' ? format.kind === 'document' : format.kind === documentKind)
            )).map((format) => (
              <button key={format.value} onClick={() => exportDocument(format.value)} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-950">
                {format.label}
              </button>
            ))}
            <button onClick={saveCurrentJob} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium dark:border-gray-600">
              Save job
            </button>
          </div>
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
        </div>
      )}
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(anchor);
}

function defaultSectionStyle(section: DocumentSectionPlan): NonNullable<DocumentSectionPlan['style']> {
  return {
    headingFontSize: section.style?.headingFontSize || 16,
    bodyFontSize: section.style?.bodyFontSize || 10.5,
    tableFontSize: section.style?.tableFontSize || 8,
    lineGap: section.style?.lineGap || 3,
    spacingAfter: section.style?.spacingAfter || 8,
    density: section.style?.density || 'normal',
    layout: section.style?.layout || 'single-column',
  };
}

function sectionMatchesPlan(
  section: PDFContentStructure['sections'][number],
  plan: DocumentSectionPlan
) {
  const sectionId = valueToText(section.id);
  const planId = valueToText(plan.id);
  const sectionHeading = valueToText(section.heading).trim().toLowerCase();
  const planHeading = valueToText(plan.heading).trim().toLowerCase();

  return (
    sectionId === planId ||
    Boolean(planId && sectionId.startsWith(`${planId}-table-`)) ||
    Boolean(sectionHeading && planHeading && sectionHeading === planHeading)
  );
}

async function readDocumentStream(
  response: Response,
  handlers: {
    onSectionStarted: (section: DocumentSectionPlan) => void;
    onSectionRetry?: (data: { attempt: number; maxAttempts: number; error?: string }) => void;
    onSectionDelta: (chunk: string) => void;
    onSectionCompleted: (content: PDFContentStructure) => void;
    onProgress: (completed: number, total: number, percent: number) => void;
    onCompleted: (content: PDFContentStructure) => void;
    onError: (message: string) => void;
  }
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Generation stream is not readable');

  const decoder = new TextDecoder();
  let buffer = '';

  const processEvent = (rawEvent: string) => {
    const event = rawEvent.split('\n').find((line) => line.startsWith('event: '))?.slice(7).trim();
    const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data: '));

    if (!event || !dataLine) return;

    const data = JSON.parse(dataLine.slice(6));

    if (event === 'section_started') {
      handlers.onSectionStarted(data.section);
    }

    if (event === 'section_completed') {
      handlers.onSectionCompleted(data.content);
    }

    if (event === 'section_retry') {
      handlers.onSectionRetry?.(data);
    }

    if (event === 'section_delta') {
      handlers.onSectionDelta(data.chunk || '');
    }

    if (event === 'progress') {
      handlers.onProgress(data.completed, data.total, data.percent);
    }

    if (event === 'completed') {
      handlers.onCompleted(data.content);
    }

    if (event === 'error') {
      handlers.onError(data.error || 'Generation failed');
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const rawEvent of events) {
        processEvent(rawEvent);
      }
    }

    if (buffer.trim()) {
      processEvent(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}

function DocumentSectionPreview({
  section,
  sources,
  hideHeading = false,
}: {
  section: PDFContentStructure['sections'][number];
  sources?: SearchSource[];
  hideHeading?: boolean;
}) {
  if (isSourcesSection(section) && sources?.length) {
    return <SourcesSectionPreview sources={sources} />;
  }

  if (section.type === 'table' && section.rows?.length) {
    return <TablePreview rows={section.rows} />;
  }

  if (section.type === 'list' && section.items?.length) {
    return (
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
        {section.items.map((item, index) => <li key={index}>{valueToText(item)}</li>)}
      </ul>
    );
  }

  const markdownText = textWithPreservedStructure(section.content);
  const markdownDirection = textDirection(markdownText);
  const markdownIsRtl = markdownDirection === 'rtl';

  return (
    <div dir={markdownDirection} className={`mt-2 text-sm text-gray-700 dark:text-gray-300 ${textAlignClass(markdownText)}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">{children}</h3>,
          p: ({ children }) => <p className="mb-3 leading-6">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>,
          code: ({ children }) => <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-700">{children}</code>,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table
                dir={markdownDirection}
                className={`min-w-full border-collapse ${markdownIsRtl ? 'text-right [direction:rtl]' : 'text-left [direction:ltr]'}`}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => <th dir="auto" className={`border border-gray-200 bg-gray-100 px-3 py-2 align-top [overflow-wrap:anywhere] dark:border-gray-700 dark:bg-gray-700 ${markdownIsRtl ? 'text-right' : 'text-left'}`}>{children}</th>,
          td: ({ children }) => <td dir="auto" className={`border border-gray-200 px-3 py-2 align-top [overflow-wrap:anywhere] dark:border-gray-700 ${markdownIsRtl ? 'text-right' : 'text-left'}`}>{children}</td>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="break-all text-blue-600 underline [overflow-wrap:anywhere] dark:text-blue-400">{children}</a>,
        }}
      >
        {markdownText}
      </ReactMarkdown>
    </div>
  );
}

function isExtractedTable(section: PDFContentStructure['sections'][number]) {
  return section.type === 'table' && /-table-\d+$/.test(valueToText(section.id));
}

function isSourcesSection(section: PDFContentStructure['sections'][number]) {
  return valueToText(section.id) === 'sources' || valueToText(section.heading).trim() === 'Sources';
}

function groupDisplaySections(sections: PDFContentStructure['sections']) {
  const groups: Array<{
    key: string;
    heading: string;
    sections: PDFContentStructure['sections'];
  }> = [];

  sections.forEach((section, index) => {
    if (isExtractedTable(section) && groups.length > 0) {
      groups[groups.length - 1].sections.push(section);
      return;
    }

    groups.push({
      key: valueToText(section.id) || `${valueToText(section.heading)}-${index}`,
      heading: valueToText(section.heading),
      sections: [section],
    });
  });

  return groups;
}

function normalizeSourcePreviewUrl(source: SearchSource) {
  if (source.displayUrl?.trim()) return source.displayUrl.trim();

  try {
    const parsed = new URL(source.url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return source.url;
  }
}

function dedupePreviewSources(sources: SearchSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.url.toLowerCase().replace(/\/$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function SourcesSectionPreview({ sources }: { sources: SearchSource[] }) {
  const uniqueSources = dedupePreviewSources(sources);

  return (
    <div className="mt-3 space-y-4">
      {uniqueSources.map((source, index) => {
        const sample = `${source.title} ${source.description || ''} ${source.context || ''}`;
        const direction = textDirection(sample);

        return (
          <article
            key={source.id || `${source.url}-${index}`}
            dir={direction}
            className={`rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40 ${textAlignClass(sample)}`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {index + 1}. {source.title}
                </h4>
                {source.description?.trim() && (
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    {source.description.trim()}
                  </p>
                )}
              </div>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                dir="ltr"
                className="shrink-0 rounded-md bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700 underline underline-offset-2 dark:bg-blue-950/40 dark:text-blue-300"
              >
                {normalizeSourcePreviewUrl(source)}
              </a>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
              {source.publishedDate && <span><strong className="font-medium text-gray-700 dark:text-gray-200">Published:</strong> {source.publishedDate}</span>}
              <span><strong className="font-medium text-gray-700 dark:text-gray-200">Accessed:</strong> {source.accessedAt}</span>
              {source.sourceType && <span><strong className="font-medium text-gray-700 dark:text-gray-200">Type:</strong> {source.sourceType}</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function TablePreview({ rows }: { rows: string[][] }) {
  const joined = rows.flat().map((cell) => valueToText(cell)).join(' ');
  const direction = containsRtl(joined) ? 'rtl' : 'ltr';
  const alignClass = textAlignClass(joined);

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table dir={direction} className={`min-w-full border-collapse text-sm ${alignClass} ${direction === 'rtl' ? '[direction:rtl]' : '[direction:ltr]'}`}>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex === 0 ? 'bg-gray-100 dark:bg-gray-700' : 'bg-white dark:bg-gray-800'}>
              {row.map((cell, cellIndex) => {
                const cellValue = valueToText(cell);
                const cellClass = `border-b border-r border-gray-200 px-3 py-2 align-top last:border-r-0 [overflow-wrap:anywhere] dark:border-gray-700 ${textAlignClass(cellValue)}`;

                return rowIndex === 0 ? (
                  <th key={cellIndex} dir={textDirection(cellValue)} className={cellClass}>{cellValue}</th>
                ) : (
                  <td key={cellIndex} dir={textDirection(cellValue)} className={cellClass}>{cellValue}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditableTable({
  rows,
  onChange,
}: {
  rows: string[][];
  onChange: (rows: string[][]) => void;
}) {
  const joined = rows.flat().map((cell) => valueToText(cell)).join(' ');
  const direction = containsRtl(joined) ? 'rtl' : 'ltr';
  const alignClass = textAlignClass(joined);

  const updateCell = (rowIndex: number, cellIndex: number, value: string) => {
    onChange(rows.map((row, currentRowIndex) => (
      currentRowIndex === rowIndex
        ? row.map((cell, currentCellIndex) => currentCellIndex === cellIndex ? value : cell)
        : row
    )));
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table dir={direction} className={`min-w-full border-collapse text-sm ${alignClass} ${direction === 'rtl' ? '[direction:rtl]' : '[direction:ltr]'}`}>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex === 0 ? 'bg-gray-100 dark:bg-gray-700' : 'bg-white dark:bg-gray-800'}>
              {row.map((cell, cellIndex) => {
                const cellValue = valueToText(cell);

                return (
                  <td key={cellIndex} className="border-b border-r border-gray-200 p-0 last:border-r-0 dark:border-gray-700">
                    <textarea
                      value={cellValue}
                      onChange={(event) => updateCell(rowIndex, cellIndex, event.target.value)}
                      dir={textDirection(cellValue)}
                      className={`min-h-16 w-full resize-y bg-transparent px-3 py-2 outline-none [overflow-wrap:anywhere] ${textAlignClass(cellValue)}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
