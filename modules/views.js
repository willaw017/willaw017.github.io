import { renderDailyRealtime, renderQuestionRealtime } from "./realtime-views.js";

const TOPIC_ORDER = ["career", "relationships", "money", "support"];
const CHART_ORDER = ["overview", "career", "money", "relationships"];

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function e(value) {
  return escapeHtml(value ?? "");
}

export function isDailyStale(dailyAsOf, now) {
  const local = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  return local !== dailyAsOf;
}

function pageHeader(kicker, title, intro = "") {
  return `<header class="page-heading">
    <p class="eyebrow">${e(kicker)}</p>
    <h1>${e(title)}</h1>
    ${intro ? `<p class="page-intro">${e(intro)}</p>` : ""}
  </header>`;
}

function evidenceList(items = []) {
  return `<ul class="evidence-list">${items.map((item) => `<li>${e(item)}</li>`).join("")}</ul>`;
}

function actionList(items, emptyCopy) {
  if (!items?.length) return `<p class="muted">${e(emptyCopy)}</p>`;
  return `<ul class="action-list">${items.map((item) => `
    <li><strong>${e(item.label)}</strong><span>${e(item.detail)}</span></li>
  `).join("")}</ul>`;
}

function staleBanner(summary, now) {
  if (!isDailyStale(summary.meta.dailyAsOf, now)) return "";
  return `<aside class="notice notice--stale" role="status">
    <span class="notice-mark" aria-hidden="true">!</span>
    <div><strong>个人摘要需要更新</strong><p>日页计算于 ${e(summary.meta.dailyAsOf)}，以下内容可继续阅读，但不是今天的实时结果。</p></div>
  </aside>`;
}

function renderToday(summary, now, realtime) {
  const today = summary.today;
  const domains = today.domains.map((domain) => `
    <article class="domain-card">
      <span>${e(domain.label)}</span>
      <strong>${e(domain.status)}</strong>
      <p>${e(domain.detail)}</p>
    </article>`).join("");

  return `${staleBanner(summary, now)}
    <section class="today-hero paper-card paper-card--hero">
      <div class="today-date">
        <p class="eyebrow">${e(today.solarDate)} · ${e(today.calendarLabel)}</p>
        <p class="ganzhi">${e(today.ganzhiLabel)}</p>
      </div>
      <div class="today-verdict">
        <div>
          <span class="section-label">今日主轴</span>
          <h1>${e(today.headline)}</h1>
          <p>今天的静态结论来自已核验的本地个人盘，不是浏览器即时计算。</p>
        </div>
        <div class="score-seal score-seal--${e(today.tier)}" aria-label="综合倾向 ${e(today.tier)}，${e(today.score)} 分">
          <strong>${e(today.tier)}</strong>
          <span>${e(today.score)}</span>
        </div>
      </div>
      <div class="confidence-line">
        <span>计算置信度</span>
        <span>${Math.round(Number(today.confidence) * 100)}%</span>
      </div>
    </section>

    <div data-realtime-slot="daily">
      ${renderDailyRealtime(realtime)}
    </div>

    <section class="section-block" aria-labelledby="actions-title">
      <div class="section-heading"><p class="eyebrow">今日取舍</p><h2 id="actions-title">先做什么，暂缓什么</h2></div>
      <div class="paired-grid">
        <article class="paper-card action-card action-card--focus">
          <span class="section-label">传统宜 · 取其可用</span>
          ${actionList(today.focus, "今日没有额外的宜项。")}
        </article>
        <article class="paper-card action-card action-card--avoid">
          <span class="section-label">传统忌 · 保守处理</span>
          ${actionList(today.avoid, "今日没有额外的避忌。")}
        </article>
      </div>
    </section>

    <section class="section-block" aria-labelledby="domains-title">
      <div class="section-heading"><p class="eyebrow">现实落点</p><h2 id="domains-title">今天最值得照看的两件事</h2></div>
      <div class="domain-grid">${domains}</div>
    </section>

    <section class="section-block" aria-labelledby="entry-title">
      <div class="section-heading"><p class="eyebrow">继续往下</p><h2 id="entry-title">你现在想处理什么</h2></div>
      <div class="entry-grid">
        <a class="entry-card" href="#/ask/career"><span>问</span><strong>问一件事</strong><small>事业、感情、财运、贵人</small></a>
        <a class="entry-card" href="#/pick-date"><span>择</span><strong>选日子</strong><small>先看交互结构与边界</small></a>
        <a class="entry-card" href="#/chart/overview"><span>盘</span><strong>看命盘</strong><small>读结论，不堆术语</small></a>
        <a class="entry-card" href="#/calendar"><span>历</span><strong>行动历</strong><small>查看已确认阶段窗口</small></a>
      </div>
    </section>`;
}

