/**
 * BigQuery service for Cloudflare Workers
 * Uses Web Crypto API for JWT signing - no external libraries
 */

// Types for BigQuery operations
export interface BigQueryEnv {
  BQ_SERVICE_ACCOUNT_EMAIL: string;
  BQ_PRIVATE_KEY: string; // base64-encoded PEM private key
  BQ_PROJECT_ID: string;
  BQ_DATASET_ID: string;
  BQ_TABLE_ID: string;
}

export interface BigQueryRow {
  id: string;
  collected_at: string; // ISO timestamp
  source: 'collect' | 'prompt-lab'; // where the response came from
  company: string; // provider like "openai", "anthropic"
  product: string; // family like "gpt", "claude"
  model: string; // specific model like "gpt-4o"
  topic_id: string | null; // null for prompt-lab
  topic_name: string | null; // null for prompt-lab
  prompt_template_id: string | null; // null for prompt-lab
  prompt_template_name: string | null; // null for prompt-lab
  prompt: string; // rendered prompt or freeform prompt
  response: string | null;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  error: string | null;
  success: boolean;
}

export interface QueryResult {
  rows: BigQueryRow[];
  totalRows: number;
}

export type BigQueryResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// Token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Extract product family from model name
 * Examples:
 *   "gpt-4o" -> "gpt"
 *   "gpt-4-turbo" -> "gpt"
 *   "claude-3-5-sonnet-20241022" -> "claude"
 *   "claude-sonnet-4-20250514" -> "claude"
 *   "gemini-2.0-flash" -> "gemini"
 *   "@cf/meta/llama-3.1-8b-instruct" -> "llama"
 */
export function extractProductFamily(modelName: string): string {
  // Handle Cloudflare Workers AI format: @cf/meta/llama-3.1-8b-instruct
  if (modelName.startsWith('@cf/')) {
    const parts = modelName.split('/');
    const lastPart = parts[parts.length - 1];
    // Extract first word before dash or number
    const match = lastPart.match(/^([a-zA-Z]+)/);
    return match ? match[1].toLowerCase() : lastPart.toLowerCase();
  }

  // Standard format: extract prefix before first dash followed by number
  // "gpt-4o" -> "gpt"
  // "claude-3-5-sonnet" -> "claude"
  // "gemini-2.0-flash" -> "gemini"
  const match = modelName.match(/^([a-zA-Z]+)(?:-\d|$)/);
  if (match) {
    return match[1].toLowerCase();
  }

  // Fallback: return first segment before dash
  const firstDash = modelName.indexOf('-');
  if (firstDash > 0) {
    return modelName.substring(0, firstDash).toLowerCase();
  }

  return modelName.toLowerCase();
}

/**
 * Base64url encode (no padding, URL-safe)
 */
function base64urlEncode(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    bytes = data;
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Parse PEM private key and import for signing
 */
async function importPrivateKey(base64PemKey: string): Promise<CryptoKey> {
  // Decode base64 to get PEM string
  const pemKey = atob(base64PemKey);

  // Extract the base64 content between headers
  const pemContents = pemKey
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  // Decode base64 to binary
  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Import the key
  return await crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
}

/**
 * Create and sign JWT for Google Cloud authentication
 */
async function createSignedJWT(
  serviceAccountEmail: string,
  privateKeyBase64: string,
  scope: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600; // 1 hour

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: serviceAccountEmail,
    sub: serviceAccountEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: expiry,
    scope,
  };

  const headerBase64 = base64urlEncode(JSON.stringify(header));
  const payloadBase64 = base64urlEncode(JSON.stringify(payload));
  const unsignedToken = `${headerBase64}.${payloadBase64}`;

  const privateKey = await importPrivateKey(privateKeyBase64);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureBase64 = base64urlEncode(signature);
  return `${unsignedToken}.${signatureBase64}`;
}

/**
 * Get OAuth2 access token using JWT grant
 */
