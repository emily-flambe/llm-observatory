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
  prompt_id: string; // groups all responses from a single prompt submission
  collected_at: string; // ISO timestamp
  source: 'collect' | 'prompt-lab' | 'collection'; // where the response came from
  company: string; // provider like "openai", "anthropic"
  product: string; // family like "gpt", "claude"
  model: string; // specific model like "gpt-4o"
  topic_id: string | null; // null for prompt-lab
  topic_name: string | null; // null for prompt-lab
  prompt_template_id: string | null; // null for prompt-lab
  prompt_template_name: string | null; // null for prompt-lab
  prompt: string; // rendered prompt or freeform prompt
  response: string | null;
  reasoning_content: string | null; // chain-of-thought from reasoning models
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  input_cost: number | null; // USD cost for input tokens (null if pricing unknown)
  output_cost: number | null; // USD cost for output tokens (null if pricing unknown)
  error: string | null;
  success: boolean;
  collection_id?: string | null; // reference to D1 collection
  collection_version?: number | null; // version at time of collection
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
 * Extract company (creator) from provider and model name
 * For Cloudflare-hosted models, extracts the actual creator from the model path
 * Examples:
 *   provider: "openai" -> "OpenAI"
 *   provider: "anthropic" -> "Anthropic"
 *   provider: "google" -> "Google"
 *   provider: "cloudflare", model: "@cf/meta/llama-3.1-8b" -> "Meta"
 *   provider: "cloudflare", model: "@cf/qwen/qwen3-30b" -> "Qwen"
 *   provider: "cloudflare", model: "@cf/mistralai/mistral-small" -> "Mistral AI"
 *   provider: "cloudflare", model: "@cf/google/gemma-3-12b" -> "Google"
 *   provider: "cloudflare", model: "@cf/deepseek-ai/deepseek-r1" -> "DeepSeek"
 */
