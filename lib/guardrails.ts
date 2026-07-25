// ponytail: centralized guardrails — add rules here, not scattered across files.

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB
const MAX_MESSAGE_LENGTH = 8_000; // characters

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  data: string;
}

// ── File size ──────────────────────────────────────────────────────────────

export function checkFileSize(file: { name: string; size: number }): string | null {
  if (file.size > MAX_FILE_SIZE) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `Arquivo "${file.name}" (${mb} MB) excede o limite de 3 MB.`;
  }
  return null;
}

export function checkAllFileSizes(files: UploadedFile[]): string | null {
  for (const f of files) {
    const err = checkFileSize(f);
    if (err) return err;
  }
  return null;
}

// ── Blacklisted file extensions ────────────────────────────────────────────

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib',
  '.sh', '.bash', '.zsh', '.fish',
  '.bat', '.cmd', '.ps1', '.vbs', '.wsf',
  '.js', '.mjs', '.cjs', '.ts', '.py', '.rb', '.php', '.pl',
  '.jar', '.class', '.war',
  '.msi', '.apk', '.ipa', '.app',
  '.bin', '.scr', '.pif', '.com',
  '.reg', '.psm1', '.psd1',
]);

const BLOCKED_MIME_TYPES = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-sh',
  'application/x-shellscript',
  'application/x-bat',
  'application/x-powershell',
  'application/x-msi',
  'application/java-archive',
  'application/x-python-code',
]);

export function checkFileType(file: { name: string; type: string }): string | null {
  const lowerName = file.name.toLowerCase();
  const ext = '.' + lowerName.split('.').pop();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return `Tipo de arquivo não permitido: ${ext}. Apenas CSV, Excel, JSON, Parquet e TXT.`;
  }
  if (BLOCKED_MIME_TYPES.has(file.type)) {
    return `Tipo MIME não permitido: ${file.type}.`;
  }
  return null;
}

// ── Prompt injection patterns ──────────────────────────────────────────────

// Zero-width and invisible characters
const INVISIBLE_CHARS = /[\u200B-\u200F\u2028-\u202F\u2060-\u2064\uFEFF\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u00A0\uFFF0-\uFFFF]/;

// Unicode homoglyph attack — chars from scripts that look like ASCII
const HOMOGLYPH_CHARS = /[\u0391-\u03C9\u0400-\u04FF\uFF21-\uFF5A]/;

// Prompt injection / jailbreak patterns — case-insensitive
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|before)\s+(instructions?|directives?|messages?|prompts?|rules?)/i,
  /ignor[ea]\s+(todas\s+)?(as?\s+)?(instruções?|diretrizes?|mensagens?|regras?)\s+(anteriores?|acima|prévias?)/i,
  /disregard\s+(all\s+)?(previous|prior|above|before)\s+(instructions?|directives?|messages?)/i,
  /forget\s+(all\s+)?(previous|prior|above|before)\s+(instructions?|directives?|messages?)/i,

  // Override / impersonation
  /you\s+are\s+now\s+(a\s+)?(different|new)\s+(role|persona|ai|assistant|system)/i,
  /você\s+(agora|não\s+é\s+mais)\s+(é\s+)?(um|uma)\s+(nov[oa]\s+)?(personagem|assistente|ai|sistema)/i,
  /act\s+as\s+(if\s+you\s+are|a\s+different)/i,
  /(system\s*:\s*|system\s+prompt\s*:|you\s+must\s+obey\s*(the\s+)?(user|me|this)\s*(above\s+all|only|now))/i,

  // DAN / jailbreak
  /\bDAN\b.*\b(do\s+anything\s+now|jailbreak)\b/i,
  /developer\s+mode|god\s*mode|override\s+mode/i,
  /você\s+não\s+tem\s+(mais\s+)?(nenhuma\s+)?(regras?|limitações?|restrições?)/i,

  // Prompt leaking
  /(repeat|tell\s+me|show\s+me|reveal|print|output|write\s+out)\s+(your\s+)?(system\s+)?(prompt|instructions?|directives?|rules?|guidelines?)(\s+verbatim)?/i,
  /(repita|mostre|revele|escreva|diga)\s+(seu\s+)?(prompt|instruções?|diretrizes?|regras?)(\s+(de\s+)?sistema)?/i,
  /\b((initial|original|starting|first|hidden)\s+prompt)\b/i,

  // Delimiter injection
  /(```|~~~)\s*(system|instructions?|prompt|rules?)\s*(```|~~~)/i,
];

const REJECTION_MESSAGE = 'Desculpe, não posso processar essa mensagem. Por favor, reformule sua pergunta.';

export function checkPromptInjection(text: string): string | null {
  const cleaned = text.trim();

  if (!cleaned) return null;

  // Check invisible chars (only if ratio of invisible to visible is suspicious)
  const invisibleCount = (cleaned.match(INVISIBLE_CHARS) || []).length;
  if (invisibleCount > 3) {
    return REJECTION_MESSAGE;
  }

  // Check homoglyph attack
  if (HOMOGLYPH_CHARS.test(cleaned)) {
    return REJECTION_MESSAGE;
  }

  // Check injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(cleaned)) {
      return REJECTION_MESSAGE;
    }
  }

  return null;
}

export function checkFiles(files: UploadedFile[]): string | null {
  const sizeErr = checkAllFileSizes(files);
  if (sizeErr) return sizeErr;
  for (const f of files) {
    const typeErr = checkFileType(f);
    if (typeErr) return typeErr;
  }
  return null;
}

// ── XSS sanitization ───────────────────────────────────────────────────────

// Strip HTML tags, event handlers, javascript: URLs
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<\s*\/?\s*(script|iframe|object|embed|applet|meta|link|style)\b[^>]*>/gi,
  /\bon\w+\s*=\s*["'][^"']*["']/gi,     // onerror=, onclick=, etc.
  /\bon\w+\s*=\s*[^\s>]+/gi,
  /javascript\s*:\s*/gi,
  /<\s*img[^>]+\bon\w+[^>]*>/gi,        // <img onerror=...>
  /<\s*svg[^>]*\bon\w+[^>]*>/gi,        // <svg onload=...>
  /<\s*body[^>]*\bon\w+[^>]*>/gi,
];

export function sanitizeInput(text: string): string {
  let cleaned = text;
  for (const pattern of XSS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Strip remaining HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  // Unescape common entities back to safe chars
  cleaned = cleaned
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  return cleaned.trim();
}

// ── Message length ─────────────────────────────────────────────────────────

export function checkMessageLength(text: string): string | null {
  if (text.length > MAX_MESSAGE_LENGTH) {
    return `Mensagem excede o limite de ${MAX_MESSAGE_LENGTH} caracteres.`;
  }
  return null;
}
