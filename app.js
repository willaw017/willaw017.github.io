import { loadSummary } from "./modules/data.js";
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

let summary = null;
let loading = true;
let loadError = null;
let firstRender = true;
let transient = { freeQuestionOpen: false, dateDemoOpen: false, notice: "" };

function route() {
  return normalizeRoute(globalThis.location.hash);
}

function updateNavigation(currentRoute) {
  const selected = primaryRoute(currentRoute);
  document.querySelectorAll("[data-route]").forEach((link) => {
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
    transient
  })}`;
  updateNavigation(currentRoute);
  status.textContent = `${document.querySelector("h1")?.textContent ?? "页面"} 已打开`;
  if (focus && !firstRender) app.focus({ preventScroll: true });
  firstRender = false;
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
  }
}

function toggleFavorite(key) {
  const current = state.read();
  const exists = current.favorites.includes(key);
  const favorites = exists
    ? current.favorites.filter((item) => item !== key)
    : [...current.favorites, key];
  state.write({ ...current, favorites });
  transient.notice = exists ? "已取消收藏" : "已收藏在本机";
  render();
}

app.addEventListener("click", (event) => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const action = control.dataset.action;
  if (action === "favorite") toggleFavorite(control.dataset.key);
  if (action === "clear-state") {
    state.clear();
    transient.notice = "本机记录已清除";
    render();
  }
  if (action === "retry-data") readData();
  if (action === "submit-free-question") {
    transient.freeQuestionOpen = true;
    transient.notice = "输入未发送";
    render();
  }
  if (action === "run-date-demo") {
    transient.dateDemoOpen = true;
    transient.notice = "已打开页面结构演示";
    render();
  }
});

window.addEventListener("hashchange", () => {
  transient = { freeQuestionOpen: false, dateDemoOpen: false, notice: "" };
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
