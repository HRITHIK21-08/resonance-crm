const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export class APIError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorBody = await res.text().catch(() => 'Unknown error');
    throw new APIError(`API error ${res.status}: ${errorBody}`, res.status);
  }
  return res.json();
}

function getHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (typeof window !== 'undefined') {
    const geminiKey = localStorage.getItem('resonance_gemini_key');
    const openaiKey = localStorage.getItem('resonance_openai_key');
    if (geminiKey) headers['x-gemini-key'] = geminiKey;
    if (openaiKey) headers['x-openai-key'] = openaiKey;
  }
  return headers;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: getHeaders(),
  });
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  return handleResponse<T>(res);
}

// Streaming API for copilot
export async function apiStream(
  path: string,
  body: unknown,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: Error) => void
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new APIError(`API error ${res.status}`, res.status);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const text = decoder.decode(value, { stream: true });
        onChunk(text);
      }
    }
    onDone();
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}
