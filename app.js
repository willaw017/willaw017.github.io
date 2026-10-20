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
let dailyRolloverTimer = null;

function emptyDaily(status = "idle", errorCode = null) {
  return {
    status,
    message: "",
    title: "",
    body: "",
    phase: null,
    errorCode
  };
}

function completeDaily(result, cached = Boolean(result.cached)) {
  return {
    status: "complete",
    message: result.message,
    title: result.title,
    body: result.body,
    phase: result.phase,
    date: result.date,
    dateLabel: dailyDateLabel(result.date),
    generatedAtLabel: generatedAtLabel(result.generatedAt),
    cached,
    degraded: result.degraded,
    errorCode: null
  };
}

function calendarDayNumber(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const value = Date.UTC(year, month - 1, day) / 86400000;
  const check = new Date(value * 86400000);
  return check.getUTCFullYear() === year
    && check.getUTCMonth() === month - 1
    && check.getUTCDate() === day ? value : null;
}

function localPhase(timeline, date) {
  const today = calendarDayNumber(date);
  const phases = (timeline ?? [])
    .map(item => ({
      ...item,
      start: calendarDayNumber(item.startDate),
      end: calendarDayNumber(item.endDate)
    }))
    .filter(item => item.start !== null && item.end !== null && item.end >= item.start)
    .sort((left, right) => left.start - right.start);
  const active = phases.find(item => today >= item.start && today <= item.end);
  if (active) {
    const dayCount = today - active.start + 1;
    return {
      state: "active",
      phaseTitle: active.phaseTitle,
      startDate: active.startDate,
      endDate: active.endDate,
      dayCount,
      display: `当前阶段 · ${active.phaseTitle} · 第 ${dayCount} 天`
    };
  }
  const upcoming = phases.find(item => item.start > today);
  if (upcoming) {
    const dayCount = upcoming.start - today;
    return {
      state: "upcoming",
      phaseTitle: upcoming.phaseTitle,
      startDate: upcoming.startDate,
      endDate: upcoming.endDate,
      dayCount,
      display: `下一阶段 · ${upcoming.phaseTitle} · 还有 ${dayCount} 天`
    };
  }
  return {
    state: "neutral",
    phaseTitle: "日常整理",
    startDate: null,
    endDate: null,
    dayCount: null,
    display: "当前阶段 · 日常整理"
  };
}

function localDailyResult(currentSummary, date) {
  const phase = localPhase(currentSummary?.timeline, date);
  const message = phase.state === "active"
    ? "到该往前走的时候了。不用一下做很多，先把最重要的那一步落下来。"
    : phase.state === "upcoming" && phase.dayCount <= 14
      ? "快到需要你出手的时候了。今天不用做满，把真正重要的东西准备好。"
      : "今天别急着把所有问题一起想完。先做好眼前这一件，其他的晚点再说。";
  return {
    date,
    message,
    title: "今天，先把范围收回来",
    body: "今天不需要把每件事都推到结论。真正会让你轻松一点的，不是继续增加准备，而是先确认什么值得占用你的注意力。那些还没有答案的部分，可以先放在一边，不必为了消除不安而仓促决定。\n\n把范围缩小，只完成一件能留下结果的事。它可以是一封该回的邮件、一页需要整理的材料，或一个拖了几天的小决定。做完以后先停下来，不要立刻再给自己加任务。\n\n其余判断放到晚上，等信息和情绪都更完整时再看。如果那时仍然拿不准，就写下你最在意的两个条件，明天再选。你不是停下来，只是在把力气留给更值得推进的地方。",
    phase,
    generatedAt: new Date().toISOString(),
    cached: false,
    degraded: true
  };
}

let realtimeUi = {
  unlock: { status: "locked", errorCode: null },
  daily: emptyDaily()
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

function dailyDateLabel(value) {
  const date = new Date(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

function millisecondsUntilShanghaiTomorrow(now = new Date()) {
  const [year, month, day] = shanghaiDate().split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1, -8, 0, 1));
  return Math.max(1000, tomorrow.getTime() - now.getTime());
}

function scheduleDailyRollover() {
  if (dailyRolloverTimer) globalThis.clearTimeout(dailyRolloverTimer);
  dailyRolloverTimer = globalThis.setTimeout(async () => {
    realtimeState.clearDaily();
    realtimeUi.daily = summary
      ? completeDaily(localDailyResult(summary, shanghaiDate()))
      : emptyDaily();
    render();
    await loadDaily();
    scheduleDailyRollover();
  }, millisecondsUntilShanghaiTomorrow());
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
  const date = shanghaiDate();
  const localDaily = realtimeState.read().daily;
  if (localDaily?.date === date) {
    realtimeUi.daily = completeDaily(localDaily, true);
    render();
    return;
  }
  if (localDaily) realtimeState.clearDaily();
  realtimeUi.daily = emptyDaily("loading");
  render();
  try {
    const result = await realtimeClient.getDaily(session.token, date);
    realtimeState.setDaily(result);
    realtimeUi.daily = completeDaily(result);
  } catch (error) {
    handleAuthFailure(error);
    realtimeUi.daily = summary
      ? completeDaily(localDailyResult(summary, date))
      : emptyDaily("error", error instanceof ApiError ? error.code : "UPSTREAM_FAILED");
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
    if (summary) {
      const date = shanghaiDate();
      const savedDaily = realtimeState.read().daily;
      realtimeUi.daily = savedDaily?.date === date
        ? completeDaily(savedDaily, true)
        : completeDaily(localDailyResult(summary, date));
    }
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
      daily: summary
        ? completeDaily(localDailyResult(summary, shanghaiDate()))
        : emptyDaily()
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
scheduleDailyRollover();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const loadedDate = realtimeUi.daily.date;
  const hasSession = Boolean(realtimeState.read().session);
  const currentDate = shanghaiDate();
  if (loadedDate !== currentDate && summary) {
    realtimeState.clearDaily();
    realtimeUi.daily = completeDaily(localDailyResult(summary, currentDate));
    render();
  }
  if (hasSession && realtimeUi.daily.status !== "loading" && loadedDate !== currentDate) loadDaily();
  scheduleDailyRollover();
});

window.addEventListener("load", () => {
  if ("serviceWorker" in navigator) {
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      globalThis.location.reload();
    });
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then(registration => registration.update())
      .catch(() => {
        document.documentElement.dataset.offlineSetup = "failed";
      });
  }
});