async function getAccessToken(env: BigQueryEnv): Promise<BigQueryResult<string>> {
  // Check cache first (with 5 minute buffer)
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 5 * 60 * 1000) {
    return { success: true, data: cachedToken.token };
  }

  try {
    const jwt = await createSignedJWT(
      env.BQ_SERVICE_ACCOUNT_EMAIL,
      env.BQ_PRIVATE_KEY,
      'https://www.googleapis.com/auth/bigquery'
    );

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `OAuth token request failed: ${response.status} ${errorText}`,
      };
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    // Cache the token
    cachedToken = {
      token: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };

    return { success: true, data: data.access_token };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Failed to get access token: ${message}` };
  }
}

/**
 * Insert a row into BigQuery using streaming insert
 */
export async function insertRow(
  env: BigQueryEnv,
  row: BigQueryRow
): Promise<BigQueryResult<void>> {
  const tokenResult = await getAccessToken(env);
  if (!tokenResult.success) {
    return tokenResult;
  }

  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${env.BQ_PROJECT_ID}/datasets/${env.BQ_DATASET_ID}/tables/${env.BQ_TABLE_ID}/insertAll`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResult.data}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rows: [
          {
            insertId: row.id, // Deduplication key
            json: {
              id: row.id,
              collected_at: row.collected_at,
              source: row.source,
              company: row.company,
              product: row.product,
              model: row.model,
              topic_id: row.topic_id,
              topic_name: row.topic_name,
              prompt_template_id: row.prompt_template_id,
              prompt_template_name: row.prompt_template_name,
              prompt: row.prompt,
              response: row.response,
              latency_ms: row.latency_ms,
              input_tokens: row.input_tokens,
              output_tokens: row.output_tokens,
              error: row.error,
              success: row.success,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `BigQuery insert failed: ${response.status} ${errorText}`,
      };
    }

    const result = (await response.json()) as {
      insertErrors?: Array<{
        index: number;
        errors: Array<{ message: string; reason: string }>;
      }>;
    };

    if (result.insertErrors && result.insertErrors.length > 0) {
      const errorMessages = result.insertErrors
        .flatMap((e) => e.errors.map((err) => err.message))
        .join('; ');
      return {
        success: false,
        error: `BigQuery insert errors: ${errorMessages}`,
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `BigQuery insert failed: ${message}` };
  }
}

/**
 * Query responses for a specific topic
 */
export async function queryResponses(
  env: BigQueryEnv,
  topicId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<BigQueryResult<QueryResult>> {
  const tokenResult = await getAccessToken(env);
  if (!tokenResult.success) {
    return tokenResult;
  }

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${env.BQ_PROJECT_ID}/queries`;

  // Use parameterized query to prevent SQL injection
  const query = `
    SELECT *
    FROM \`${env.BQ_PROJECT_ID}.${env.BQ_DATASET_ID}.${env.BQ_TABLE_ID}\`
    WHERE topic_id = @topic_id
    ORDER BY collected_at DESC
    LIMIT @limit
    OFFSET @offset
  `;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResult.data}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        useLegacySql: false,
        parameterMode: 'NAMED',
        queryParameters: [
          {
            name: 'topic_id',
            parameterType: { type: 'STRING' },
            parameterValue: { value: topicId },
          },
          {
            name: 'limit',
            parameterType: { type: 'INT64' },
            parameterValue: { value: String(limit) },
          },
          {
            name: 'offset',
            parameterType: { type: 'INT64' },
            parameterValue: { value: String(offset) },
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `BigQuery query failed: ${response.status} ${errorText}`,
      };
    }

    const result = (await response.json()) as {
      jobComplete: boolean;
      totalRows: string;
      schema: {
        fields: Array<{ name: string; type: string }>;
      };
      rows?: Array<{
        f: Array<{ v: string | null }>;
      }>;
    };

    if (!result.jobComplete) {
      return {
        success: false,
        error: 'BigQuery query did not complete synchronously',
      };
    }

    // Parse rows based on schema
    const rows: BigQueryRow[] = (result.rows ?? []).map((row) => {
      const fields = result.schema.fields;
      const values = row.f;

      const getValue = (name: string): string | null => {
        const index = fields.findIndex((f) => f.name === name);
        return index >= 0 ? values[index].v : null;
      };

      return {
        id: getValue('id') ?? '',
        collected_at: getValue('collected_at') ?? '',
        company: getValue('company') ?? '',
        product: getValue('product') ?? '',
        model: getValue('model') ?? '',
        topic_id: getValue('topic_id') ?? '',
        topic_name: getValue('topic_name') ?? '',
        prompt_template_id: getValue('prompt_template_id') ?? '',
        prompt_template_name: getValue('prompt_template_name') ?? '',
        prompt: getValue('prompt') ?? '',
        response: getValue('response'),
        latency_ms: parseInt(getValue('latency_ms') ?? '0', 10),
        input_tokens: parseInt(getValue('input_tokens') ?? '0', 10),
        output_tokens: parseInt(getValue('output_tokens') ?? '0', 10),
        error: getValue('error'),
        success: getValue('success') === 'true',
      };
    });

    return {
      success: true,
      data: {
        rows,
        totalRows: parseInt(result.totalRows, 10),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `BigQuery query failed: ${message}` };
  }
}

