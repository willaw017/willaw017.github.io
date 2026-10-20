function e(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

const ERROR_COPY = Object.freeze({
  AUTH_INVALID: "访问码不正确，请重新输入。",
  AUTH_LOCKED: "尝试次数过多，请 15 分钟后再试。",
  AUTH_REQUIRED: "设备授权已失效，请重新解锁。",
  QUOTA_EXHAUSTED: "今天的提问次数已经用完，明天零点恢复。",
  EVIDENCE_UNAVAILABLE: "今天的确定性资料尚未准备好。",
  UPSTREAM_TIMEOUT: "推演时间稍长，请稍后重试。",
  UPSTREAM_RATE_LIMIT: "实时服务当前繁忙，请稍后重试。",
  STREAM_INCOMPLETE: "连接中断，已保留生成的部分。",
  NETWORK_ERROR: "当前网络不可用，静态内容仍可阅读。",
  UPSTREAM_FAILED: "实时服务暂不可用，静态内容仍可阅读。"
});

function errorCopy(code) {
  return ERROR_COPY[code] ?? "实时服务暂不可用，静态内容仍可阅读。";
}

function paragraphs(value) {
  return String(value ?? "")
    .split(/\n\s*\n/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p>${e(part)}</p>`)
    .join("");
}

export function renderUnlockPanel({ enabled = true, status = "locked", errorCode = null } = {}) {
  if (!enabled) {
    return `<aside class="realtime-error" role="status"><strong>实时分析尚未启用</strong><p>静态内容仍可正常阅读。</p></aside>`;
  }
  return `<form class="unlock-sheet" data-realtime-form="unlock">
    <div><p class="eyebrow">实时分析</p><h2>解锁实时分析</h2><p>同一设备 30 天内无需重复输入。</p></div>
    <label for="realtime-code">访问码</label>
    <input id="realtime-code" name="code" type="password" minlength="8" maxlength="128" autocomplete="current-password" required ${status === "verifying" ? "disabled" : ""}>
    <button class="primary-button" type="submit" data-action="unlock-realtime" ${status === "verifying" ? "disabled" : ""}>${status === "verifying" ? "正在连接（最多 10 秒）" : "解锁"}</button>
    ${errorCode ? `<p class="field-error" role="alert">${e(errorCopy(errorCode))}</p>` : ""}
  </form>`;
}

export function renderDailyRealtime({ enabled = true, unlocked = false, unlock = {}, daily = {} } = {}) {
  if (daily.status === "complete") {
    return `<section class="daily-paper" aria-label="今日寄语">
      <p class="daily-phase">${e(daily.phase?.display)}</p>
      <article class="daily-message paper-card">
        <p class="eyebrow">今天想对你说</p>
        <blockquote>${e(daily.message)}</blockquote>
      </article>
      <article class="daily-reading paper-card">
        <h2>${e(daily.title)}</h2>
        <div class="daily-reading-copy">${paragraphs(daily.body)}</div>
        <p class="usage-line">生成于 ${e(daily.generatedAtLabel)}${daily.cached ? " · 已读取今日纸页" : " · 今日已更新"}</p>
      </article>
    </section>`;
  }
  if (!unlocked) return `<section class="realtime-panel paper-card" aria-label="今日实时分析">${renderUnlockPanel({ enabled, ...unlock })}</section>`;
  if (daily.status === "loading") {
    return `<section class="realtime-panel paper-card" aria-busy="true"><div class="ink-loader" aria-hidden="true"></div><p class="eyebrow">今日实时</p><h2>正在读取今天</h2><p>正在结合北京时间当天日期与个人基线生成解读。</p></section>`;
  }
  if (daily.status === "error") {
    return `<section class="realtime-panel paper-card"><aside class="realtime-error" role="status"><strong>${e(errorCopy(daily.errorCode))}</strong><p>上方静态结论不受影响。</p></aside><button class="secondary-button" type="button" data-action="retry-daily">重新尝试</button></section>`;
  }
  return `<section class="realtime-panel paper-card"><button class="primary-button" type="button" data-action="retry-daily">生成今日实时解读</button></section>`;
}

export function renderQuestionRealtime({ enabled = true, unlocked = false, unlock = {}, usage = null, answer = {}, savedAnswers = [] } = {}) {
  if (!unlocked) return renderUnlockPanel({ enabled, ...unlock });
  const exhausted = usage?.remaining === 0;
  const streaming = answer.status === "streaming";
  const hasText = Boolean(answer.text);
  const result = hasText || ["streaming", "error"].includes(answer.status) ? `
    <section class="answer-sheet" aria-live="polite" aria-busy="${streaming}">
      <p class="eyebrow">${streaming ? "正在推演" : answer.status === "complete" ? "分析完成" : "分析状态"}</p>
      <div class="streaming-answer" data-stream-output>${hasText ? e(answer.text) : `<span class="ink-loader" aria-hidden="true"></span>`}</div>
      ${answer.status === "incomplete" ? `<p class="field-error">回答未完成：${e(errorCopy(answer.errorCode))}</p>` : ""}
      ${answer.status === "error" ? `<p class="field-error" role="alert">${e(errorCopy(answer.errorCode))}</p>` : ""}
      <div class="answer-actions">
        ${streaming ? `<button type="button" class="secondary-button" data-action="cancel-analysis">停止生成</button>` : ""}
        ${hasText ? `<button type="button" class="secondary-button" data-action="copy-analysis">复制</button><button type="button" class="secondary-button" data-action="save-analysis">收藏到本机</button>` : ""}
      </div>
    </section>` : "";
  const saved = savedAnswers.length ? `<details class="saved-answers"><summary>本机收藏 ${savedAnswers.length} 条</summary>${savedAnswers.map(item => `
    <article class="saved-answer"><p>${e(item.text)}</p><button type="button" class="text-action" data-action="remove-saved-analysis" data-id="${e(item.id)}">移除</button></article>`).join("")}
    <button type="button" class="danger-button" data-action="clear-saved-analysis">清空实时收藏</button></details>` : "";
  return `<div class="realtime-question-status">
    <p class="usage-line">${usage ? `今日还可问 ${e(usage.remaining)} 次` : "正在读取今日额度"}</p>
    ${exhausted ? `<p class="field-error" role="status">今天的 10 次额度已用完，明天零点恢复。</p>` : ""}
    ${result}${saved}
  </div>`;
}

export { errorCopy };