function renderAsk(summary, selected, transient, realtime) {
  const topic = summary.questions[selected];
  const chips = TOPIC_ORDER.map((key) => `
    <a class="topic-chip ${key === selected ? "is-selected" : ""}" href="#/ask/${key}" ${key === selected ? 'aria-current="page"' : ""}>${e(summary.questions[key].label)}</a>
  `).join("");

  const remaining = realtime?.usage?.remaining;
  const canSubmit = realtime?.unlocked && remaining !== 0 && realtime?.answer?.status !== "streaming";
  return `${pageHeader("问一件事", "把模糊问题收成一个行动", "先读已经核验的主题结论；实时提问只在生成时发送，不由本站云端保存。")}
    <nav class="topic-row" aria-label="问题主题">${chips}</nav>
    <article class="paper-card reading-card">
      <p class="eyebrow">预设问题</p>
      <h2>${e(topic.prompt)}</h2>
      <p class="lead-copy">${e(topic.answer)}</p>
      <details>
        <summary>查看依据</summary>
        ${evidenceList(topic.evidence)}
      </details>
      <button class="text-action" type="button" data-action="favorite" data-key="ask-${e(selected)}">收藏这条结论</button>
    </article>
    <section class="paper-card question-box" aria-labelledby="free-question-title" data-realtime-slot="question">
      <div><p class="eyebrow">自由提问</p><h2 id="free-question-title">写下你真正卡住的地方</h2></div>
      <form data-realtime-form="question">
        <label for="free-question">问题</label>
        <textarea id="free-question" name="question" rows="4" maxlength="500" placeholder="例如：我该先争取晋升，还是准备换一个平台？" ${canSubmit ? "" : "disabled"} required>${e(realtime?.answer?.status === "streaming" ? realtime.answer.question : "")}</textarea>
        <button class="primary-button" type="submit" data-action="submit-free-question" ${canSubmit ? "" : "disabled"}>查看分析</button>
      </form>
      ${renderQuestionRealtime(realtime)}
    </section>`;
}

function renderPickDate(summary, transient) {
  const firstWindow = summary.timeline[1] ?? summary.timeline[0];
  return `${pageHeader("计划 · 选日子", "先把事项说清，再比较时间", "第一版展示择日页面如何工作，不在浏览器里重新排盘。")}
    <section class="paper-card form-card">
      <div class="field-group">
        <label for="matter-type">事项类型</label>
        <select id="matter-type">
          <option>面试或汇报</option>
          <option>签约或谈条件</option>
          <option>发布作品</option>
          <option>重要沟通</option>
        </select>
      </div>
      <div class="date-pair">
        <div class="field-group"><label for="date-start">开始日期</label><input id="date-start" type="date" value="2027-02-01"></div>
        <div class="field-group"><label for="date-end">结束日期</label><input id="date-end" type="date" value="2027-03-31"></div>
      </div>
      <button class="primary-button" type="button" data-action="run-date-demo">查看页面演示</button>
    </section>
    <aside class="notice notice--boundary"><span class="notice-mark" aria-hidden="true">界</span><div><strong>演示结构，不是新计算出的吉日</strong><p>实时择日需要受保护的计算后端，第一版不会用随机日期代替。</p></div></aside>
    <section class="demo-result ${transient.dateDemoOpen ? "is-open" : ""}" aria-live="polite">
      <article class="paper-card reading-card">
        <p class="eyebrow">已核验阶段窗口 · ${e(firstWindow?.date)}</p>
        <h2>${e(firstWindow?.title)}</h2>
        <p class="lead-copy">${e(firstWindow?.detail)}</p>
        <p><strong>行动：</strong>${e(firstWindow?.action)}</p>
        <span class="source-tag">来源：既有个人报告，不是本次择日计算</span>
      </article>
    </section>`;
}

function renderChart(summary, selected, uiState) {
  const topic = summary.chart[selected];
  const tabs = CHART_ORDER.map((key) => `
    <a class="topic-chip ${key === selected ? "is-selected" : ""}" href="#/chart/${key}" ${key === selected ? 'aria-current="page"' : ""}>${e(summary.chart[key].title)}</a>
  `).join("");
  const favoriteKey = `chart-${selected}`;
  const saved = uiState.favorites.includes(favoriteKey);

  return `${pageHeader("看命盘", "把结论放回现实", "四套系统已经在本地完成核验；这里按生活主题阅读，不让术语遮住重点。")}
    <nav class="topic-row" aria-label="命盘主题">${tabs}</nav>
    <article class="paper-card chart-reading">
      <div class="reading-title"><div><p class="eyebrow">${e(topic.title)}主题</p><h2>${e(topic.conclusion)}</h2></div><span class="seal-mini">阅</span></div>
      <dl class="reading-grid">
        <div><dt>现实表现</dt><dd>${e(topic.reality)}</dd></div>
        <div><dt>时间范围</dt><dd>${e(topic.timing)}</dd></div>
        <div><dt>行动建议</dt><dd>${e(topic.action)}</dd></div>
        <div><dt>边界说明</dt><dd>${e(topic.boundary)}</dd></div>
      </dl>
      <details>
        <summary>展开核验依据</summary>
        ${evidenceList(topic.evidence)}
      </details>
      <button class="text-action ${saved ? "is-saved" : ""}" type="button" data-action="favorite" data-key="${e(favoriteKey)}">${saved ? "已收藏" : "收藏这个主题"}</button>
    </article>`;
}

