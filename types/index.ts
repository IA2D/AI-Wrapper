// Task 1.4: ImageAttachment interface (renamed from FileAttachment)
export interface ImageAttachment {
  id: string;
  name: string;
  url: string; // base64 data URL or object URL
  mimeType: string;
  size: number;
}

export interface AudioAttachment {
  id: string;
  name: string;
  url: string; // base64 data URL
  mimeType: string;
  size: number;
  durationSeconds: number;
  waveform?: number[];
}

export interface SearchSource {
  id: string;
  title: string;
  url: string;
  displayUrl?: string;
  description?: string;
  publishedDate?: string;
  accessedAt: string;
  query: string;
  context: string;
  sourceType?: 'web' | 'academic' | 'news';
}

// PDF Attachment interface for RAG system
export interface PDFAttachment {
  id: string;
  docId: string;
  name: string;
  size: number;
  pageCount: number;
  chunkCount: number;
  uploadedAt: Date;
}

// Task 1.1: Extended Message interface with role and thinking content
export interface MessageContent {
  text: string;
  images?: ImageAttachment[];
  audio?: AudioAttachment[];
  pdfs?: PDFAttachment[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: MessageContent;
  timestamp: Date;
  thinking?: string; // Optional thinking process for assistant messages
  metadata?: {
    incomplete?: boolean;
    stopReason?: 'length' | 'error' | 'cancelled' | 'unknown';
    canContinue?: boolean;
    savedMemoryIds?: string[];
    sources?: SearchSource[];
    model?: string;
    modelLabel?: string;
    provider?: string;
    modelConfigId?: string;
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
  };
}

export type UserMemoryKind = 'profile' | 'preference' | 'project' | 'usage';

export interface UserMemory {
  id: string;
  kind: UserMemoryKind;
  content: string;
  importance: number;
  sourceMessageId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Task 1.2: ChatSession interface and related types
export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    messageCount: number;
    lastMessagePreview?: string;
  };
  attachedPDFs?: PDFAttachment[]; // PDFs attached to this session for RAG context
}

export interface APIConfiguration {
  endpoint: string;
  apiKey: string;
  model: string; // Default: "Qwen/Qwen3.5-9B"
}

// Storage schema interfaces
export interface StoredSessions {
  sessions: ChatSession[];
  version: string; // For future migration support
}

export interface StoredAPIConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

// Storage keys constants
export const STORAGE_KEYS = {
  SESSIONS: 'chat_sessions',
  CURRENT_SESSION: 'current_session_id',
  API_CONFIG: 'api_configuration',
  THINKING_MODE: 'thinking_mode_enabled',
} as const;

// Task 1.3: Error type definitions
export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
}

export interface AppError {
  type: ErrorType;
  message: string;
  details?: any;
}

export class StorageError extends Error {
  constructor(
    message: string,
    public code: 'QUOTA_EXCEEDED' | 'PARSE_ERROR' | 'ACCESS_DENIED' | 'UNKNOWN'
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

// Legacy FileAttachment interface (deprecated, kept for backward compatibility)
export interface FileAttachment {
  id: string;
  name: string;
  type: 'document' | 'video' | 'image';
  url: string;
  file: File;
  size: number;
  mimeType: string;
}

// UUID generation for message and attachment IDs
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Type guards
export function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    (obj.role === 'user' || obj.role === 'assistant') &&
    typeof obj.content === 'object' &&
    obj.content !== null &&
    obj.timestamp instanceof Date &&
    (obj.thinking === undefined || typeof obj.thinking === 'string')
  );
}

export function isMessageContent(value: unknown): value is MessageContent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.text === 'string' &&
    (obj.images === undefined || (Array.isArray(obj.images) && obj.images.every(isImageAttachment))) &&
    (obj.audio === undefined || (Array.isArray(obj.audio) && obj.audio.every(isAudioAttachment))) &&
    (obj.pdfs === undefined || (Array.isArray(obj.pdfs) && obj.pdfs.every(isPDFAttachment)))
  );
}

