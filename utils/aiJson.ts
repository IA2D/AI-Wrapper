export function extractJsonObject(text: string) {
  const cleaned = stripCodeFences(text).trim();
  const start = cleaned.indexOf('{');
  if (start < 0) return cleaned;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;

    if (depth === 0) {
      return cleaned.slice(start, index + 1);
    }
  }

  return cleaned.slice(start);
}

export function parseAiJson<T = any>(text: string): T {
  const json = extractJsonObject(text);
  const attempts = [
    json,
    repairJson(json),
    repairJson(closeUnbalancedJson(json)),
  ];
  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Invalid JSON');
}

function stripCodeFences(text: string) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/```(?:json|javascript|js)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
}

function repairJson(text: string) {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
    .replace(/,\s*([}\]])/g, '$1');
}

function closeUnbalancedJson(text: string) {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const char of text) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;
    if (char === '{') stack.push('}');
    if (char === '[') stack.push(']');
    if ((char === '}' || char === ']') && stack[stack.length - 1] === char) stack.pop();
  }

  return `${text}${inString ? '"' : ''}${stack.reverse().join('')}`;
}
