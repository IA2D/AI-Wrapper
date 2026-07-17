const RTL_START_PATTERN = /^[\s"'([{]*[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const RTL_ANY_PATTERN = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const RTL_GLOBAL_PATTERN = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
const LTR_GLOBAL_PATTERN = /[A-Za-z]/g;

export function startsWithRtl(text: unknown) {
  return RTL_START_PATTERN.test(String(text || ''));
}

export function containsRtl(text: unknown) {
  return RTL_ANY_PATTERN.test(String(text || ''));
}

export function textDirection(text: unknown): 'rtl' | 'ltr' {
  const value = String(text || '');

  if (!value.trim()) return 'ltr';
  if (startsWithRtl(value)) return 'rtl';

  const rtlCount = value.match(RTL_GLOBAL_PATTERN)?.length || 0;
  const ltrCount = value.match(LTR_GLOBAL_PATTERN)?.length || 0;

  if (rtlCount === 0) return 'ltr';
  if (ltrCount === 0) return 'rtl';

  return rtlCount >= ltrCount ? 'rtl' : 'ltr';
}

export function textAlignClass(text: unknown) {
  return textDirection(text) === 'rtl' ? 'text-end' : 'text-start';
}