/**
 * Topic as stored in BigQuery responses
 */
export interface BigQueryTopic {
  id: string;
  name: string;
  response_count: number;
}

/**
 * Get all topics from BigQuery (derived from responses)
 */
export async function getTopicsFromBigQuery(
  env: BigQueryEnv
): Promise<BigQueryResult<BigQueryTopic[]>> {
  const tokenResult = await getAccessToken(env);
  if (!tokenResult.success) {
    return tokenResult;
  }

  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${env.BQ_PROJECT_ID}/queries`;

  const query = `
    SELECT
      topic_id,
      topic_name,
      COUNT(*) as response_count
    FROM \`${env.BQ_PROJECT_ID}.${env.BQ_DATASET_ID}.${env.BQ_TABLE_ID}\`
    WHERE success = TRUE AND topic_id IS NOT NULL
    GROUP BY topic_id, topic_name
    ORDER BY topic_name
  `;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResult.data}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        useLegacySql: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `BigQuery query failed: ${response.status} ${errorText}`,
      };
    }

    const result = (await response.json()) as {
      jobComplete: boolean;
      rows?: Array<{
        f: Array<{ v: string | null }>;
      }>;
    };

    if (!result.jobComplete) {
      return {
        success: false,
        error: 'BigQuery query did not complete synchronously',
      };
    }

    const topics: BigQueryTopic[] = (result.rows ?? []).map((row) => ({
      id: row.f[0].v ?? '',
      name: row.f[1].v ?? '',
      response_count: parseInt(row.f[2].v ?? '0', 10),
    }));

    return { success: true, data: topics };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `BigQuery query failed: ${message}` };
  }
}

/**
 * Get distinct topic IDs that have responses in BigQuery
 */
export async function getTopicIdsWithResponses(
  env: BigQueryEnv
): Promise<BigQueryResult<string[]>> {
  const tokenResult = await getAccessToken(env);
  if (!tokenResult.success) {
    return tokenResult;
  }

  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${env.BQ_PROJECT_ID}/queries`;

  const query = `
    SELECT DISTINCT topic_id
    FROM \`${env.BQ_PROJECT_ID}.${env.BQ_DATASET_ID}.${env.BQ_TABLE_ID}\`
    WHERE success = TRUE
    ORDER BY topic_id
  `;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResult.data}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        useLegacySql: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `BigQuery query failed: ${response.status} ${errorText}`,
      };
    }

    const result = (await response.json()) as {
      jobComplete: boolean;
      rows?: Array<{
        f: Array<{ v: string | null }>;
      }>;
    };

    if (!result.jobComplete) {
      return {
        success: false,
        error: 'BigQuery query did not complete synchronously',
      };
    }

    const topicIds = (result.rows ?? []).map((row) => row.f[0].v ?? '').filter(Boolean);

    return { success: true, data: topicIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `BigQuery query failed: ${message}` };
  }
}