function renderCalendar(summary) {
  const items = summary.timeline.map((item) => `
    <li class="timeline-item">
      <div class="timeline-date">${e(item.date)}</div>
      <article><span>${e(item.label)}</span><h2>${e(item.title)}</h2><p>${e(item.detail)}</p><p class="timeline-action">${e(item.action)}</p></article>
    </li>`).join("");
  return `${pageHeader("计划 · 行动历", "把回暖窗口变成准备清单", "以下时间来自已经核验的阶段报告，不是事件承诺。")}
    <ol class="timeline">${items}</ol>
    <section class="paper-card disabled-action">
      <div><strong>手机日历同步</strong><p>静态日历文件尚未生成，避免写入不准确的提醒。</p></div>
      <button type="button" disabled aria-describedby="calendar-disabled-copy">加入手机日历（第一版暂不可用）</button>
      <span id="calendar-disabled-copy" class="sr-only">此功能尚未接入</span>
    </section>`;
}

function renderPlan() {
  return `${pageHeader("计划", "让时间为行动服务", "选择需要的工具；阶段窗口是真实摘要，重新择日仍是第一版演示。")}
    <div class="plan-grid">
      <a class="paper-card plan-card" href="#/pick-date"><span class="plan-index">01</span><div><h2>选日子</h2><p>先确认事项与区间，再查看页面如何比较候选时间。</p></div><b aria-hidden="true">→</b></a>
      <a class="paper-card plan-card" href="#/calendar"><span class="plan-index">02</span><div><h2>行动历</h2><p>查看 2026 年 12 月至 2027 年的已核验事业窗口。</p></div><b aria-hidden="true">→</b></a>
    </div>`;
}

function renderProfile(summary, uiState, storageAvailable) {
  return `${pageHeader("档案", "只保留够用的信息", "网站不显示身份资料，也不包含原始出生记录。")}
    <section class="paper-card profile-status">
      <div class="status-line"><span class="status-dot" aria-hidden="true"></span><div><strong>个人资料已核验</strong><p>计算截至 ${e(summary.profileStatus.lastCalculated)}</p></div></div>
      <dl>
        <div><dt>计算方式</dt><dd>本地 skill 生成脱敏证据，实时服务只负责解释</dd></div>
        <div><dt>实时更新</dt><dd>访问码保护的今日解读与自由提问</dd></div>
        <div><dt>阶段资料有效期</dt><dd>${e(summary.meta.timelineValidThrough)}</dd></div>
        <div><dt>本机记录</dt><dd>${storageAvailable ? `已收藏 ${uiState.favorites.length} 条，已读 ${uiState.read.length} 条` : "浏览器已限制本机存储"}</dd></div>
      </dl>
    </section>
    <section class="paper-card privacy-panel">
      <p class="eyebrow">隐私边界</p>
      <h2>原始资料没有进入网站</h2>
      <p>${e(summary.profileStatus.privacyCopy)}</p>
      <p>收藏与已读状态只保存在当前浏览器，不会上传。</p>
    </section>
    <button class="danger-button" type="button" data-action="clear-state" ${storageAvailable ? "" : "disabled"}>清除本机收藏与阅读状态</button>`;
}

export function renderLoading() {
  return `<section class="loading-card" aria-busy="true"><div class="loading-seal"></div><h1>正在展开今日纸页</h1><p>读取脱敏个人摘要中。</p></section>`;
}

export function renderError(message = "暂时无法读取个人摘要") {
  return `<section class="paper-card error-card" role="alert"><span class="error-mark">!</span><p class="eyebrow">读取失败</p><h1>${e(message)}</h1><p>基础导航仍可使用。请联网后重试，或稍后重新打开。</p><div class="button-row"><button class="primary-button" type="button" data-action="retry-data">重新读取</button><a class="secondary-button" href="#/today">返回今日</a></div></section>`;
}

export function renderRoute({ route, summary, uiState, now, storageAvailable = true, transient = {}, realtime = {} }) {
  const safeTransient = { freeQuestionOpen: false, dateDemoOpen: false, ...transient };
  const safeRealtime = {
    enabled: false,
    unlocked: false,
    unlock: { status: "locked", errorCode: null },
    daily: { status: "idle", text: "", errorCode: null },
    usage: null,
    answer: { status: "idle", topic: "", question: "", text: "", errorCode: null },
    savedAnswers: [],
    ...realtime
  };
  switch (route.name) {
    case "ask": return renderAsk(summary, route.param, safeTransient, safeRealtime);
    case "pick-date": return renderPickDate(summary, safeTransient);
    case "chart": return renderChart(summary, route.param, uiState);
    case "calendar": return renderCalendar(summary);
    case "plan": return renderPlan();
    case "profile": return renderProfile(summary, uiState, storageAvailable);
    case "today":
    default: return renderToday(summary, now, safeRealtime);
  }
}
