export class ApiError extends Error {
  constructor(code, message, requestId = null, status = 0, details = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.requestId = requestId;
    this.status = status;
    this.details = details;
  }
}

function normalizeBase(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("realtime api base must be a plain HTTPS URL");
  }
  return url.href.replace(/\/$/, "");
}

async function errorFromResponse(response) {
  try {
    const body = await response.json();
    const error = body?.error ?? {};
    return new ApiError(
      error.code ?? "UPSTREAM_FAILED",
      error.message ?? "实时服务暂时不可用",
      error.requestId ?? null,
      response.status,
      error.details ?? null
    );
  } catch {
    return new ApiError("UPSTREAM_FAILED", "实时服务暂时不可用", null, response.status);
  }
}

function combinedSignal(callerSignal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  const abort = () => controller.abort(callerSignal.reason ?? new DOMException("Aborted", "AbortError"));
  if (callerSignal) {
    if (callerSignal.aborted) abort();
    else callerSignal.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abort);
    }
  };
}

export async function parseResponseStream(response, { onDelta = () => {}, signal } = {}) {
  if (!response.body) throw new ApiError("STREAM_INCOMPLETE", "回答未完成");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let completed = false;

  const abort = () => reader.cancel(signal?.reason).catch(() => {});
  signal?.addEventListener("abort", abort, { once: true });

  function consume(block) {
    const data = block.split(/\r?\n/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      throw new ApiError("STREAM_INCOMPLETE", "回答流格式异常");
    }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      text += event.delta;
      onDelta(event.delta, text);
    } else if (event.type === "response.completed") {
      completed = true;
    } else if (event.type === "error" || event.type === "response.failed") {
      throw new ApiError("UPSTREAM_FAILED", "实时回答生成失败");
    }
  }

  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) consume(block);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    if (!completed) throw new ApiError("STREAM_INCOMPLETE", "回答未完成");
    return { text, requestId: response.headers.get("X-Request-Id") };
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

export function createRealtimeClient({ apiBase, fetchImpl = fetch, timeoutMs = 30000 }) {
  const base = normalizeBase(apiBase);

  async function requestJson(path, { method = "GET", token = null, body = null, signal = null } = {}) {
    const combined = combinedSignal(signal, timeoutMs);
    try {
      const headers = { "Accept": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body) headers["Content-Type"] = "application/json";
      const response = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: combined.signal
      });
      if (!response.ok) throw await errorFromResponse(response);
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (combined.signal.aborted) throw combined.signal.reason ?? new DOMException("Aborted", "AbortError");
      throw new ApiError("NETWORK_ERROR", "无法连接实时服务");
    } finally {
      combined.cleanup();
    }
  }

  return {
    unlock(code) {
      return requestJson("/v1/unlock", { method: "POST", body: { code } });
    },
    getUsage(token) {
      return requestJson("/v1/usage", { token });
    },
    getDaily(token, date) {
      return requestJson(`/v1/daily?date=${encodeURIComponent(date)}`, { token });
    },
    async streamAnalysis({ token, topic, question, signal, onDelta }) {
      const combined = combinedSignal(signal, timeoutMs);
      try {
        const response = await fetchImpl(`${base}/v1/analyze`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
          },
          body: JSON.stringify({ topic, question }),
          signal: combined.signal
        });
        if (!response.ok) throw await errorFromResponse(response);
        return await parseResponseStream(response, { onDelta, signal: combined.signal });
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (combined.signal.aborted) throw combined.signal.reason ?? new DOMException("Aborted", "AbortError");
        throw new ApiError("NETWORK_ERROR", "无法连接实时服务");
      } finally {
        combined.cleanup();
      }
    }
  };
}