export function isImageAttachment(value: unknown): value is ImageAttachment {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.mimeType === 'string' &&
    typeof obj.size === 'number'
  );
}

export function isPDFAttachment(value: unknown): value is PDFAttachment {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.docId === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.size === 'number' &&
    typeof obj.pageCount === 'number' &&
    typeof obj.chunkCount === 'number' &&
    obj.uploadedAt instanceof Date
  );
}

export function isAudioAttachment(value: unknown): value is AudioAttachment {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.mimeType === 'string' &&
    typeof obj.size === 'number' &&
    typeof obj.durationSeconds === 'number' &&
    (obj.waveform === undefined || (Array.isArray(obj.waveform) && obj.waveform.every((value) => typeof value === 'number')))
  );
}

export function isChatSession(value: unknown): value is ChatSession {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    Array.isArray(obj.messages) &&
    obj.messages.every(isMessage) &&
    obj.createdAt instanceof Date &&
    obj.updatedAt instanceof Date
  );
}

export function isAPIConfiguration(value: unknown): value is APIConfiguration {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.endpoint === 'string' &&
    typeof obj.apiKey === 'string' &&
    typeof obj.model === 'string'
  );
}

// Legacy type guard (deprecated)
export function isFileAttachment(value: unknown): value is FileAttachment {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    (obj.type === 'document' || obj.type === 'video' || obj.type === 'image') &&
    typeof obj.url === 'string' &&
    obj.file instanceof File &&
    typeof obj.size === 'number' &&
    typeof obj.mimeType === 'string'
  );
}

// Validation functions
export function validateMessage(message: Message): { valid: boolean; error?: string } {
  // At least one of text, images, or audio must be non-empty
  if (
    !message.content.text.trim() &&
    (!message.content.images || message.content.images.length === 0) &&
    (!message.content.audio || message.content.audio.length === 0)
  ) {
    return { valid: false, error: 'Message must contain text, images, or audio' };
  }
  
  // ID must be non-empty
  if (!message.id || message.id.trim() === '') {
    return { valid: false, error: 'Message ID is required' };
  }
  
  // Role must be valid
  if (message.role !== 'user' && message.role !== 'assistant') {
    return { valid: false, error: 'Message role must be "user" or "assistant"' };
  }
  
  // Timestamp must be valid
  if (!(message.timestamp instanceof Date) || isNaN(message.timestamp.getTime())) {
    return { valid: false, error: 'Invalid timestamp' };
  }
  
  // Validate all images if present
  if (message.content.images) {
    for (const image of message.content.images) {
      const imageValidation = validateImageAttachment(image);
      if (!imageValidation.valid) {
        return imageValidation;
      }
    }
  }
  
  return { valid: true };
}

export function validateImageAttachment(attachment: ImageAttachment): { valid: boolean; error?: string } {
  if (!attachment.id || attachment.id.trim() === '') {
    return { valid: false, error: 'Image ID is required' };
  }
  
  if (!attachment.name || attachment.name.trim() === '') {
    return { valid: false, error: 'Image name is required' };
  }
  
  if (!attachment.url || attachment.url.trim() === '') {
    return { valid: false, error: 'Image URL is required' };
  }
  
  if (attachment.size <= 0) {
    return { valid: false, error: 'Image size must be positive' };
  }
  
  // Validate MIME type for images
  const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validMimeTypes.includes(attachment.mimeType)) {
    return { valid: false, error: 'Invalid image format. Supported formats: JPEG, PNG, GIF, WEBP' };
  }
  
  return { valid: true };
}

export function validateChatSession(session: ChatSession): { valid: boolean; error?: string } {
  if (!session.id || session.id.trim() === '') {
    return { valid: false, error: 'Session ID is required' };
  }
  
  if (!session.title || session.title.trim() === '') {
    return { valid: false, error: 'Session title is required' };
  }
  
  if (!Array.isArray(session.messages)) {
    return { valid: false, error: 'Session messages must be an array' };
  }
  
  // Validate all messages
  for (const message of session.messages) {
    const messageValidation = validateMessage(message);
    if (!messageValidation.valid) {
      return messageValidation;
    }
  }
  
  if (!(session.createdAt instanceof Date) || isNaN(session.createdAt.getTime())) {
    return { valid: false, error: 'Invalid createdAt timestamp' };
  }
  
  if (!(session.updatedAt instanceof Date) || isNaN(session.updatedAt.getTime())) {
    return { valid: false, error: 'Invalid updatedAt timestamp' };
  }
  
  return { valid: true };
}