/**
 * Prompt Lab query result
 */
export interface PromptLabQuery {
  id: string;
  collected_at: string;
  prompt: string;
  responses: Array<{
    model: string;
    company: string;
    response: string | null;
    latency_ms: number;
    error: string | null;
    success: boolean;
  }>;
}

/**
 * Get recent prompts from Prompt Lab
 */
export async function getRecentPrompts(
  env: BigQueryEnv,
  options: { limit?: number; search?: string } = {}
): Promise<BigQueryResult<PromptLabQuery[]>> {
  const tokenResult = await getAccessToken(env);
  if (!tokenResult.success) {
    return tokenResult;
  }

  const limit = options.limit ?? 50;
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${env.BQ_PROJECT_ID}/queries`;

  // Query prompts from prompt-lab source, grouped by prompt text and timestamp
  let query = `
    SELECT
      prompt,
      collected_at,
      ARRAY_AGG(STRUCT(
        id,
        model,
        company,
        response,
        latency_ms,
        error,
        success
      )) as responses
    FROM \`${env.BQ_PROJECT_ID}.${env.BQ_DATASET_ID}.${env.BQ_TABLE_ID}\`
    WHERE source = 'prompt-lab'
  `;

  const queryParameters: Array<{
    name: string;
    parameterType: { type: string };
    parameterValue: { value: string };
  }> = [];

  if (options.search) {
    query += ` AND LOWER(prompt) LIKE CONCAT('%', LOWER(@search), '%')`;
    queryParameters.push({
      name: 'search',
      parameterType: { type: 'STRING' },
      parameterValue: { value: options.search },
    });
  }

  query += `
    GROUP BY prompt, collected_at
    ORDER BY collected_at DESC
    LIMIT @limit
  `;

  queryParameters.push({
    name: 'limit',
    parameterType: { type: 'INT64' },
    parameterValue: { value: String(limit) },
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResult.data}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        useLegacySql: false,
        parameterMode: 'NAMED',
        queryParameters,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `BigQuery query failed: ${response.status} ${errorText}`,
      };
    }

    const result = (await response.json()) as {
      jobComplete: boolean;
      schema: {
        fields: Array<{ name: string; type: string }>;
      };
      rows?: Array<{
        f: Array<{ v: unknown }>;
      }>;
    };

    if (!result.jobComplete) {
      return {
        success: false,
        error: 'BigQuery query did not complete synchronously',
      };
    }

    // Parse the results - prompt, collected_at, responses array
    const prompts: PromptLabQuery[] = (result.rows ?? []).map((row) => {
      const prompt = row.f[0].v as string;
      const collected_at = row.f[1].v as string;
      const responsesArray = row.f[2].v as Array<{ v: { f: Array<{ v: unknown }> } }>;

      const responses = (responsesArray ?? []).map((r) => {
        const fields = r.v.f;
        return {
          id: fields[0].v as string,
          model: fields[1].v as string,
          company: fields[2].v as string,
          response: fields[3].v as string | null,
          latency_ms: parseInt(fields[4].v as string, 10) || 0,
          error: fields[5].v as string | null,
          success: fields[6].v === true || fields[6].v === 'true',
        };
      });

      return {
        id: responses[0]?.id ?? crypto.randomUUID(),
        collected_at,
        prompt,
        responses,
      };
    });

    return { success: true, data: prompts };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `BigQuery query failed: ${message}` };
  }
}

/**
 * Clear the token cache (useful for testing or after errors)
 */
export function clearTokenCache(): void {
  cachedToken = null;
}
