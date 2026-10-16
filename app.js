import { ApiError, createRealtimeClient } from "./modules/api.js";
import { loadSummary } from "./modules/data.js";
import { createRealtimeState } from "./modules/realtime-state.js";
import { normalizeRoute, primaryRoute, routeToHash } from "./modules/router.js";
import { createLocalState } from "./modules/state.js";
import { renderError, renderLoading, renderRoute } from "./modules/views.js";

const app = document.querySelector("#app");
const status = document.querySelector("#app-status");
let browserStorage = null;
try {
  browserStorage = globalThis.localStorage ?? null;
} catch {
  browserStorage = null;
}

const state = createLocalState(browserStorage);
const realtimeState = createRealtimeState(browserStorage, () => Date.now());
const runtimeConfig = globalThis.__JIANSHI_CONFIG__ ?? Object.freeze({ apiBase: "" });
let realtimeClient = null;
try {
  if (runtimeConfig.apiBase) {
    realtimeClient = createRealtimeClient({
      apiBase: runtimeConfig.apiBase,
      fetchImpl: globalThis.fetch.bind(globalThis)
    });
  }
} catch {
  realtimeClient = null;
}

let summary = null;
let loading = true;
let loadError = null;
let firstRender = true;
let transient = { dateDemoOpen: false, notice: "" };
let activeAnalysis = null;
let realtimeUi = {
  unlock: { status: "locked", errorCode: null },
  daily: { status: "idle", text: "", errorCode: null }
};

function route() {
  return normalizeRoute(globalThis.location.hash);
}

function shanghaiDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function generatedAtLabel(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function realtimeModel() {
  const current = realtimeState.read();
  return {
    enabled: Boolean(realtimeClient),
    unlocked: Boolean(current.session),
    unlock: realtimeUi.unlock,
    daily: realtimeUi.daily,
    usage: current.usage,
    answer: current.answer,
    savedAnswers: current.savedAnswers
  };
}

function updateNavigation(currentRoute) {
  const selected = primaryRoute(currentRoute);
  document.querySelectorAll("[data-route]").forEach(link => {
    const name = normalizeRoute(link.getAttribute("data-route")).name;
    link.classList.toggle("is-active", name === selected);
    if (name === selected) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function render({ focus = false } = {}) {
  if (loading) {
    app.innerHTML = renderLoading();
    status.textContent = "正在读取个人摘要";
    return;
  }
  if (loadError || !summary) {
    app.innerHTML = renderError("暂时无法读取个人摘要");
    status.textContent = "个人摘要读取失败";
    return;
  }

  const currentRoute = route();
  if (currentRoute.name === "chart") {
    const currentState = state.read();
    const readKey = `chart-${currentRoute.param}`;
    if (!currentState.read.includes(readKey)) {
      state.write({ ...currentState, read: [...currentState.read, readKey] });
    }
  }
  app.innerHTML = `${!state.available ? `<aside class="notice storage-warning" role="status"><span class="notice-mark" aria-hidden="true">!</span><div><strong>本机存储不可用</strong><p>阅读和导航不受影响，收藏与已读只在本次打开期间保留。</p></div></aside>` : ""}${transient.notice ? `<p class="toast" role="status">${transient.notice}</p>` : ""}${renderRoute({
    route: currentRoute,
    summary,
    uiState: state.read(),
    now: new Date(),
    storageAvailable: state.available,
    transient,
    realtime: realtimeModel()
  })}`;
  updateNavigation(currentRoute);
  status.textContent = `${document.querySelector("h1")?.textContent ?? "页面"} 已打开`;
  if (focus && !firstRender) app.focus({ preventScroll: true });
  firstRender = false;
}

function handleAuthFailure(error) {
  if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
    realtimeState.clearSession();
    realtimeUi.unlock = { status: "locked", errorCode: "AUTH_REQUIRED" };
    return true;
  }
  return false;
}

async function refreshUsage() {
  const session = realtimeState.read().session;
  if (!realtimeClient || !session) return;
  try {
    realtimeState.setUsage(await realtimeClient.getUsage(session.token));
  } catch (error) {
    handleAuthFailure(error);
  }
}

async function loadDaily() {
  const session = realtimeState.read().session;
  if (!realtimeClient || !session) return;
  realtimeUi.daily = { status: "loading", text: "", errorCode: null };
  render();
  try {
    const result = await realtimeClient.getDaily(session.token, shanghaiDate());
    realtimeUi.daily = {
      status: "complete",
      text: result.text,
      generatedAtLabel: generatedAtLabel(result.generatedAt),
      cached: result.cached,
      degraded: result.degraded,
      errorCode: null
    };
  } catch (error) {
    handleAuthFailure(error);
    realtimeUi.daily = {
      status: "error",
      text: "",
      errorCode: error instanceof ApiError ? error.code : "UPSTREAM_FAILED"
    };
  }
  render();
}

async function hydrateRealtime() {
  if (!realtimeClient || !realtimeState.read().session) return;
  realtimeUi.unlock = { status: "unlocked", errorCode: null };
  await Promise.all([refreshUsage(), loadDaily()]);
  render();
}

async function readData() {
  loading = true;
  loadError = null;
  render();
  try {
    summary = await loadSummary();
  } catch (error) {
    loadError = error;
  } finally {
    loading = false;
    render();
    if (summary) hydrateRealtime();
  }
}

function toggleFavorite(key) {
  const current = state.read();
  const exists = current.favorites.includes(key);
  const favorites = exists
    ? current.favorites.filter(item => item !== key)
    : [...current.favorites, key];
  state.write({ ...current, favorites });
  transient.notice = exists ? "已取消收藏" : "已收藏在本机";
  render();
}

async function unlockRealtime(form) {
  if (!realtimeClient) return;
  const code = new FormData(form).get("code");
  realtimeUi.unlock = { status: "verifying", errorCode: null };
  render();
  try {
    const session = await realtimeClient.unlock(String(code ?? ""));
    realtimeState.setSession(session);
    realtimeUi.unlock = { status: "unlocked", errorCode: null };
    transient.notice = "实时分析已解锁";
    await Promise.all([refreshUsage(), loadDaily()]);
  } catch (error) {
    realtimeUi.unlock = {
      status: "locked",
      errorCode: error instanceof ApiError ? error.code : "UPSTREAM_FAILED"
    };
  }
  render();
}

async function submitQuestion(form) {
  const currentRoute = route();
  const session = realtimeState.read().session;
  if (!realtimeClient || !session || currentRoute.name !== "ask") return;
  const question = String(new FormData(form).get("question") ?? "").trim();
  if (![...question].length || [...question].length > 500) {
    transient.notice = "问题需为 1 至 500 个字符";
    render();
    return;
  }
  activeAnalysis?.abort();
  activeAnalysis = new AbortController();
  realtimeState.beginAnswer(currentRoute.param, question);
  transient.notice = "";
  render();
  try {
    const result = await realtimeClient.streamAnalysis({
      token: session.token,
      topic: currentRoute.param,
      question,
      signal: activeAnalysis.signal,
      onDelta(delta, completeText) {
        realtimeState.appendAnswer(delta);
        const output = app.querySelector("[data-stream-output]");
        if (output) output.textContent = completeText;
      }
    });
    realtimeState.finishAnswer(result.text);
    await refreshUsage();
  } catch (error) {
    if (!handleAuthFailure(error)) {
      const code = error instanceof ApiError
        ? error.code
        : error?.name === "AbortError" ? "STREAM_INCOMPLETE" : "UPSTREAM_FAILED";
      realtimeState.failAnswer(code);
    }
  } finally {
    activeAnalysis = null;
    render();
  }
}

app.addEventListener("submit", event => {
  const form = event.target.closest("[data-realtime-form]");
  if (!form) return;
  event.preventDefault();
  if (form.dataset.realtimeForm === "unlock") unlockRealtime(form);
  if (form.dataset.realtimeForm === "question") submitQuestion(form);
});

app.addEventListener("click", async event => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const action = control.dataset.action;
  if (action === "favorite") toggleFavorite(control.dataset.key);
  if (action === "clear-state") {
    state.clear();
    realtimeState.clearAll();
    realtimeUi = {
      unlock: { status: "locked", errorCode: null },
      daily: { status: "idle", text: "", errorCode: null }
    };
    transient.notice = "本机记录已清除";
    render();
  }
  if (action === "retry-data") readData();
  if (action === "retry-daily") loadDaily();
  if (action === "cancel-analysis") activeAnalysis?.abort(new DOMException("Stopped", "AbortError"));
  if (action === "copy-analysis") {
    try {
      await navigator.clipboard.writeText(realtimeState.read().answer.text);
      transient.notice = "分析已复制";
    } catch {
      transient.notice = "复制失败，请长按正文复制";
    }
    render();
  }
  if (action === "save-analysis") {
    realtimeState.saveAnswer();
    transient.notice = "已收藏在本机";
    render();
  }
  if (action === "remove-saved-analysis") {
    realtimeState.removeAnswer(control.dataset.id);
    render();
  }
  if (action === "clear-saved-analysis") {
    realtimeState.clearAnswers();
    render();
  }
  if (action === "run-date-demo") {
    transient.dateDemoOpen = true;
    transient.notice = "已打开页面结构演示";
    render();
  }
});

window.addEventListener("hashchange", () => {
  activeAnalysis?.abort(new DOMException("Route changed", "AbortError"));
  transient = { dateDemoOpen: false, notice: "" };
  render({ focus: true });
  globalThis.scrollTo(0, 0);
});

if (!globalThis.location.hash || routeToHash(route()) !== globalThis.location.hash) {
  globalThis.history.replaceState(null, "", "#/today");
}

readData();

window.addEventListener("load", () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      document.documentElement.dataset.offlineSetup = "failed";
    });
  }
});