export function validateAPIConfiguration(config: APIConfiguration): { valid: boolean; error?: string } {
  if (!config.endpoint || config.endpoint.trim() === '') {
    return { valid: false, error: 'API endpoint is required' };
  }
  
  // Validate HTTPS URL
  if (!config.endpoint.startsWith('https://')) {
    return { valid: false, error: 'API endpoint must be a valid HTTPS URL' };
  }
  
  try {
    new URL(config.endpoint);
  } catch {
    return { valid: false, error: 'API endpoint must be a valid URL' };
  }
  
  if (!config.apiKey || config.apiKey.trim() === '') {
    return { valid: false, error: 'API key is required' };
  }
  
  if (!config.model || config.model.trim() === '') {
    return { valid: false, error: 'Model name is required' };
  }
  
  return { valid: true };
}

// Legacy validation function (deprecated)
export function validateFileAttachment(attachment: FileAttachment): { valid: boolean; error?: string } {
  if (!attachment.id || attachment.id.trim() === '') {
    return { valid: false, error: 'Attachment ID is required' };
  }
  
  if (!attachment.name || attachment.name.trim() === '') {
    return { valid: false, error: 'Attachment name is required' };
  }
  
  if (!['document', 'video', 'image'].includes(attachment.type)) {
    return { valid: false, error: 'Invalid attachment type' };
  }
  
  if (attachment.size <= 0) {
    return { valid: false, error: 'Attachment size must be positive' };
  }
  
  return { valid: true };
}

// File type validation and mapping (for image uploads)
export type FileCategory = 'image';

export interface FileTypeInfo {
  category: FileCategory;
  mimeType: string;
  extension: string;
}

// Supported image formats mapping
const SUPPORTED_FORMATS: Record<string, FileCategory> = {
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
};

// Extension to MIME type mapping for fallback
const EXTENSION_TO_MIME: Record<string, string> = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
};

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

export function detectFileType(file: File): FileTypeInfo | null {
  const extension = getFileExtension(file.name);
  let mimeType = file.type;
  
  // If MIME type is missing or generic, try to infer from extension
  if (!mimeType || mimeType === 'application/octet-stream') {
    mimeType = EXTENSION_TO_MIME[extension] || '';
  }
  
  // Check if MIME type is supported
  const category = SUPPORTED_FORMATS[mimeType];
  if (category) {
    return { category, mimeType, extension };
  }
  
  // Fallback: check extension directly
  const fallbackMime = EXTENSION_TO_MIME[extension];
  if (fallbackMime) {
    const fallbackCategory = SUPPORTED_FORMATS[fallbackMime];
    if (fallbackCategory) {
      return { category: fallbackCategory, mimeType: fallbackMime, extension };
    }
  }
  
  return null;
}

export function validateFileType(file: File): { valid: boolean; error?: string; fileType?: FileTypeInfo } {
  const fileType = detectFileType(file);
  
  if (!fileType) {
    return {
      valid: false,
      error: 'Unsupported file type. Please upload JPG, PNG, GIF, or WEBP image files.',
    };
  }
  
  return { valid: true, fileType };
}

export function getSupportedFormats(): string[] {
  return Object.keys(SUPPORTED_FORMATS);
}

export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_TO_MIME);
}

// File Analysis and Generation Types

export interface DocumentFile {
  file: File;
  id: string;
  name: string;
  size: number;
  type: 'pdf' | 'docx' | 'xlsx' | 'unknown';
}

export interface FileAnalysisResult {
  success: boolean;
  analysis: string;
  metadata: {
    filename: string;
    fileType: string;
    pageCount?: number;
    sheetCount?: number;
  };
  originalText: string;
}

