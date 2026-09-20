export function logEvent(
  level: 'INFO' | 'WARN' | 'ERROR',
  category: 'SSO' | 'ESI' | 'CATALOG' | 'SERVER',
  message: string,
  meta?: Record<string, any>
) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${timestamp}] [${level}] [${category}] ${message}${metaStr}`);
}
