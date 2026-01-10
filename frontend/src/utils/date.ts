export function parseBigQueryTimestamp(timestamp: string): Date {
  if (!timestamp) return new Date(NaN);

  // Scientific notation (e.g., "1.767940533372E9")
  if (timestamp.includes('E') || timestamp.includes('e')) {
    const ms = parseFloat(timestamp);
    // If the value is less than ~2100 in seconds, it's likely seconds not milliseconds
    if (ms < 4102444800000) {
      return new Date(ms * 1000);
    }
    return new Date(ms);
  }

  // Pure numeric string (Unix timestamp in seconds or milliseconds)
  if (/^\d+(\.\d+)?$/.test(timestamp)) {
    const num = parseFloat(timestamp);
    // If less than ~2100 in seconds, treat as seconds
    if (num < 4102444800) {
      return new Date(num * 1000);
    }
    return new Date(num);
  }

  // ISO format (already works with Date constructor)
  if (timestamp.includes('T')) {
    return new Date(timestamp);
  }

  // BigQuery format: "2024-01-15 10:30:00.000000 UTC"
  if (timestamp.includes(' UTC')) {
    return new Date(timestamp.replace(' UTC', 'Z').replace(' ', 'T'));
  }

  // Fallback to native parsing
  return new Date(timestamp);
}