export interface FileEditResult {
  success: boolean;
  originalFile: {
    filename: string;
    fileType: string;
    pageCount?: number;
    sheetCount?: number;
  };
  editedContent?: string;
  structuredContent?: PDFContentStructure;
  format: 'text' | 'structured' | 'pdf';
}

export interface PDFContentStructure {
  title?: string;
  sources?: SearchSource[];
  sections: {
    id?: string;
    heading?: string;
    content: string;
    type?: 'paragraph' | 'list' | 'table';
    pageCount?: number;
    style?: {
      headingFontSize?: number;
      bodyFontSize?: number;
      tableFontSize?: number;
      lineGap?: number;
      spacingAfter?: number;
      density?: 'compact' | 'normal' | 'spacious';
      layout?: 'single-column' | 'two-column' | 'table-first' | 'slide';
    };
    items?: string[];
    rows?: string[][];
  }[];
}

export type DocumentToolKind = 'document' | 'excel' | 'presentation';
export type DocumentExportFormat = 'pdf' | 'doc' | 'docx' | 'sheet' | 'presentation';
export type DocumentTemplateId =
  | 'executive'
  | 'research'
  | 'modern'
  | 'academic'
  | 'dashboard'
  | 'pitch';

export interface DocumentSectionPlan {
  id: string;
  heading: string;
  summary: string;
  pageCount: number;
  include: boolean;
  allowTables: boolean;
  allowCharts: boolean;
  style?: {
    headingFontSize: number;
    bodyFontSize: number;
    tableFontSize: number;
    lineGap: number;
    spacingAfter: number;
    density: 'compact' | 'normal' | 'spacious';
    layout: 'single-column' | 'two-column' | 'table-first' | 'slide';
  };
}

export interface DocumentOutlinePlan {
  title: string;
  totalPages: number;
  pageRange?: {
    min: number;
    max: number;
  };
  documentKind: DocumentToolKind;
  exportFormat: DocumentExportFormat;
  templateId?: DocumentTemplateId;
  sections: DocumentSectionPlan[];
}

export type DocumentJobStatus = 'setup' | 'outline' | 'generating' | 'editing' | 'completed' | 'failed';

export interface DocumentCreationJob {
  id: string;
  title: string;
  prompt: string;
  status: DocumentJobStatus;
  pageCount: number;
  pageRange?: {
    min: number;
    max: number;
  };
  documentKind: DocumentToolKind;
  exportFormat: DocumentExportFormat;
  templateId?: DocumentTemplateId;
  includeTables: boolean;
  includeCharts: boolean;
  enableSearch?: boolean;
  outline?: DocumentOutlinePlan | null;
  content?: PDFContentStructure | null;
  progress: {
    completed: number;
    total: number;
    percent: number;
    activeSectionId?: string | null;
  };
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ChatRunStatus = 'queued' | 'processing' | 'streaming' | 'completed' | 'failed' | 'cancelled';

export interface ChatRun {
  id: string;
  sessionId: string;
  status: ChatRunStatus;
  statusMessage?: string | null;
  thinkingMode: boolean;
  answerText: string;
  thinkingText: string;
  assistantMessage?: Message | null;
  error?: string | null;
  stopReason?: 'length' | 'error' | 'cancelled' | 'unknown' | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowChartNode {
  id: string;
  label: string;
  type?: 'input' | 'default' | 'decision' | 'output';
  x?: number;
  y?: number;
}

export interface FlowChartEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface FlowChartContent {
  title: string;
  nodes: FlowChartNode[];
  edges: FlowChartEdge[];
}

export interface FlowChartJob {
  id: string;
  title: string;
  prompt: string;
  status: 'setup' | 'generating' | 'editing' | 'completed' | 'failed';
  content?: FlowChartContent | null;
  progress: {
    completed: number;
    total: number;
    percent: number;
    step?: string | null;
  };
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PDFGenerationRequest {
  content: PDFContentStructure;
  filename?: string;
}

export type FileAnalysisTab = 'analyze' | 'edit' | 'generate';
