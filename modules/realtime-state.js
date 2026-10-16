const STORAGE_KEY = "jianshi-realtime-v1";
const EMPTY_ANSWER = Object.freeze({
  status: "idle",
  topic: "",
  question: "",
  text: "",
  errorCode: null
});

function cleanSession(value, now) {
  if (!value || typeof value.token !== "string" || !value.token) return null;
  const expires = Date.parse(value.expiresAt);
  if (!Number.isFinite(expires) || expires <= now()) return null;
  return { token: value.token, expiresAt: new Date(expires).toISOString() };
}

function cleanUsage(value) {
  if (!value || typeof value !== "object") return null;
  const limit = Number(value.limit);
  const used = Number(value.used);
  const remaining = Number(value.remaining);
  if (![limit, used, remaining].every(Number.isFinite) || typeof value.resetsAt !== "string") return null;
  return { limit, used, remaining, resetsAt: value.resetsAt };
}

function cleanSaved(values) {
  if (!Array.isArray(values)) return [];
  return values.filter(item => item && typeof item.id === "string"
    && typeof item.topic === "string" && typeof item.text === "string" && item.text.trim())
    .slice(-20)
    .map(item => ({
      id: item.id,
      topic: item.topic,
      question: typeof item.question === "string" ? item.question : "",
      text: item.text,
      savedAt: typeof item.savedAt === "string" ? item.savedAt : ""
    }));
}

export function createRealtimeState(storage = null, now = () => Date.now()) {
  let available = false;
  let persistent = { session: null, usage: null, savedAnswers: [] };
  let answer = { ...EMPTY_ANSWER };

  try {
    if (storage) {
      const raw = storage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      persistent = {
        session: cleanSession(parsed.session, now),
        usage: cleanUsage(parsed.usage),
        savedAnswers: cleanSaved(parsed.savedAnswers)
      };
      storage.setItem(STORAGE_KEY, JSON.stringify(persistent));
      available = true;
    }
  } catch {
    available = false;
  }

  function save() {
    if (!available) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(persistent));
    } catch {
      available = false;
    }
  }

  function read() {
    const session = cleanSession(persistent.session, now);
    if (!session && persistent.session) {
      persistent.session = null;
      save();
    }
    return {
      session,
      usage: cleanUsage(persistent.usage),
      answer: { ...answer },
      savedAnswers: cleanSaved(persistent.savedAnswers)
    };
  }

  return {
    get available() { return available; },
    read,
    setSession(session) {
      persistent.session = cleanSession(session, now);
      if (!persistent.session) throw new Error("invalid realtime session");
      save();
      return read();
    },
    clearSession() {
      persistent.session = null;
      persistent.usage = null;
      save();
      return read();
    },
    setUsage(usage) {
      persistent.usage = cleanUsage(usage);
      save();
      return read();
    },
    beginAnswer(topic, question) {
      answer = { status: "streaming", topic, question, text: "", errorCode: null };
      return read();
    },
    appendAnswer(delta) {
      if (answer.status === "streaming") answer.text += String(delta ?? "");
      return read();
    },
    finishAnswer(text = answer.text) {
      answer = { ...answer, status: "complete", text: String(text ?? answer.text), errorCode: null };
      return read();
    },
    failAnswer(code) {
      answer = {
        ...answer,
        status: answer.text ? "incomplete" : "error",
        errorCode: code ?? "UPSTREAM_FAILED"
      };
      return read();
    },
    resetAnswer() {
      answer = { ...EMPTY_ANSWER };
      return read();
    },
    saveAnswer() {
      if (!answer.text.trim() || !["complete", "incomplete"].includes(answer.status)) return read();
      persistent.savedAnswers = cleanSaved([
        ...persistent.savedAnswers,
        {
          id: crypto.randomUUID(),
          topic: answer.topic,
          question: answer.question,
          text: answer.text,
          savedAt: new Date(now()).toISOString()
        }
      ]);
      save();
      return read();
    },
    removeAnswer(id) {
      persistent.savedAnswers = persistent.savedAnswers.filter(item => item.id !== id);
      save();
      return read();
    },
    clearAnswers() {
      persistent.savedAnswers = [];
      save();
      return read();
    },
    clearAll() {
      persistent = { session: null, usage: null, savedAnswers: [] };
      answer = { ...EMPTY_ANSWER };
      if (available) {
        try { storage.removeItem(STORAGE_KEY); } catch { available = false; }
      }
      return read();
    }
  };
}