export function extractCompany(provider: string, modelName: string): string {
  // For Cloudflare-hosted models, extract vendor from model path
  if (provider === 'cloudflare' && modelName.startsWith('@cf/')) {
    const parts = modelName.split('/');
    if (parts.length >= 2) {
      const vendor = parts[1].toLowerCase();
      const vendorMap: Record<string, string> = {
        meta: 'Meta',
        qwen: 'Qwen',
        mistralai: 'Mistral AI',
        google: 'Google',
        'deepseek-ai': 'DeepSeek',
      };
      return vendorMap[vendor] ?? vendor;
    }
  }

  // For direct API providers, use proper casing
  const providerMap: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    cloudflare: 'Cloudflare',
    xai: 'xAI',
    deepseek: 'DeepSeek',
  };

  return providerMap[provider.toLowerCase()] ?? provider;
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
              prompt_id: row.prompt_id,
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
              reasoning_content: row.reasoning_content,
              latency_ms: row.latency_ms,
              input_tokens: row.input_tokens,
              output_tokens: row.output_tokens,
              input_cost: row.input_cost,
              output_cost: row.output_cost,
              error: row.error,
              success: row.success,
              collection_id: row.collection_id ?? null,
              collection_version: row.collection_version ?? null,
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

      const inputCostStr = getValue('input_cost');
      const outputCostStr = getValue('output_cost');

      return {
        id: getValue('id') ?? '',
        prompt_id: getValue('prompt_id') ?? '',
        collected_at: getValue('collected_at') ?? '',
        source: (getValue('source') as 'collect' | 'prompt-lab' | 'collection') ?? 'collect',
        company: getValue('company') ?? '',
        product: getValue('product') ?? '',
        model: getValue('model') ?? '',
        topic_id: getValue('topic_id') ?? '',
        topic_name: getValue('topic_name') ?? '',
        prompt_template_id: getValue('prompt_template_id') ?? '',
        prompt_template_name: getValue('prompt_template_name') ?? '',
        prompt: getValue('prompt') ?? '',
        response: getValue('response'),
        reasoning_content: getValue('reasoning_content'),
        latency_ms: parseInt(getValue('latency_ms') ?? '0', 10),
        input_tokens: parseInt(getValue('input_tokens') ?? '0', 10),
        output_tokens: parseInt(getValue('output_tokens') ?? '0', 10),
        input_cost: inputCostStr ? parseFloat(inputCostStr) : null,
        output_cost: outputCostStr ? parseFloat(outputCostStr) : null,
        error: getValue('error'),
        success: getValue('success') === 'true',
        collection_id: getValue('collection_id'),
        collection_version: getValue('collection_version')
          ? parseInt(getValue('collection_version')!, 10)
          : null,
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
 * Prompt query result (from both prompt-lab and collect sources)
 */
export interface PromptLabQuery {
  id: string;
  collected_at: string;
  prompt: string;
  topic_name: string | null;
  source: string;
  responses: Array<{
    model: string;
    company: string;
    response: string | null;
    latency_ms: number;
    input_tokens: number;
    output_tokens: number;
    input_cost: number | null;
    output_cost: number | null;
    error: string | null;
    success: boolean;
  }>;
}

/**
 * Get recent prompts (from both prompt-lab and collect sources)
 */
export async function getRecentPrompts(
  env: BigQueryEnv,
  options: { limit?: number; search?: string; models?: string[]; companies?: string[]; topics?: string[]; sources?: string[] } = {}
): Promise<BigQueryResult<PromptLabQuery[]>> {
  const tokenResult = await getAccessToken(env);
  if (!tokenResult.success) {
    return tokenResult;
  }

  const limit = options.limit ?? 50;
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${env.BQ_PROJECT_ID}/queries`;

  // Query all prompts, grouped by prompt_id (or synthetic key for legacy data)
  // For records with prompt_id: group by prompt_id
  // For legacy records without prompt_id: group by timestamp + prompt hash
  let query = `
    SELECT
      COALESCE(prompt_id, CONCAT(CAST(TIMESTAMP_TRUNC(collected_at, SECOND) AS STRING), '-', TO_HEX(MD5(prompt)))) as group_id,
      MAX(prompt) as prompt,
      MAX(topic_name) as topic_name,
      MAX(source) as source,
      MAX(collected_at) as collected_at,
      ARRAY_AGG(STRUCT(
        id,
        model,
        company,
        response,
        latency_ms,
        input_tokens,
        output_tokens,
        input_cost,
        output_cost,
        error,
        success
      )) as responses
    FROM \`${env.BQ_PROJECT_ID}.${env.BQ_DATASET_ID}.${env.BQ_TABLE_ID}\`
    WHERE success = TRUE
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

  if (options.models && options.models.length > 0) {
    const modelConditions = options.models.map((_, i) => `model = @model_${i}`).join(' OR ');
    query += ` AND (${modelConditions})`;
    options.models.forEach((model, i) => {
      queryParameters.push({
        name: `model_${i}`,
        parameterType: { type: 'STRING' },
        parameterValue: { value: model },
      });
    });
  }

  if (options.companies && options.companies.length > 0) {
    // Match company by checking model name patterns since BigQuery data may have old company values
    const companyPatterns: Record<string, string[]> = {
      'Meta': ['@cf/meta/%', 'llama%'],
      'Qwen': ['@cf/qwen/%', 'qwen%', 'qwq%'],
      'Mistral AI': ['@cf/mistralai/%', 'mistral%'],
      'Google': ['@cf/google/%', 'gemini%', 'gemma%'],
      'DeepSeek': ['@cf/deepseek%', 'deepseek%'],
      'OpenAI': ['gpt-%'],
      'Anthropic': ['claude%'],
      'xAI': ['grok%'],
    };

    const allPatternConditions: string[] = [];
    let patternIndex = 0;

    for (const company of options.companies) {
      const patterns = companyPatterns[company];
      if (patterns && patterns.length > 0) {
        for (const pattern of patterns) {
          allPatternConditions.push(`LOWER(model) LIKE @company_pattern_${patternIndex}`);
          queryParameters.push({
            name: `company_pattern_${patternIndex}`,
            parameterType: { type: 'STRING' },
            parameterValue: { value: pattern.toLowerCase() },
          });
          patternIndex++;
        }
      } else {
        allPatternConditions.push(`company = @company_${patternIndex}`);
        queryParameters.push({
          name: `company_${patternIndex}`,
          parameterType: { type: 'STRING' },
          parameterValue: { value: company },
        });
        patternIndex++;
      }
    }

    if (allPatternConditions.length > 0) {
      query += ` AND (${allPatternConditions.join(' OR ')})`;
    }
  }

  if (options.topics && options.topics.length > 0) {
    const topicConditions = options.topics.map((_, i) => `topic_id = @topic_${i}`).join(' OR ');
    query += ` AND (${topicConditions})`;
    options.topics.forEach((topic, i) => {
      queryParameters.push({
        name: `topic_${i}`,
        parameterType: { type: 'STRING' },
        parameterValue: { value: topic },
      });
    });
  }

  if (options.sources && options.sources.length > 0) {
    const sourceConditions = options.sources.map((_, i) => `source = @source_${i}`).join(' OR ');
    query += ` AND (${sourceConditions})`;
    options.sources.forEach((source, i) => {
      queryParameters.push({
        name: `source_${i}`,
        parameterType: { type: 'STRING' },
        parameterValue: { value: source },
      });
    });
  }

  query += `
    GROUP BY group_id
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

    // Parse the results - prompt_id, prompt, topic_name, source, collected_at, responses array
    const prompts: PromptLabQuery[] = (result.rows ?? []).map((row) => {
      const prompt_id = row.f[0].v as string;
      const prompt = row.f[1].v as string;
      const topic_name = row.f[2].v as string | null;
      const source = row.f[3].v as string;
      const collected_at = row.f[4].v as string;
      const responsesArray = row.f[5].v as Array<{ v: { f: Array<{ v: unknown }> } }>;

      const responses = (responsesArray ?? []).map((r) => {
        const fields = r.v.f;
        const inputCostVal = fields[7].v as string | null;
        const outputCostVal = fields[8].v as string | null;
        return {
          id: fields[0].v as string,
          model: fields[1].v as string,
          company: fields[2].v as string,
          response: fields[3].v as string | null,
          latency_ms: parseInt(fields[4].v as string, 10) || 0,
          input_tokens: parseInt(fields[5].v as string, 10) || 0,
          output_tokens: parseInt(fields[6].v as string, 10) || 0,
          input_cost: inputCostVal ? parseFloat(inputCostVal) : null,
          output_cost: outputCostVal ? parseFloat(outputCostVal) : null,
          error: fields[9].v as string | null,
          success: fields[10].v === true || fields[10].v === 'true',
        };
      });

      return {
        id: prompt_id,
        collected_at,
        prompt,
        topic_name,
        source,
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
 * Get responses for a specific collection, grouped by prompt_id (run)
 */
export async function getCollectionResponses(
  env: BigQueryEnv,
  collectionId: string,
  options: { limit?: number } = {}
): Promise<BigQueryResult<PromptLabQuery[]>> {
  const tokenResult = await getAccessToken(env);
  if (!tokenResult.success) {
    return tokenResult;
  }

  const limit = options.limit ?? 100;
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${env.BQ_PROJECT_ID}/queries`;

  // Query all responses for this collection, grouped by prompt_id (each run)
  const query = `
    SELECT
      prompt_id as group_id,
      MAX(prompt) as prompt,
      MAX(topic_name) as topic_name,
      MAX(source) as source,
      MAX(collected_at) as collected_at,
      ARRAY_AGG(STRUCT(
        id,
        model,
        company,
        response,
        latency_ms,
        input_tokens,
        output_tokens,
        input_cost,
        output_cost,
        error,
        success
      ) ORDER BY company, model) as responses
    FROM \`${env.BQ_PROJECT_ID}.${env.BQ_DATASET_ID}.${env.BQ_TABLE_ID}\`
    WHERE collection_id = @collection_id
    GROUP BY prompt_id
    ORDER BY collected_at DESC
    LIMIT @limit
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
            name: 'collection_id',
            parameterType: { type: 'STRING' },
            parameterValue: { value: collectionId },
          },
          {
            name: 'limit',
            parameterType: { type: 'INT64' },
            parameterValue: { value: String(limit) },
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
      schema?: {
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

    // Parse the grouped results
    const prompts: PromptLabQuery[] = (result.rows ?? []).map((row) => {
      const prompt_id = row.f[0].v as string;
      const prompt = row.f[1].v as string;
      const topic_name = row.f[2].v as string | null;
      const source = row.f[3].v as string;
      const collected_at = row.f[4].v as string;
      const responsesArray = row.f[5].v as Array<{ v: { f: Array<{ v: unknown }> } }>;

      const responses = responsesArray.map((r) => {
        const f = r.v.f;
        const inputCostVal = f[8].v;
        const outputCostVal = f[9].v;
        return {
          id: f[0].v as string,
          model: f[1].v as string,
          company: f[2].v as string,
          response: f[3].v as string | null,
          latency_ms: parseInt(f[4].v as string, 10),
          input_tokens: parseInt(f[5].v as string, 10),
          output_tokens: parseInt(f[6].v as string, 10),
          input_cost: inputCostVal ? parseFloat(inputCostVal as string) : null,
          output_cost: outputCostVal ? parseFloat(outputCostVal as string) : null,
          error: f[10].v as string | null,
          success: f[11].v === true || f[11].v === 'true',
        };
      });

      return {
        id: prompt_id,
        collected_at,
        prompt,
        topic_name,
        source,
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
