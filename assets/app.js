/* 2027 考研政治 · 错题知识库
 * 纯静态、无依赖。数据来自 data/knowledge.json。
 */
(() => {
  "use strict";

  const STORAGE_PROGRESS = "politics-review-progress-v1";
  const STORAGE_THEME = "politics-review-theme";
  const MODULE_COLORS = {
    马原: "#8f1d2c",
    毛中特: "#a8641b",
    新思想: "#2f5d7c",
    史纲: "#6b4f8a",
    思道法: "#3f7557",
  };
  const STATUS_LABELS = {
    persistent_weak: "持续薄弱",
    weak: "弱项",
    multi_wrong: "多题错",
    improved: "已改善",
    good: "掌握良好",
    extension: "拓展",
  };
  const STATUS_ORDER = {
    persistent_weak: 0,
    weak: 1,
    multi_wrong: 1,
    improved: 2,
    good: 3,
    extension: 4,
  };

  const state = {
    raw: null,
    modules: [],
    points: [],
    pointsById: new Map(),
    quizTopics: [],
    quizByKey: new Map(),
    wrongQuestions: [],
    comparisons: { horizontal: [], vertical: [] },
    questionStats: null,
    notesKnowledge: [],
    notesHorizontal: [],
    notesVertical: [],
    notesTab: "knowledge",
    questions: [],
    questionsById: new Map(),
    pointQuestions: {},
    bankModule: "all",
    bankBook: "all",
    bankSearch: "",
    bankLimit: 30,
    bankList: [],
    questionNav: [],
    currentQuestionId: null,
    pages: [],
    pageFilter: "all",
    currentPageIndex: 0,
    progress: loadProgress(),
    activeModule: "all",
    treeWeakOnly: false,
    search: "",
    wrongModule: "all",
    deepModule: "all",
    compareModule: "all",
    statsNoteModule: "all",
    cardScope: "weak",
    cardPool: [],
    cardIndex: 0,
    cardFlipped: false,
    currentPointId: null,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function stripHtml(value) {
    return String(value == null ? "" : value).replace(/<[^>]*>/g, "");
  }

  function highlight(text, query) {
    const safe = escapeHtml(text);
    if (!query) return safe;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!escaped) return safe;
    try {
      return safe.replace(new RegExp("(" + escaped + ")", "gi"), '<mark class="search-highlight">$1</mark>');
    } catch {
      return safe;
    }
  }

  function pct(value) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return Math.round(Number(value) * 100) + "%";
  }

  function moduleColor(name) {
    return MODULE_COLORS[name] || "#8f1d2c";
  }

  function statusBadge(status) {
    const key = STATUS_LABELS[status] ? status : "extension";
    return '<span class="status-badge ' + key + '">' + escapeHtml(STATUS_LABELS[key]) + "</span>";
  }

  function pointLabel(item) {
    if (!item) return "";
    if (item.displayTitle) return item.displayTitle;
    const module = item.module || "";
    const title = item.title || item.topic || "";
    return module && title ? module + "·" + title : title;
  }

  function severityForPoint(point) {
    if (point.status === "persistent_weak") return { label: "持续薄弱", cls: "high" };
    if (point.quiz && point.quiz.multiWrong) return { label: "多题错", cls: "high" };
    if (point.status === "weak" || (point.errorRate != null && point.errorRate >= 0.5)) {
      return { label: "错误率高", cls: "medium" };
    }
    if (point.status === "extension") {
      return { label: "拓展", cls: "low" };
    }
    return { label: "建议复习", cls: "low" };
  }

  function normalizeData(raw) {
    const modules = Array.isArray(raw.modules) ? raw.modules : [];
    const quizTopics = Array.isArray(raw.quizTopics)
      ? raw.quizTopics
      : raw.quiz && Array.isArray(raw.quiz.topics)
        ? raw.quiz.topics
        : [];
    const wrongQuestions = Array.isArray(raw.wrongQuestions) ? raw.wrongQuestions : [];
    const quizByKey = new Map();
    quizTopics.forEach((topic) => {
      quizByKey.set(String(topic.module) + "|" + String(topic.title), topic);
    });
    const points = [];
    modules.forEach((module) => {
      const units = Array.isArray(module.units) ? module.units : [];
      units.forEach((unit) => {
        const unitPoints = Array.isArray(unit.points) ? unit.points : [];
        unitPoints.forEach((point) => {
          const quiz =
            quizByKey.get(String(point.module || module.module) + "|" + String(point.quizTitle || "")) ||
            quizByKey.get(String(point.module || module.module) + "|" + String(point.title || "")) ||
            null;
          points.push({
            ...point,
            module: point.module || module.module,
            modulePrefix: module.prefix,
            moduleOverview: module.overview,
            unitName: unit.name,
            quiz,
            frequency: Number(point.frequency) || (quiz ? 1 : 1),
            errorRate:
              point.errorRate != null
                ? Number(point.errorRate)
                : quiz && quiz.errorRate != null
                  ? Number(quiz.errorRate)
                  : quiz && quiz.rate != null
                    ? 1 - Number(quiz.rate)
                    : null,
          });
        });
      });
    });
    return { modules, points, quizTopics, quizByKey, wrongQuestions };
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_PROGRESS);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(state.progress));
    } catch {
      /* localStorage 不可用时静默降级 */
    }
  }

  function progressFor(pointId) {
    return state.progress[pointId] || { status: "new", reviews: 0, last: null };
  }

  function setProgress(pointId, status) {
    const prev = progressFor(pointId);
    state.progress[pointId] = {
      status,
      reviews: (prev.reviews || 0) + 1,
      last: new Date().toISOString().slice(0, 10),
    };
    saveProgress();
    renderAll();
    toast(status === "mastered" ? "已标记为掌握" : status === "learning" ? "已标记为一般" : "已标记为不熟");
  }

  function isMastered(point) {
    return progressFor(point.id).status === "mastered";
  }

  function priorityScore(point) {
    let score = 0;
    if (point.status === "persistent_weak") score += 100;
    if (point.quiz && point.quiz.multiWrong) score += 45;
    if (point.status === "weak") score += 30;
    if (point.status === "improved") score -= 10;
    if (point.status === "good") score -= 25;
    score += (point.errorRate || 0) * 35;
    score += (point.frequency || 1) * 4;
    return score;
  }

  function weakPoints() {
    return state.points
      .filter(
        (point) =>
          point.status === "persistent_weak" ||
          point.status === "weak" ||
          (point.quiz && point.quiz.multiWrong) ||
          (point.errorRate != null && point.errorRate > 0),
      )
      .sort((a, b) => priorityScore(b) - priorityScore(a));
  }

  function allSortedPoints() {
    return [...state.points].sort((a, b) => priorityScore(b) - priorityScore(a));
  }

  function findPointByQuiz(topic) {
    if (!topic) return null;
    const normalize = (value) =>
      String(value || "")
        .replace(/[\s“”"'（）()：:，,。.、；;！!？?—\-]/g, "")
        .toLowerCase();
    const target = normalize(topic.title);
    if (!target) return null;
    return (
      state.points.find(
        (point) =>
          normalize(point.quizTitle) === target ||
          normalize(point.title) === target ||
          (point.quiz && normalize(point.quiz.title) === target),
      ) ||
      state.points.find(
        (point) =>
          normalize(point.title).includes(target) ||
          target.includes(normalize(point.title)) ||
          normalize(point.quizTitle).includes(target),
      ) ||
      null
    );
  }

  function renderAll() {
    if (!state.raw) return;
    renderOverview();
    renderTree();
    renderDeep();
    renderCompare();
    renderNotesView();
    renderStats();
    renderPages();
    renderBank();
    renderWrong();
    renderRanking();
    renderCards();
  }

  function renderOverview() {
    const weak = weakPoints();
    const persistent = state.quizTopics.filter((topic) => topic.persistentWeak);
    const multiWrong = state.quizTopics.filter((topic) => topic.multiWrong);
    const improved = state.quizTopics.filter((topic) => topic.trend === "improved");
    const worsened = state.quizTopics.filter((topic) => topic.trend === "worsened");
    const wrongCount = state.wrongQuestions.filter((q) => q.markedWrong).length;

    $("#heroStats").innerHTML = [
      ["考点总数", state.points.length, "五门课 · 模块级"],
      ["曾出现弱项", state.quizTopics.filter((t) => t.weakRounds > 0).length, "两轮测验"],
      ["持续薄弱", persistent.length, "两轮都错"],
      ["照片错题", wrongCount || "—", "有明确批改"],
    ]
      .map(
        ([label, value, note], index) =>
          '<div class="stat-card' +
          (index === 2 ? " accent" : "") +
          '"><span class="stat-value">' +
          escapeHtml(value) +
          '</span><span class="stat-label">' +
          escapeHtml(label) +
          '</span><span class="stat-note">' +
          escapeHtml(note) +
          "</span></div>",
      )
      .join("");

    $("#moduleGrid").innerHTML = state.modules
      .map((module) => {
        const points = state.points.filter((point) => point.module === module.module);
        const weakCount = points.filter(
          (point) =>
            point.status === "persistent_weak" ||
            point.status === "weak" ||
            (point.quiz && point.quiz.multiWrong),
        ).length;
        const ratio = points.length ? Math.round((weakCount / points.length) * 100) : 0;
        return (
          '<a class="module-card" href="#/tree?module=' +
          encodeURIComponent(module.module) +
          '" style="--module-color:' +
          moduleColor(module.module) +
          '">' +
          '<div class="module-top"><span class="module-name">' +
          escapeHtml(module.module) +
          '</span><span class="module-count">' +
          points.length +
          " 个考点</span></div>" +
          '<div class="module-bar"><span style="width:' +
          Math.max(6, ratio) +
          '%"></span></div>' +
          '<p class="module-weak"><strong>' +
          weakCount +
          "</strong>个需要优先复习</p>" +
          '<div class="module-meta"><span class="module-count">弱项占比 ' +
          ratio +
          '%</span><span class="module-link">查看知识树 →</span></div>' +
          "</a>"
        );
      })
      .join("");

    const focus = weak.slice(0, 3);
    $("#todayFocus").innerHTML =
      focus
        .map((point, index) => {
          const why =
            point.status === "persistent_weak"
              ? "两轮都错，先补概念边界，再做关联题。"
              : point.quiz && point.quiz.multiWrong
                ? "累计多题未全对，属于稳定弱项。"
                : "错误率较高，先看关键点和易错提醒。";
          const questionCount = (state.pointQuestions[point.id] || []).length;
          return (
            '<button class="today-card" type="button" data-point="' +
            escapeHtml(point.id) +
            '"><span class="today-index">0' +
            (index + 1) +
            '</span><span class="today-body"><strong>' +
            escapeHtml(pointLabel(point)) +
            '</strong><span class="today-why">' +
            escapeHtml(why) +
            '</span><span class="today-meta">' +
            escapeHtml(point.module) +
            " · 错误率 " +
            pct(point.errorRate) +
            " · 关联 " +
            questionCount +
            ' 题</span></span><span class="today-cta">开始 →</span></button>'
          );
        })
        .join("") || '<div class="empty">暂无弱项数据。</div>';
  }

  function drawQuadrant(svg, points, large) {
    if (!svg) return;
    const width = large ? 900 : 640;
    const height = large ? 440 : 360;
    const pad = { left: 58, right: 28, top: 28, bottom: 46 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const plotPoints = points
      .filter((point) => point.errorRate != null && point.frequency != null)
      .slice(0, large ? 60 : 30);
    const x = (freq) => pad.left + ((Math.max(1, Math.min(5, freq)) - 1) / 4) * plotW;
    const y = (rate) => pad.top + (1 - Math.max(0, Math.min(1, rate))) * plotH;
    const parts = [];
    parts.push(
      '<rect x="0" y="0" width="' +
        width +
        '" height="' +
        height +
        '" fill="transparent"></rect>',
    );
    for (let i = 0; i <= 4; i += 1) {
      const gx = pad.left + (i / 4) * plotW;
      const gy = pad.top + (i / 4) * plotH;
      parts.push(
        '<line class="quadrant-grid" x1="' + gx + '" y1="' + pad.top + '" x2="' + gx + '" y2="' + (pad.top + plotH) + '"></line>',
      );
      parts.push(
        '<line class="quadrant-grid" x1="' + pad.left + '" y1="' + gy + '" x2="' + (pad.left + plotW) + '" y2="' + gy + '"></line>',
      );
    }
    parts.push(
      '<line class="quadrant-split" x1="' + x(3) + '" y1="' + pad.top + '" x2="' + x(3) + '" y2="' + (pad.top + plotH) + '"></line>',
    );
    parts.push(
      '<line class="quadrant-split" x1="' + pad.left + '" y1="' + y(0.5) + '" x2="' + (pad.left + plotW) + '" y2="' + y(0.5) + '"></line>',
    );
    parts.push(
      '<text class="quadrant-label" x="' + (x(3) - 8) + '" y="' + (pad.top + 16) + '" text-anchor="end">低频高错 · 补基础</text>',
    );
    parts.push(
      '<text class="quadrant-label" x="' + (x(3) + 8) + '" y="' + (pad.top + 16) + '">高频高错 · 优先攻</text>',
    );
    parts.push(
      '<text class="quadrant-label" x="' + (x(3) - 8) + '" y="' + (pad.top + plotH - 10) + '" text-anchor="end">低频低错 · 保持</text>',
    );
    parts.push(
      '<text class="quadrant-label" x="' + (x(3) + 8) + '" y="' + (pad.top + plotH - 10) + '">高频低错 · 稳住</text>',
    );
    parts.push(
      '<text class="quadrant-axis" x="' + (pad.left + plotW) + '" y="' + (height - 12) + '" text-anchor="end">相对考频 →</text>',
    );
    parts.push(
      '<text class="quadrant-axis" x="14" y="' + (pad.top + plotH / 2) + '" transform="rotate(-90 14 ' + (pad.top + plotH / 2) + ')" text-anchor="middle">错误率 →</text>',
    );
    for (let i = 1; i <= 5; i += 1) {
      parts.push(
        '<text class="quadrant-axis" x="' + x(i) + '" y="' + (pad.top + plotH + 18) + '" text-anchor="middle">' + i + "</text>",
      );
    }
    [0, 0.25, 0.5, 0.75, 1].forEach((rate) => {
      parts.push(
        '<text class="quadrant-axis" x="' + (pad.left - 10) + '" y="' + (y(rate) + 4) + '" text-anchor="end">' + Math.round(rate * 100) + "%</text>",
      );
    });
    const groups = new Map();
    plotPoints.forEach((point) => {
      const key = point.frequency + "|" + Number(point.errorRate).toFixed(2);
      const group = groups.get(key) || { key: key, points: [], count: 0, total: 0 };
      group.points.push(point);
      group.count += 1;
      group.total += point.quiz ? point.quiz.total : 1;
      groups.set(key, group);
    });
    const groupList = Array.from(groups.values()).sort((a, b) => b.count - a.count);
    groupList.forEach((group, index) => {
      group.points.sort((a, b) => priorityScore(b) - priorityScore(a));
      const point = group.points[0];
      const cx = x(point.frequency);
      const cy = y(point.errorRate);
      const r = Math.max(6, Math.min(18, 5 + Math.sqrt(group.count) * 3.2));
      const groupColor = group.points.some((item) => item.status === "persistent_weak")
        ? "#b4233a"
        : group.points.some((item) => item.status === "weak" || (item.quiz && item.quiz.multiWrong))
          ? "#b26a1f"
          : group.points.every((item) => item.status === "good")
            ? "#2f5d7c"
            : "#3f7557";
      parts.push(
        '<circle class="quadrant-dot" cx="' +
          cx +
          '" cy="' +
          cy +
          '" r="' +
          r +
          '" fill="' +
          groupColor +
          '" fill-opacity="0.8" stroke="' +
          groupColor +
          '" stroke-width="1.5" data-point="' +
          escapeHtml(point.id) +
          '"><title>' +
          escapeHtml(
            group.count +
              " 个考点在此位置 · 代表：" +
              pointLabel(point) +
              " · 错误率 " +
              pct(point.errorRate) +
              " · 考频 " +
              point.frequency +
              "/5",
          ) +
          "</title></circle>",
      );
      if (large && index < 12) {
        const labelX = cx > width - 180 ? cx - r - 4 : cx + r + 4;
        const anchor = cx > width - 180 ? "end" : "start";
        const label = group.count > 1 ? group.count + " 个考点" : pointLabel(point).replace(/^.*?·/, "").slice(0, 16);
        parts.push(
          '<text class="quadrant-dot-label" x="' +
            labelX +
            '" y="' +
            (cy + 3) +
            '" text-anchor="' +
            anchor +
            '">' +
            escapeHtml(label) +
            "</text>",
        );
      }
    });
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.innerHTML = parts.join("");
    svg.querySelectorAll(".quadrant-dot").forEach((dot) => {
      dot.addEventListener("click", () => openPoint(dot.getAttribute("data-point")));
    });
  }

  function renderTree() {
    const chips = ["all", ...state.modules.map((module) => module.module)];
    $("#moduleChips").innerHTML =
      chips
        .map(
          (name) =>
            '<button class="chip' +
            (state.activeModule === name ? " active" : "") +
            '" type="button" data-module="' +
            escapeHtml(name) +
            '">' +
            (name === "all" ? "全部" : escapeHtml(name)) +
            "</button>",
        )
        .join("") +
      '<button class="chip' +
      (state.treeWeakOnly ? " active" : "") +
      '" type="button" data-tree-weak="1">只看弱项</button>';

    const query = state.search.trim().toLowerCase();
    const modules = state.modules.filter(
      (module) => state.activeModule === "all" || module.module === state.activeModule,
    );
    let resultCount = 0;
    const html = modules
      .map((module) => {
        const units = (module.units || [])
          .map((unit) => {
            const points = (unit.points || []).filter((point) => {
              if (
                state.treeWeakOnly &&
                !(
                  point.status === "persistent_weak" ||
                  point.status === "weak" ||
                  (point.quiz && point.quiz.multiWrong)
                )
              ) {
                return false;
              }
              if (!query) return true;
              const haystack = [
                point.title,
                point.displayTitle,
                point.summary,
                point.detail,
                ...(point.keyPoints || []),
                ...(point.traps || []),
                point.unitName,
              ]
                .join(" ")
                .toLowerCase();
              return haystack.includes(query);
            });
            resultCount += points.length;
            if (!points.length) return "";
            return (
              '<div class="unit' +
              (query ? " open" : "") +
              '">' +
              '<button class="unit-head" type="button"><h3>' +
              highlight(unit.name, state.search) +
              '</h3><span class="unit-count">' +
              points.length +
              " 个考点</span></button>" +
              '<div class="unit-body">' +
              points
                .map((point) => {
                  const mastered = isMastered(point);
                  return (
                    '<button class="point-row' +
                    (mastered ? " mastered" : "") +
                    '" type="button" data-point="' +
                    escapeHtml(point.id) +
                    '">' +
                    '<span class="point-main"><span class="point-title">' +
                    highlight(pointLabel(point), state.search) +
                    '</span><span class="point-meta">' +
                    statusBadge(point.status) +
                    "<span>考频 " +
                    (point.frequency || 1) +
                    "/5</span><span>错误率 " +
                    pct(point.errorRate) +
                    "</span>" +
                    (mastered ? "<span>已掌握</span>" : "") +
                    "</span></span>" +
                    '<span class="point-arrow">›</span>' +
                    "</button>"
                  );
                })
                .join("") +
              "</div></div>"
            );
          })
          .join("");
        if (!units) return "";
        return (
          '<section class="module-block' +
          (query || state.activeModule !== "all" ? " open" : "") +
          '">' +
          '<button class="module-block-head" type="button">' +
          '<span class="module-block-title" style="color:' +
          moduleColor(module.module) +
          '">' +
          escapeHtml(module.module) +
          "<small>" +
          (module.units || []).reduce((sum, unit) => sum + (unit.points || []).length, 0) +
          " 个考点</small></span>" +
          '<span class="module-count">展开 / 收起</span>' +
          "</button>" +
          '<div class="module-block-body">' +
          (module.overview ? '<p class="section-note" style="text-align:left;max-width:none;margin:0 0 8px">' + escapeHtml(module.overview) + "</p>" : "") +
          units +
          "</div></section>"
        );
      })
      .join("");
    $("#treeContent").innerHTML = html || '<div class="empty">没有匹配的考点，换个关键词试试。</div>';
    $("#searchHint").textContent = query ? resultCount + " 个结果" : "";
  }

  function textGrams(text) {
    const value = String(text || "").replace(/[\s“”"'（）()：:，,。.、；;！!？?—\-]/g, "");
    const grams = new Set();
    for (let i = 0; i < value.length - 1; i += 1) grams.add(value.slice(i, i + 2));
    return grams;
  }

  function gramOverlap(a, b) {
    const left = textGrams(a);
    const right = textGrams(b);
    if (!left.size || !right.size) return 0;
    let shared = 0;
    left.forEach((gram) => {
      if (right.has(gram)) shared += 1;
    });
    return shared / Math.min(left.size, right.size);
  }

  function bestDetailSentence(point, target) {
    const sentences = String(point.detail || point.summary || "")
      .split(/[。；]/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 8);
    let best = sentences[0] || point.summary || point.detail || "";
    let bestScore = 0;
    sentences.forEach((sentence) => {
      const score = gramOverlap(sentence, target);
      if (score > bestScore) {
        best = sentence;
        bestScore = score;
      }
    });
    return best;
  }

  function bestQuestionForText(text, candidates) {
    let best = null;
    let bestScore = 0;
    (candidates || []).forEach((question) => {
      const score = gramOverlap(
        text,
        (question.stem || "") + (question.topic || "") + (question.quizTopic || ""),
      );
      if (score > bestScore) {
        best = question;
        bestScore = score;
      }
    });
    return bestScore > 0 ? best : null;
  }

  function findQuestionByExample(example) {
    const pageMatch = String(example || "").match(/p(\d{3})/i);
    if (!pageMatch) return null;
    const page = "p" + pageMatch[1];
    const candidates = state.questions.filter((question) => question.page === page);
    if (!candidates.length) return null;
    const keywords = String(example || "")
      .replace(/p\d{3}/gi, "")
      .split(/[^一-鿿]+/)
      .filter((word) => word.length >= 2);
    let best = null;
    let bestScore = 0;
    candidates.forEach((question) => {
      const haystack = (question.stem || "") + (question.topic || "") + (question.quizTopic || "");
      let score = 0;
      keywords.forEach((word) => {
        if (haystack.includes(word)) score += 1;
      });
      if (score > bestScore) {
        best = question;
        bestScore = score;
      }
    });
    return best || candidates[0];
  }

  function findBankQuestion(wrong) {
    const direct = state.questionsById.get(
      wrong.page + "-" + (wrong.actualNumber || wrong.number),
    );
    if (direct) return direct;
    let best = null;
    let bestScore = 0;
    state.questions.forEach((question) => {
      if (question.page !== wrong.page) return;
      const score = gramOverlap(wrong.stem || "", question.stem || "");
      if (score > bestScore) {
        best = question;
        bestScore = score;
      }
    });
    return bestScore >= 0.25 ? best : null;
  }

  function renderWrong() {
    const chips = ["all", ...state.modules.map((module) => module.module)];
    $("#wrongChips").innerHTML = chips
      .map(
        (name) =>
          '<button class="chip' +
          (state.wrongModule === name ? " active" : "") +
          '" type="button" data-wrong-module="' +
          escapeHtml(name) +
          '">' +
          (name === "all" ? "全部" : escapeHtml(name)) +
          "</button>",
      )
      .join("");
    const items = state.wrongQuestions.filter(
      (question) =>
        question.markedWrong &&
        (state.wrongModule === "all" || question.module === state.wrongModule),
    );
    $("#wrongCount").textContent = items.length + " 道";
    if (!items.length) {
      $("#wrongList").innerHTML =
        '<div class="empty">照片中暂未提取到有明确批改证据的错题。可以先用“高频易错”和“抽认卡”复习测验弱项。</div>';
      return;
    }
    $("#wrongList").innerHTML = items
      .map((question, index) => {
        const point =
          (question.pointId && state.pointsById.get(question.pointId)) ||
          findPointByQuiz({
            module: question.module,
            title: question.quizTopic || question.topic,
          });
        const bankQuestion = findBankQuestion(question);
        const displayNumber = question.actualNumber || question.number || index + 1;
        const recordNote =
          question.actualNumber && String(question.actualNumber) !== String(question.number)
            ? "（原记录第 " + escapeHtml(question.number) + " 题）"
            : "";
        const hasAnswer =
          question.correctAnswer &&
          question.correctAnswer !== "未知" &&
          question.correctAnswer !== "";
        const answerHtml =
          '<div class="wrong-answers">' +
          '<div class="wrong-answer wrong"><strong>学生答案</strong> ' +
          escapeHtml(question.studentAnswer || "未标记") +
          "</div>" +
          '<div class="wrong-answer ' +
          (hasAnswer ? "right" : "unknown") +
          '"><strong>正确答案</strong> ' +
          escapeHtml(question.correctAnswer || "见解析") +
          (question.answerSource ? " · " + escapeHtml(question.answerSource) : "") +
          "</div></div>";
        return (
          '<article class="wrong-card">' +
          '<div class="wrong-head"><span class="wrong-number">第 ' +
          escapeHtml(displayNumber) +
          " 题" +
          recordNote +
          '</span><div class="wrong-tags">' +
          '<span class="pill">' +
          escapeHtml(question.module || "未分类") +
          "</span>" +
          (question.answerType ? '<span class="pill">' + escapeHtml(question.answerType) + "</span>" : "") +
          (question.judgeConfidence
            ? '<span class="pill">判断 ' + escapeHtml(question.judgeConfidence) + "</span>"
            : "") +
          "</div></div>" +
          '<p class="wrong-stem">' +
          escapeHtml(question.stem || "（题干未提取）") +
          "</p>" +
          answerHtml +
          (question.answerReason
            ? '<p class="wrong-reason"><strong>判断理由：</strong>' + escapeHtml(question.answerReason) + "</p>"
            : "") +
          (question.note
            ? '<p class="wrong-note"><strong>题边旁注：</strong>' +
              escapeHtml(question.note) +
              (question.noteMeaning ? "<br><span>" + escapeHtml(question.noteMeaning) + "</span>" : "") +
              "</p>"
            : "") +
          (question.markEvidence
            ? '<p class="wrong-evidence">批改证据：' + escapeHtml(question.markEvidence) + "</p>"
            : "") +
          '<div class="wrong-tags" style="justify-content:flex-start;margin-top:10px">' +
          (question.topic || question.quizTopic
            ? '<span class="pill">' +
              escapeHtml(question.displayTopic || question.topic || question.quizTopic) +
              "</span>"
            : "") +
          '<span class="pill">来源 ' +
          escapeHtml(question.pageLabel || question.page || "未知") +
          "</span>" +
          (question.bookVolume
            ? '<span class="pill">' + escapeHtml(question.bookVolume) + "</span>"
            : "") +
          (question.section ? '<span class="pill">' + escapeHtml(question.section) + "</span>" : "") +
          (bankQuestion
            ? '<button class="btn small ghost" type="button" data-question="' +
              escapeHtml(bankQuestion.id) +
              '">查看题目</button>'
            : "") +
          (state.pages.some((page) => page.page === question.page)
            ? '<button class="btn small ghost" type="button" data-page="' +
              escapeHtml(question.page || "") +
              '">查看题目页</button>'
            : "") +
          (point
            ? '<button class="btn small ghost" type="button" data-point="' + escapeHtml(point.id) + '">查看相关考点</button>'
            : "") +
          "</div></article>"
        );
      })
      .join("");
  }

  function bookLabel(question) {
    if (!question.book) return "练习册";
    const volume = question.bookVolume || "";
    if (volume.includes("第四卷")) return "甄选·四卷";
    if (volume.includes("第三卷")) return "甄选·三卷";
    if (volume.includes("第二卷")) return "甄选·二卷";
    if (volume.includes("第一卷")) return "甄选·一卷";
    return "甄选题集";
  }

  function renderBank() {
    const questions = state.questions || [];
    const books = ["all", ...Array.from(new Set(questions.map(bookLabel)))];
    const bookHost = $("#bankBookChips");
    if (bookHost) {
      bookHost.innerHTML = books
        .map(
          (name) =>
            '<button class="chip' +
            (state.bankBook === name ? " active" : "") +
            '" type="button" data-bank-book="' +
            escapeHtml(name) +
            '">' +
            (name === "all" ? "全部题册" : escapeHtml(name)) +
            "</button>",
        )
        .join("");
    }
    const modules = ["all", ...Array.from(new Set(questions.map((question) => question.module).filter(Boolean)))];
    $("#bankChips").innerHTML = modules
      .map(
        (name) =>
          '<button class="chip' +
          (state.bankModule === name ? " active" : "") +
          '" type="button" data-bank-module="' +
          escapeHtml(name) +
          '">' +
          (name === "all" ? "全部" : escapeHtml(name)) +
          "</button>",
      )
      .join("");
    const query = state.bankSearch.trim().toLowerCase();
    const filtered = questions.filter((question) => {
      if (state.bankModule !== "all" && question.module !== state.bankModule) return false;
      if (state.bankBook !== "all" && bookLabel(question) !== state.bankBook) return false;
      if (!query) return true;
      const haystack = [
        question.page,
        question.pageLabel,
        question.number,
        question.stem,
        question.topic,
        question.quizTopic,
        question.book,
        question.bookVolume,
        ...Object.values(question.options || {}),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
    const visible = filtered.slice(0, state.bankLimit);
    state.bankList = visible.map((question) => question.id);
    $("#bankCount").textContent =
      visible.length + " / " + filtered.length + " 题";
    $("#bankList").innerHTML =
      visible
        .map(
          (question) =>
            '<button class="bank-card" type="button" data-question="' +
            escapeHtml(question.id) +
            '"><span class="bank-meta"><span>' +
            escapeHtml(question.pageLabel || question.page) +
            " · 第 " +
            escapeHtml(question.number) +
            " 题</span><span>" +
            escapeHtml(question.type || "") +
            "</span><span>" +
            escapeHtml(bookLabel(question)) +
            '</span></span><span class="bank-stem">' +
            escapeHtml(question.stem || "题干未录入") +
            '</span><span class="bank-tags">' +
            (question.topic
              ? '<span class="pill">' + escapeHtml(question.topic) + "</span>"
              : "") +
            (question.duplicateOf && question.duplicateOf.length
              ? '<span class="pill">同题异书</span>'
              : "") +
            (question.isWrong ? '<span class="bank-wrong">有批改痕迹</span>' : "") +
            '<span class="pill">' +
            escapeHtml(question.correctAnswer || "—") +
            " · " +
            escapeHtml(question.answerSource || "AI推断") +
            "</span></span></button>",
        )
        .join("") +
      (filtered.length > visible.length
        ? '<button class="btn ghost bank-more" type="button" data-bank-more>加载更多（还有 ' +
          (filtered.length - visible.length) +
          " 题）</button>"
        : "") || '<div class="empty">没有匹配的题目。</div>';
  }

  function updateQuestionViewer() {
    const question = state.questionsById.get(state.currentQuestionId);
    if (!question) return;
    const correct = String(question.correctAnswer || "")
      .replace(/[^A-D]/g, "")
      .split("");
    const picked = String(question.studentAnswer || "")
      .replace(/[^A-D]/g, "")
      .split("");
    const book = bookLabel(question);
    $("#qKicker").textContent = [
      book === "练习册" ? "" : book,
      question.module,
      question.section,
      question.type,
    ]
      .filter(Boolean)
      .join(" · ");
    $("#qTitle").textContent = (question.pageLabel || question.page) + " · 第 " + question.number + " 题";
    $("#qStem").textContent = question.stem || "题干未录入。";
    $("#qOptions").innerHTML = ["A", "B", "C", "D"]
      .map((letter) => {
        const text = (question.options || {})[letter] || "（未录入）";
        const isCorrect = correct.includes(letter);
        const isPicked = picked.includes(letter);
        const classes = isCorrect ? "correct" : isPicked ? "picked-wrong" : "";
        const tags = [];
        if (isCorrect) tags.push("正确答案");
        if (isPicked && !isCorrect) tags.push("你的选择");
        if (isPicked && isCorrect) tags.push("你的选择 · 正确");
        return (
          '<div class="q-option ' +
          classes +
          '"><span class="q-option-label">' +
          letter +
          "</span><span>" +
          escapeHtml(text) +
          '</span><span class="q-option-tag">' +
          tags.join(" · ") +
          "</span></div>"
        );
      })
      .join("");
    $("#qAnswer").innerHTML =
      "<strong>学生答案：</strong>" +
      escapeHtml(question.studentAnswer || "未标记") +
      "　<strong>正确答案：</strong>" +
      escapeHtml(question.correctAnswer || "—") +
      "　<strong>来源：</strong>" +
      escapeHtml(question.answerSource || "AI推断") +
      (question.answerReason
        ? "<br><strong>" +
          (question.answerSource === "题集解析" ? "解析" : "判断理由") +
          "：</strong>" +
          escapeHtml(question.answerReason)
        : "");
    $("#qNote").innerHTML = question.note
      ? "<strong>题边旁注：</strong>" +
        escapeHtml(question.note) +
        (question.noteMeaning ? "<br>" + escapeHtml(question.noteMeaning) : "")
      : "";
    $("#qMeta").innerHTML =
      (question.topic ? '<span class="pill">' + escapeHtml(question.topic) + "</span>" : "") +
      (question.quizTopic
        ? '<span class="pill">' +
          escapeHtml(question.module + "·" + question.quizTopic) +
          "</span>"
        : "") +
      (question.duplicateOf && question.duplicateOf.length
        ? '<span class="pill">同题异书 · ' + escapeHtml(question.duplicateOf.join("、")) + "</span>"
        : "") +
      (question.pointId
        ? '<button class="btn small ghost" type="button" data-point="' +
          escapeHtml(question.pointId) +
          '">查看考点</button>'
        : "");
    const index = state.questionNav.indexOf(question.id);
    $("#qPosition").textContent =
      (index >= 0 ? index + 1 : 1) + " / " + Math.max(1, state.questionNav.length);
  }

  function openQuestion(questionId) {
    const question = state.questionsById.get(questionId);
    if (!question) return;
    let nav = [];
    if (state.currentPointId && (state.pointQuestions[state.currentPointId] || []).includes(questionId)) {
      nav = state.pointQuestions[state.currentPointId];
    } else if (state.bankList.includes(questionId)) {
      nav = state.bankList;
    } else {
      nav = state.questions
        .filter((item) => item.page === question.page)
        .map((item) => item.id);
    }
    state.questionNav = nav.length ? nav : state.questions.map((item) => item.id);
    state.currentQuestionId = questionId;
    closeDrawer();
    updateQuestionViewer();
    $("#questionViewer").hidden = false;
    document.body.classList.add("question-viewer-open");
  }

  function closeQuestionViewer() {
    const viewer = $("#questionViewer");
    if (!viewer) return;
    viewer.hidden = true;
    document.body.classList.remove("question-viewer-open");
    state.currentQuestionId = null;
  }

  function moveQuestion(delta) {
    if (!state.questionNav.length) return;
    let index = state.questionNav.indexOf(state.currentQuestionId);
    if (index < 0) index = 0;
    index = Math.max(0, Math.min(state.questionNav.length - 1, index + delta));
    state.currentQuestionId = state.questionNav[index];
    updateQuestionViewer();
  }

  function renderPages() {
    const pages = state.pages || [];
    const modules = ["all", ...Array.from(new Set(pages.map((page) => page.module).filter(Boolean)))];
    $("#pageChips").innerHTML = modules
      .map(
        (name) =>
          '<button class="chip' +
          (state.pageFilter === name ? " active" : "") +
          '" type="button" data-page-filter="' +
          escapeHtml(name) +
          '">' +
          (name === "all" ? "全部" : escapeHtml(name)) +
          "</button>",
      )
      .join("");
    const filtered = pages.filter(
      (page) => state.pageFilter === "all" || page.module === state.pageFilter,
    );
    $("#pageCount").textContent = filtered.length + " 页";
    $("#pageGrid").innerHTML =
      filtered
        .map(
          (page) =>
            '<button class="page-card text-page-card" type="button" data-page="' +
            escapeHtml(page.page) +
            '"><span class="page-card-body"><strong>' +
            escapeHtml(page.page + " · " + (page.module || "")) +
            "</strong><span>" +
            escapeHtml(page.section || "") +
            " · " +
            (page.questionCount || 0) +
            " 题 · " +
            (page.wrongCount || 0) +
            ' 错</span><span class="page-excerpt">' +
            escapeHtml(page.summary || (page.ocrText || "").slice(0, 80)) +
            "</span></span></button>",
        )
        .join("") || '<div class="empty">没有匹配的题目页。</div>';
  }

  function updatePageViewer() {
    const pages = state.pages || [];
    const page = pages[state.currentPageIndex];
    if (!page) return;
    $("#pageViewerKicker").textContent =
      (page.module || "") + " · " + (page.section || "题目页");
    $("#pageViewerTitle").textContent =
      page.page + (page.printedPageNo ? " · 册页 " + page.printedPageNo : "");
    const pageQuestions = (state.questions || [])
      .filter((question) => question.page === page.page)
      .sort(
        (a, b) =>
          (Number(String(a.number).replace(/\D/g, "")) || 0) -
          (Number(String(b.number).replace(/\D/g, "")) || 0),
      );
    $("#pageViewerQuestions").innerHTML =
      pageQuestions
        .map(
          (question) =>
            '<button class="page-question-item" type="button" data-question="' +
            escapeHtml(question.id) +
            '"><strong>第 ' +
            escapeHtml(question.number) +
            " 题</strong> · " +
            escapeHtml(question.type || "") +
            " · " +
            escapeHtml(question.topic || "") +
            "<br><span>" +
            escapeHtml((question.stem || "").slice(0, 70)) +
            "</span></button>",
        )
        .join("") || "<p>暂无结构化题目，见 OCR 原文。</p>";
    $("#pageViewerText").textContent = page.ocrText || "暂无 OCR 文本。";
    $("#pagePosition").textContent =
      "第 " + (state.currentPageIndex + 1) + " / " + pages.length + " 页";
    const topics = (page.topics || [])
      .map(
        (topic) =>
          '<span class="pill">' +
          escapeHtml((topic.topic || "") + " ×" + (topic.count || 1)) +
          "</span>",
      )
      .join("");
    const wrong = (page.wrong || [])
      .map(
        (question) =>
          "<li>第 " +
          escapeHtml(question.number || "") +
          " 题：学生 " +
          escapeHtml(question.studentAnswer || "未标记") +
          " · 推断 " +
          escapeHtml(question.correctAnswer || "见解析") +
          "</li>",
      )
      .join("");
    const notes = (page.notes || [])
      .map(
        (note) =>
          "<li>" +
          (note.question ? "第 " + escapeHtml(note.question) + " 题：" : "") +
          "“" +
          escapeHtml(note.note || "") +
          "”" +
          (note.meaning ? "——" + escapeHtml(note.meaning) : "") +
          "</li>",
      )
      .join("");
    $("#pageViewerInfo").innerHTML =
      '<p class="page-viewer-note">OCR 文字版：手写遮挡、划线或透印处可能有缺字/错字，以纸质册为准。</p>' +
      "<p>" +
      escapeHtml(page.summary || "") +
      '</p><div class="page-viewer-tags">' +
      '<span class="pill">题目 ' +
      (page.questionCount || 0) +
      "</span>" +
      '<span class="pill">错题 ' +
      (page.wrongCount || 0) +
      "</span>" +
      '<span class="pill">笔记/知识点 ' +
      (page.notesCount || 0) +
      "</span></div>" +
      "<h4>本页考点</h4>" +
      (topics ? '<div class="page-viewer-tags">' + topics + "</div>" : "<p>暂无考点统计。</p>") +
      "<h4>本页错题</h4>" +
      (wrong ? "<ul>" + wrong + "</ul>" : "<p>本页没有明确批改证据的错题。</p>") +
      "<h4>本页题边笔记</h4>" +
      (notes ? "<ul>" + notes + "</ul>" : "<p>本页未单独提取文字笔记，可直接看原图。</p>");
  }

  function openPage(pageId) {
    const pages = state.pages || [];
    const index = pages.findIndex((page) => page.page === pageId);
    if (index < 0) return;
    state.currentPageIndex = index;
    updatePageViewer();
    const viewer = $("#pageViewer");
    viewer.hidden = false;
    document.body.classList.add("page-viewer-open");
  }

  function closePageViewer() {
    const viewer = $("#pageViewer");
    if (!viewer) return;
    viewer.hidden = true;
    document.body.classList.remove("page-viewer-open");
  }

  function movePage(delta) {
    const pages = state.pages || [];
    if (!pages.length) return;
    state.currentPageIndex = Math.max(
      0,
      Math.min(pages.length - 1, state.currentPageIndex + delta),
    );
    updatePageViewer();
  }

  function renderNotesView() {
    const tabs = $$("#notesTabs [data-notes-tab]");
    tabs.forEach((tab) =>
      tab.classList.toggle("active", tab.getAttribute("data-notes-tab") === state.notesTab),
    );
    const content = $("#notesContent");
    if (!content) return;
    content.className = "notes-content " + state.notesTab;
    if (state.notesTab === "horizontal") {
      const cards = state.notesHorizontal || [];
      content.innerHTML =
        cards
          .map(
            (card) =>
              '<article class="note-compare-card"><h3>' +
              escapeHtml(card.title || "横向对比") +
              '</h3><div class="note-compare-head"><span>' +
              escapeHtml(card.leftLabel || "A") +
              "</span><span>" +
              escapeHtml(card.rightLabel || "B") +
              "</span></div>" +
              (card.rows || [])
                .map(
                  (row) =>
                    '<div class="note-compare-row"><span class="note-dim">' +
                    escapeHtml(row.dimension || "") +
                    "</span><span>" +
                    escapeHtml(row.left || "") +
                    "</span><span>" +
                    escapeHtml(row.right || "") +
                    "</span></div>",
                )
                .join("") +
              (card.takeaway
                ? '<p class="note-takeaway">记忆提示：' + escapeHtml(card.takeaway) + "</p>"
                : "") +
              "</article>",
          )
          .join("") || '<div class="empty">暂无笔记横向对比。</div>';
      return;
    }
    if (state.notesTab === "vertical") {
      const cards = state.notesVertical || [];
      content.innerHTML =
        cards
          .map(
            (card) =>
              '<article class="note-timeline-card"><h3>' +
              escapeHtml(card.title || "纵向链条") +
              '</h3><div class="timeline">' +
              (card.nodes || [])
                .map(
                  (node) =>
                    '<div class="timeline-node"><strong>' +
                    escapeHtml(node.label || "") +
                    "</strong><p>" +
                    escapeHtml(node.detail || "") +
                    "</p></div>",
                )
                .join("") +
              "</div></article>",
          )
          .join("") || '<div class="empty">暂无笔记纵向链条。</div>';
      return;
    }
    const knowledge = state.notesKnowledge || [];
    content.innerHTML =
      knowledge
        .map((item) => {
          const related = (item.relatedPoints || [])
            .map((id) => state.pointsById.get(id))
            .filter(Boolean);
          return (
            '<article class="note-kp-card"><div class="note-kp-head"><span class="pill">' +
            escapeHtml(item.module || "") +
            '</span><span class="note-kp-count">' +
            (item.noteQuotes || []).length +
            " 条笔记</span></div><h3>" +
            escapeHtml(item.title || "") +
            '</h3><p class="note-kp-oneline">' +
            escapeHtml(item.oneLine || "") +
            '</p><details class="note-kp-detail"><summary>展开解释与笔记原文</summary><p>' +
            escapeHtml(item.detail || "") +
            "</p>" +
            (item.noteQuotes || [])
              .map((quote) => '<blockquote class="note-quote">“' + escapeHtml(quote) + "”</blockquote>")
              .join("") +
            "</details>" +
            '<div class="note-kp-actions">' +
            (related.length
              ? related
                  .map(
                    (point) =>
                      '<button class="btn small ghost" type="button" data-point="' +
                      escapeHtml(point.id) +
                      '">' +
                      escapeHtml(point.module + "·" + point.title) +
                      "</button>",
                  )
                  .join("")
              : "") +
            (item.pages && item.pages.length
              ? '<span class="pill">' + item.pages.map(escapeHtml).join(" · ") + "</span>"
              : "") +
            "</div></article>"
          );
        })
        .join("") || '<div class="empty">暂无笔记知识点。</div>';
  }

  function renderStatsNotes() {
    const stats = state.questionStats;
    if (!stats) return;
    const notes = stats.notes || [];
    const modules = ["all", ...Array.from(new Set(notes.map((note) => note.module).filter(Boolean)))];
    $("#statsNoteChips").innerHTML = modules
      .map(
        (name) =>
          '<button class="chip' +
          (state.statsNoteModule === name ? " active" : "") +
          '" type="button" data-stats-note-module="' +
          escapeHtml(name) +
          '">' +
          (name === "all" ? "全部" : escapeHtml(name)) +
          "</button>",
      )
      .join("");
    const filtered = notes.filter(
      (note) => state.statsNoteModule === "all" || note.module === state.statsNoteModule,
    );
    $("#statsNotesCount").textContent = filtered.length + " 条";
    $("#statsNotesList").innerHTML =
      filtered
        .map(
          (note) =>
            '<div class="note-card"><div class="note-head"><span>' +
            escapeHtml(note.module || "未分类") +
            " · " +
            escapeHtml(note.page || "") +
            (note.question ? " 第 " + escapeHtml(note.question) + " 题" : "") +
            "</span><span>" +
            escapeHtml(note.source || "") +
            "</span></div>" +
            '<p class="note-text">“' +
            escapeHtml(note.note || "") +
            "”</p>" +
            (note.meaning
              ? '<p class="note-meaning">' + escapeHtml(note.meaning) + "</p>"
              : "") +
            "</div>",
        )
        .join("") || '<div class="empty">暂无题边笔记。</div>';
  }

  function renderStats() {
    const stats = state.questionStats;
    if (!stats) {
      $("#statsHero").innerHTML = '<div class="empty">题库统计尚未生成。</div>';
      return;
    }
    const typeTotal = (stats.singleChoice || 0) + (stats.multipleChoice || 0);
    const bankTotal = (state.questions || []).length || stats.totalQuestions || 0;
    const cards = [
      ["题目记录", bankTotal, "逐页计数约 " + (stats.totalQuestions || 0)],
      ["已拆分题型", typeTotal, "单选 " + (stats.singleChoice || 0) + " · 多选 " + (stats.multipleChoice || 0)],
      ["题边笔记", stats.totalNotes || 0, "含错题旁注"],
      ["明确错题", stats.totalWrongQuestions || 0, "有批改证据"],
      ["照片知识点", stats.totalPhotoKnowledgePoints || 0, "逐页提取"],
    ];
    $("#statsHero").innerHTML = cards
      .map(
        ([label, value, note], index) =>
          '<div class="stat-card' +
          (index === 0 ? " accent" : "") +
          '"><span class="stat-value">' +
          escapeHtml(value) +
          '</span><span class="stat-label">' +
          escapeHtml(label) +
          '</span><span class="stat-note">' +
          escapeHtml(note) +
          "</span></div>",
      )
      .join("");
    const byModule = stats.byModule || [];
    const maxModule = Math.max(1, ...byModule.map((item) => item.questions || 0));
    $("#statsModuleBars").innerHTML = byModule
      .map((item) => {
        const width = Math.round(((item.questions || 0) / maxModule) * 100);
        return (
          '<div class="bar-row"><span class="bar-label">' +
          escapeHtml(item.module) +
          '</span><div class="bar-track"><div class="bar-fill" style="width:' +
          width +
          "%;--module-color:" +
          moduleColor(item.module) +
          '"></div></div><span class="bar-value">' +
          (item.questions || 0) +
          "</span></div>"
        );
      })
      .join("");
    $("#statsType").innerHTML =
      '<div class="stats-type-item"><strong>' +
      (stats.singleChoice || 0) +
      "</strong><span>单选（已拆分页）</span></div>" +
      '<div class="stats-type-item"><strong>' +
      (stats.multipleChoice || 0) +
      "</strong><span>多选（已拆分页）</span></div>" +
      '<p class="stats-type-note">' +
      escapeHtml(stats.method || "") +
      "</p>" +
      '<p class="stats-type-note">覆盖 ' +
      (stats.pages || 0) +
      " 页；补齐 " +
      (stats.filledPages || 0) +
      " 页；错题 " +
      (stats.totalWrongQuestions || 0) +
      " 道；照片知识点 " +
      (stats.totalPhotoKnowledgePoints || 0) +
      " 条。</p>";
    const topics = (stats.topicFrequency || []).slice(0, 50);
    $("#statsTopicCount").textContent =
      topics.length + " / " + (stats.topicFrequency || []).length;
    $("#statsTopicTable").querySelector("tbody").innerHTML =
      topics
        .map(
          (row, index) =>
            "<tr><td>" +
            (index + 1) +
            '</td><td class="cell-title">' +
            escapeHtml(row.topic && String(row.topic).startsWith("考点") ? row.module + "·" + row.topic : row.topic) +
            "</td><td>" +
            escapeHtml(row.module) +
            "</td><td>" +
            (row.count || 0) +
            "</td><td>" +
            (row.wrongCount || 0) +
            "</td><td>" +
            pct(row.errorRate) +
            "</td></tr>",
        )
        .join("") || '<tr><td colspan="6">暂无考点频次数据。</td></tr>';
    const pages = stats.pageStats || [];
    $("#statsPageTable").querySelector("tbody").innerHTML =
      pages
        .map(
          (page) =>
            '<tr class="page-row" data-page="' +
            escapeHtml(page.page) +
            '"><td>' +
            escapeHtml(page.page) +
            "</td><td>" +
            escapeHtml(page.module) +
            '</td><td class="cell-reason">' +
            escapeHtml(page.section || "") +
            "</td><td>" +
            (page.questionCount || 0) +
            "</td><td>" +
            (page.notesCount || 0) +
            "</td><td>" +
            (page.wrongCount || 0) +
            "</td><td>" +
            (page.source === "fill" ? "补齐" : "逐页") +
            "</td></tr>",
        )
        .join("") || '<tr><td colspan="7">暂无逐页统计。</td></tr>';
    renderStatsNotes();
  }

  function renderCompare() {
    const chips = ["all", ...state.modules.map((module) => module.module)];
    $("#compareChips").innerHTML = chips
      .map(
        (name) =>
          '<button class="chip' +
          (state.compareModule === name ? " active" : "") +
          '" type="button" data-compare-module="' +
          escapeHtml(name) +
          '">' +
          (name === "all" ? "全部" : escapeHtml(name)) +
          "</button>",
      )
      .join("");
    const horizontal = (state.comparisons.horizontal || []).filter(
      (card) => state.compareModule === "all" || card.module === state.compareModule,
    );
    const vertical = (state.comparisons.vertical || []).filter(
      (card) => state.compareModule === "all" || card.module === state.compareModule,
    );
    $("#compareCount").textContent =
      horizontal.length + " 组横向 · " + vertical.length + " 条纵向";
    $("#horizontalList").innerHTML =
      horizontal
        .map((card) => {
          const columns = card.columns || [];
          const rows = card.rows || [];
          return (
            '<article class="compare-card"><h4>' +
            escapeHtml(card.title || "易混对照") +
            '</h4><div class="compare-table-wrap"><table class="compare-table"><thead><tr>' +
            columns.map((column) => "<th>" + escapeHtml(column) + "</th>").join("") +
            "</tr></thead><tbody>" +
            rows
              .map(
                (row) =>
                  "<tr>" + row.map((cell) => "<td>" + escapeHtml(cell) + "</td>").join("") + "</tr>",
              )
              .join("") +
            "</tbody></table></div>" +
            (card.trap
              ? '<p class="compare-trap">记忆提示：' + escapeHtml(card.trap) + "</p>"
              : "") +
            "</article>"
          );
        })
        .join("") || '<div class="empty">这个模块暂无横向对比。</div>';
    $("#verticalList").innerHTML =
      vertical
        .map(
          (card) =>
            '<article class="timeline-card"><h4>' +
            escapeHtml(card.title || "知识链条") +
            '</h4><div class="timeline">' +
            (card.nodes || [])
              .map(
                (node) =>
                  '<div class="timeline-node"><strong>' +
                  escapeHtml(node.title || "") +
                  "</strong><p>" +
                  escapeHtml(node.detail || "") +
                  "</p></div>",
              )
              .join("") +
            "</div></article>",
        )
        .join("") || '<div class="empty">这个模块暂无纵向链条。</div>';
    const notes = state.wrongQuestions.filter(
      (question) =>
        (question.note || question.noteMeaning) &&
        (state.compareModule === "all" || question.module === state.compareModule),
    );
    $("#notesCount").textContent = notes.length + " 条";
    $("#notesList").innerHTML =
      notes
        .map((question) => {
          const point =
            (question.pointId && state.pointsById.get(question.pointId)) ||
            findPointByQuiz({
              module: question.module,
              title: question.quizTopic || question.topic,
            });
          const displayNumber = question.actualNumber || question.number || "—";
          return (
            '<div class="note-card"><div class="note-head"><span>' +
            escapeHtml(question.module || "未分类") +
            " · " +
            escapeHtml(question.page || "") +
            " 第 " +
            escapeHtml(displayNumber) +
            " 题</span><span>" +
            escapeHtml(question.judgeConfidence || question.confidence || "") +
            "</span></div>" +
            '<p class="note-text">“' +
            escapeHtml(question.note || "") +
            "”</p>" +
            (question.noteMeaning
              ? '<p class="note-meaning">' + escapeHtml(question.noteMeaning) + "</p>"
              : "") +
            (point
              ? '<button class="btn small ghost" type="button" data-point="' +
                escapeHtml(point.id) +
                '" style="margin-top:8px">查看考点</button>'
              : "") +
            "</div>"
          );
        })
        .join("") || '<div class="empty">暂无题边旁注。</div>';
  }

  function renderDeep() {
    const chips = ["all", ...state.modules.map((module) => module.module)];
    $("#deepChips").innerHTML = chips
      .map(
        (name) =>
          '<button class="chip' +
          (state.deepModule === name ? " active" : "") +
          '" type="button" data-deep-module="' +
          escapeHtml(name) +
          '">' +
          (name === "all" ? "全部" : escapeHtml(name)) +
          "</button>",
      )
      .join("");
    const cards = [];
    state.modules.forEach((module) => {
      if (state.deepModule !== "all" && module.module !== state.deepModule) return;
      (module.weakCards || []).forEach((card) => {
        cards.push({ ...card, module: module.module });
      });
    });
    cards.sort((a, b) => (b.severity || 0) - (a.severity || 0));
    $("#deepCount").textContent = cards.length + " 张";
    if (!cards.length) {
      $("#deepList").innerHTML = '<div class="empty">暂无深度错点卡。运行工作流生成模块考点卡后，这里会自动出现。</div>';
      return;
    }
    $("#deepList").innerHTML = cards
      .map((card) => {
        const severity = card.severity >= 2 ? "high" : card.severity >= 1 ? "medium" : "low";
        const severityLabel = card.severity >= 2 ? "最优先" : card.severity >= 1 ? "优先" : "关注";
        return (
          '<article class="deep-card">' +
          '<div class="deep-head"><span class="pill">' +
          escapeHtml(card.module) +
          '</span><span class="severity ' +
          severity +
          '">' +
          severityLabel +
          "</span></div>" +
          "<h3>" +
          escapeHtml((card.module ? card.module + "·" : "") + (card.title || "未命名错点")) +
          "</h3>" +
          '<div class="deep-section"><span class="deep-label">为什么反复错</span><p>' +
          escapeHtml(card.whyWrong || "暂无分析。") +
          "</p></div>" +
          '<div class="deep-section"><span class="deep-label">正确逻辑</span><p>' +
          escapeHtml(card.correctLogic || "暂无分析。") +
          "</p></div>" +
          '<div class="deep-section"><span class="deep-label">最容易混淆</span><p>' +
          escapeHtml(card.contrast || "暂无分析。") +
          "</p></div>" +
          (card.memoryHook
            ? '<div class="deep-section"><span class="deep-label">记忆钩子</span><p>' + escapeHtml(card.memoryHook) + "</p></div>"
            : "") +
          (card.evidence && card.evidence.length
            ? '<p class="deep-evidence">证据：' + card.evidence.map(escapeHtml).join(" · ") + "</p>"
            : "") +
          '<div class="deep-actions">' +
          (state.pointsById.get(card.id)
            ? '<button class="btn small ghost" type="button" data-point="' + escapeHtml(card.id) + '">打开考点</button>'
            : "") +
          "</div></article>"
        );
      })
      .join("");
  }

  function renderRanking() {
    drawQuadrant($("#quadrantLarge"), state.points, true);
    const rows = allSortedPoints().slice(0, 50);
    const highFreqMap = new Map();
    state.modules.forEach((module) => {
      (module.highFrequency || []).forEach((item) => {
        highFreqMap.set(String(item.title || ""), item);
      });
    });
    $("#rankingTable").querySelector("tbody").innerHTML = rows
      .map((point, index) => {
        const sev = severityForPoint(point);
        const high = highFreqMap.get(point.title) || highFreqMap.get(point.quizTitle);
        const reason =
          (high && high.reason) ||
          (point.status === "persistent_weak"
            ? "两轮测验都是 0%，属于持续薄弱，优先补概念和辨析。"
            : point.quiz && point.quiz.multiWrong
              ? "累计至少 2 题未全对，说明不是偶然失误。"
              : "错误率较高，建议结合易错点再复习一遍。");
        return (
          "<tr>" +
          '<td class="cell-title"><span class="rank-badge' +
          (index < 3 ? " top" : "") +
          '">' +
          (index + 1) +
          "</span>" +
          '<button class="link-btn" type="button" data-point="' +
          escapeHtml(point.id) +
          '">' +
          escapeHtml(pointLabel(point)) +
          "</button></td>" +
          "<td>" +
          escapeHtml(point.module) +
          "</td>" +
          "<td>" +
          (point.frequency || 1) +
          "/5</td>" +
          "<td>" +
          pct(point.errorRate) +
          "</td>" +
          "<td>" +
          statusBadge(point.status) +
          "</td>" +
          '<td class="cell-reason">' +
          escapeHtml(reason) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderCards() {
    const scopes = [
      ["weak", "弱项优先"],
      ["persistent", "持续薄弱"],
      ["all", "全部考点"],
      ["unmastered", "未掌握"],
    ];
    $("#cardChips").innerHTML = scopes
      .map(
        ([key, label]) =>
          '<button class="chip' +
          (state.cardScope === key ? " active" : "") +
          '" type="button" data-card-scope="' +
          key +
          '">' +
          label +
          "</button>",
      )
      .join("");
    let pool = state.points;
    if (state.cardScope === "weak") pool = weakPoints();
    if (state.cardScope === "persistent") pool = weakPoints().filter((point) => point.status === "persistent_weak");
    if (state.cardScope === "unmastered") pool = state.points.filter((point) => !isMastered(point));
    state.cardPool = pool;
    if (state.cardIndex >= pool.length) state.cardIndex = 0;
    const point = pool[state.cardIndex];
    const card = $("#flashcard");
    card.classList.toggle("flipped", state.cardFlipped);
    if (!point) {
      $("#cardKicker").textContent = "抽认卡";
      $("#cardFrontTitle").textContent = "这个范围暂时没有卡片";
      $("#cardFrontPrompt").textContent = "换个范围试试。";
      $("#cardBackTitle").textContent = "—";
      $("#cardBackBody").innerHTML = "";
      $("#cardProgress").textContent = "0 / 0";
      return;
    }
    const masteredCount = pool.filter((item) => isMastered(item)).length;
    $("#cardKicker").textContent = point.module + " · " + (point.unitName || "考点");
    $("#cardFrontTitle").textContent = pointLabel(point);
    $("#cardFrontPrompt").textContent = "先自己回答：它考什么？最容易错在哪里？点击翻面核对。";
    $("#cardBackTitle").textContent = pointLabel(point);
    $("#cardBackBody").innerHTML =
      '<div class="flashcard-back-section"><h4>一句话</h4><p>' +
      escapeHtml(point.summary || point.detail || "暂无摘要") +
      "</p></div>" +
      (point.keyPoints && point.keyPoints.length
        ? '<div class="flashcard-back-section"><h4>关键点</h4><ul>' +
          point.keyPoints.map((item) => "<li>" + escapeHtml(item) + "</li>").join("") +
          "</ul></div>"
        : "") +
      (point.traps && point.traps.length
        ? '<div class="flashcard-back-section"><h4>易错提醒</h4><ul>' +
          point.traps.map((item) => "<li>" + escapeHtml(item) + "</li>").join("") +
          "</ul></div>"
        : "") +
      '<div class="flashcard-back-section"><h4>状态</h4><p>' +
      escapeHtml(STATUS_LABELS[point.status] || "拓展") +
      " · 错误率 " +
      pct(point.errorRate) +
      " · 考频 " +
      (point.frequency || 1) +
      "/5</p></div>";
    $("#cardProgress").textContent = "第 " + (state.cardIndex + 1) + " / " + pool.length + " 张 · 已掌握 " + masteredCount;
  }

  function openPoint(pointId) {
    const point = state.pointsById.get(pointId);
    if (!point) return;
    closeQuestionViewer();
    state.currentPointId = pointId;
    const quiz = point.quiz;
    const relatedWrong = state.wrongQuestions.filter(
      (question) =>
        question.markedWrong &&
        (question.pointId === point.id ||
          question.quizTopic === point.quizTitle ||
          question.topic === point.title ||
          question.quizTopic === point.title),
    );
    const relatedNotes = state.wrongQuestions.filter(
      (question) =>
        (question.note || question.noteMeaning) &&
        (question.pointId === point.id ||
          question.quizTopic === point.quizTitle ||
          question.topic === point.title ||
          question.quizTopic === point.title),
    );
    const relatedQuestions = (state.pointQuestions[point.id] || [])
      .map((questionId) => state.questionsById.get(questionId))
      .filter(Boolean)
      .slice(0, 8);
    const detailSentences = String(point.detail || "")
      .split(/[。；]/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 8);
    const keyPointsHtml = (point.keyPoints || [])
      .map((item, index) => {
        const sentence = bestDetailSentence(point, item);
        const example = bestQuestionForText(item, relatedQuestions);
        const trap = (point.traps || []).find((entry) => gramOverlap(entry, item) > 0.15);
        return (
          '<details class="kp-detail"><summary><span class="kp-index">' +
          (index + 1) +
          "</span>" +
          escapeHtml(item) +
          '</summary><div class="kp-body"><p><strong>详细说明：</strong>' +
          escapeHtml(sentence) +
          "</p><p><strong>怎么考：</strong>" +
          (example
            ? escapeHtml(example.stem || "")
            : "常作为选择题的判断题眼；先定位关键词，再排除绝对化、张冠李戴的表述。") +
          "</p>" +
          (trap ? '<p class="kp-trap"><strong>易错提醒：</strong>' + escapeHtml(trap) + "</p>" : "") +
          (example
            ? '<p class="kp-example"><strong>题目例证：</strong>' +
              escapeHtml(example.page + " 第 " + example.number + " 题") +
              ' <button class="btn small ghost" type="button" data-question="' +
              escapeHtml(example.id) +
              '">查看这道题</button></p>'
            : "") +
          "</div></details>"
        );
      })
      .join("");
    const trapsHtml = (point.traps || [])
      .map((item, index) => {
        const example =
          bestQuestionForText(item, relatedQuestions.filter((question) => question.isWrong)) ||
          bestQuestionForText(item, relatedQuestions);
        const matched = bestDetailSentence(point, item);
        const relatedKey = (point.keyPoints || []).find(
          (keyPoint) => gramOverlap(keyPoint, item) > 0.15,
        );
        return (
          '<details class="trap-detail"><summary>' +
          escapeHtml(item) +
          '</summary><div class="trap-body"><p><strong>易错点：</strong>' +
          escapeHtml(item) +
          '</p><p><strong>正确理解：</strong>' +
          escapeHtml(point.summary || "") +
          "</p>" +
          (gramOverlap(matched, item) >= 0.2
            ? '<p><strong>补充说明：</strong>' + escapeHtml(matched) + "</p>"
            : "") +
          (relatedKey
            ? '<p><strong>对应关键点：</strong>' + escapeHtml(relatedKey) + "</p>"
            : "") +
          (example
            ? '<p class="trap-example"><strong>对应题目：</strong>' +
              escapeHtml(example.page + " 第 " + example.number + " 题 · " + (example.stem || "")) +
              ' <button class="btn small ghost" type="button" data-question="' +
              escapeHtml(example.id) +
              '">查看这道题</button></p>'
            : "") +
          "</div></details>"
        );
      })
      .join("");
    const mappedExamples = (point.examples || [])
      .map((example) => ({ example: example, question: findQuestionByExample(example) }))
      .filter((entry) => entry.question);
    const typicalHtml =
      (mappedExamples.length
        ? mappedExamples
            .map(
              (entry) =>
                '<button class="page-question-item" type="button" data-question="' +
                escapeHtml(entry.question.id) +
                '"><strong>' +
                escapeHtml(entry.example) +
                "</strong><br><span>" +
                escapeHtml(entry.question.page) +
                " 第 " +
                escapeHtml(entry.question.number) +
                " 题 · " +
                escapeHtml(entry.question.topic || "") +
                "</span></button>",
            )
            .join("")
        : relatedQuestions
            .slice(0, 4)
            .map(
              (question) =>
                '<button class="page-question-item" type="button" data-question="' +
                escapeHtml(question.id) +
                '"><strong>第 ' +
                escapeHtml(question.number) +
                " 题</strong> · " +
                escapeHtml(question.type || "") +
                " · " +
                escapeHtml(question.topic || "") +
                "<br><span>" +
                escapeHtml((question.stem || "").slice(0, 80)) +
                "</span></button>",
            )
            .join("")) || '<p class="drawer-sources">暂无典型问法。</p>';
    const navItems = [["drawer-summary", "总览"]];
    if (point.detail) navItems.push(["drawer-detail", "讲解"]);
    if (keyPointsHtml) navItems.push(["drawer-keypoints", "关键点"]);
    if (trapsHtml) navItems.push(["drawer-traps", "易错提醒"]);
    if (typicalHtml) navItems.push(["drawer-examples", "典型问法"]);
    if (relatedQuestions.length) navItems.push(["drawer-related", "相关题目"]);
    navItems.push(["drawer-sources", "来源"]);
    const drawerNav =
      '<div class="drawer-nav">' +
      navItems
        .map(
          ([id, label]) =>
            '<button type="button" data-scroll="' + id + '">' + label + "</button>",
        )
        .join("") +
      "</div>";
    $("#drawerModule").textContent = point.module + " · " + (point.unitName || "考点");
    $("#drawerContent").innerHTML =
      '<h2 id="drawerTitle">' +
      escapeHtml(pointLabel(point)) +
      "</h2>" +
      '<div class="drawer-meta">' +
      statusBadge(point.status) +
      '<span class="pill">考频 ' +
      (point.frequency || 1) +
      "/5</span>" +
      '<span class="pill">错误率 ' +
      pct(point.errorRate) +
      "</span>" +
      (quiz && quiz.total ? '<span class="pill">测验 ' + quiz.correct + "/" + quiz.total + "</span>" : "") +
      "</div>" +
      drawerNav +
      '<p id="drawer-summary" class="drawer-summary">' +
      escapeHtml(point.summary || "") +
      "</p>" +
      (point.detail
        ? '<h4 id="drawer-detail">完整讲解</h4><details class="drawer-detail-box"><summary>展开完整讲解</summary><p>' +
          escapeHtml(point.detail) +
          "</p></details>"
        : "") +
      (keyPointsHtml ? '<h4 id="drawer-keypoints">关键点</h4>' + keyPointsHtml : "") +
      (trapsHtml ? '<h4 id="drawer-traps">易错提醒</h4>' + trapsHtml : "") +
      (typicalHtml
        ? '<h4 id="drawer-examples">典型问法</h4><div class="related-questions">' + typicalHtml + "</div>"
        : "") +
      (relatedQuestions.length
        ? "<h4 id=\"drawer-related\">相关题目</h4><div class=\"related-questions\">" +
          relatedQuestions
            .map(
              (question) =>
                '<button class="page-question-item" type="button" data-question="' +
                escapeHtml(question.id) +
                '"><strong>第 ' +
                escapeHtml(question.number) +
                " 题</strong> · " +
                escapeHtml(question.type || "") +
                " · " +
                escapeHtml(question.topic || "") +
                "<br><span>" +
                escapeHtml((question.stem || "").slice(0, 80)) +
                "</span></button>",
            )
            .join("") +
          "</div>"
        : "<h4>相关题目</h4><p class=\"drawer-sources\">暂无自动关联题目。</p>") +
      (relatedWrong.length
        ? "<h4>照片中的错题</h4><ul>" +
          relatedWrong
            .map(
              (question) =>
                "<li>第 " +
                escapeHtml(question.number) +
                " 题（" +
                escapeHtml(question.page) +
                "）：" +
                escapeHtml(question.stem || "") +
                " · 学生答案 " +
                escapeHtml(question.studentAnswer || "未标记") +
                " · 推断答案 " +
                escapeHtml(question.correctAnswer || "见解析") +
                "</li>",
            )
            .join("") +
          "</ul>"
        : "") +
      (relatedNotes.length
        ? "<h4>照片旁注</h4><ul>" +
          relatedNotes
            .map(
              (question) =>
                "<li>“" +
                escapeHtml(question.note || "") +
                "”" +
                (question.noteMeaning ? "——" + escapeHtml(question.noteMeaning) : "") +
                "（" +
                escapeHtml(question.page || "") +
                "）</li>",
            )
            .join("") +
          "</ul>"
        : "") +
      (point.sources && point.sources.length
        ? '<h4 id="drawer-sources">来源</h4><p class="drawer-sources">' + point.sources.map(escapeHtml).join(" · ") + "</p>"
        : "") +
      '<div class="drawer-actions">' +
      '<button class="btn primary" type="button" data-progress="mastered">标记掌握</button>' +
      '<button class="btn ghost" type="button" data-progress="learning">标记一般</button>' +
      '<button class="btn ghost" type="button" data-progress="again">标记不熟</button>' +
      "</div>";
    $("#detailDrawer").classList.add("open");
    $("#detailDrawer").setAttribute("aria-hidden", "false");
    $("#drawerBackdrop").hidden = false;
    document.body.classList.add("drawer-open");
    $("#drawerContent").querySelectorAll("[data-progress]").forEach((button) => {
      button.addEventListener("click", () => {
        const status = button.getAttribute("data-progress") === "again" ? "learning" : button.getAttribute("data-progress");
        setProgress(point.id, status);
      });
    });
  }

  function closeDrawer() {
    $("#detailDrawer").classList.remove("open");
    $("#detailDrawer").setAttribute("aria-hidden", "true");
    $("#drawerBackdrop").hidden = true;
    document.body.classList.remove("drawer-open");
    state.currentPointId = null;
  }

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_THEME, theme);
    } catch {
      /* ignore */
    }
  }

  function initTheme() {
    let theme = "light";
    try {
      theme = localStorage.getItem(STORAGE_THEME) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } catch {
      theme = "light";
    }
    setTheme(theme);
  }

  function route() {
    const raw = (location.hash || "#/overview").replace(/^#\/?/, "");
    const [tab, queryString] = raw.split("?");
    const valid = ["overview", "notes", "stats", "pages", "bank", "tree", "deep", "wrong", "ranking", "compare", "cards", "method", "more"];
    const active = valid.includes(tab) ? tab : "overview";
    $$(".view").forEach((view) => view.classList.toggle("active", view.id === "view-" + active));
    const activeTab = ["overview", "notes", "tree", "bank", "wrong"].includes(active)
      ? active
      : "more";
    $$("#tabs a, #bottomNav a").forEach((link) =>
      link.classList.toggle("active", link.getAttribute("data-tab") === activeTab),
    );
    if (active === "tree") {
      const params = new URLSearchParams(queryString || "");
      const module = params.get("module");
      if (module && state.modules.some((item) => item.module === module)) {
        state.activeModule = module;
      }
      renderTree();
    }
    if (active === "deep") renderDeep();
    if (active === "notes") renderNotesView();
    if (active === "stats") renderStats();
    if (active === "pages") renderPages();
    if (active === "bank") renderBank();
    if (active === "compare") renderCompare();
    if (active === "ranking") renderRanking();
    if (active === "cards") renderCards();
    window.scrollTo({ top: 0, behavior: "smooth" });
    closeDrawer();
  }

  function bindEvents() {
    window.addEventListener("hashchange", route);
    $("#themeToggle").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      setTheme(next);
    });
    const printBtn = $("#printBtn");
    if (printBtn) printBtn.addEventListener("click", () => window.print());
    $("#drawerClose").addEventListener("click", closeDrawer);
    $("#drawerBackdrop").addEventListener("click", closeDrawer);
    $("#pageViewerClose").addEventListener("click", closePageViewer);
    $("#qClose").addEventListener("click", closeQuestionViewer);
    $("#qPrev").addEventListener("click", () => moveQuestion(-1));
    $("#qNext").addEventListener("click", () => moveQuestion(1));
    $("#qPage").addEventListener("click", () => {
      const question = state.questionsById.get(state.currentQuestionId);
      if (question) {
        closeQuestionViewer();
        openPage(question.page);
      }
    });
    $("#questionViewer").addEventListener("click", (event) => {
      if (event.target === $("#questionViewer")) closeQuestionViewer();
    });
    $("#pagePrev").addEventListener("click", () => movePage(-1));
    $("#pageNext").addEventListener("click", () => movePage(1));
    $("#pageViewer").addEventListener("click", (event) => {
      if (event.target === $("#pageViewer")) closePageViewer();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeDrawer();
        closePageViewer();
        closeQuestionViewer();
      }
      if (!$("#questionViewer").hidden) {
        if (event.key === "ArrowLeft") moveQuestion(-1);
        if (event.key === "ArrowRight") moveQuestion(1);
      }
      if (!$("#pageViewer").hidden) {
        if (event.key === "ArrowLeft") movePage(-1);
        if (event.key === "ArrowRight") movePage(1);
      }
    });
    window.addEventListener("scroll", () => {
      $(".site-header").classList.toggle("scrolled", window.scrollY > 8);
    });
    document.addEventListener("click", (event) => {
      const notesTab = event.target.closest("[data-notes-tab]");
      if (notesTab) {
        state.notesTab = notesTab.getAttribute("data-notes-tab");
        renderNotesView();
        return;
      }
      const scrollButton = event.target.closest("[data-scroll]");
      if (scrollButton) {
        const target = document.getElementById(scrollButton.getAttribute("data-scroll"));
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const questionButton = event.target.closest("[data-question]");
      if (questionButton) {
        openQuestion(questionButton.getAttribute("data-question"));
        return;
      }
      const bookChip = event.target.closest("[data-bank-book]");
      if (bookChip) {
        state.bankBook = bookChip.getAttribute("data-bank-book");
        state.bankLimit = 30;
        renderBank();
        return;
      }
      const bankChip = event.target.closest("[data-bank-module]");
      if (bankChip) {
        state.bankModule = bankChip.getAttribute("data-bank-module");
        state.bankLimit = 30;
        renderBank();
        return;
      }
      if (event.target.closest("[data-bank-more]")) {
        state.bankLimit += 30;
        renderBank();
        return;
      }
      const pageChip = event.target.closest("[data-page-filter]");
      if (pageChip) {
        state.pageFilter = pageChip.getAttribute("data-page-filter");
        renderPages();
        return;
      }
      const pageButton = event.target.closest("[data-page]");
      if (pageButton) {
        openPage(pageButton.getAttribute("data-page"));
        return;
      }
      const pointButton = event.target.closest("[data-point]");
      if (pointButton) {
        openPoint(pointButton.getAttribute("data-point"));
        return;
      }
      const moduleChip = event.target.closest("[data-module]");
      if (moduleChip) {
        state.activeModule = moduleChip.getAttribute("data-module");
        renderTree();
        return;
      }
      if (event.target.closest("[data-tree-weak]")) {
        state.treeWeakOnly = !state.treeWeakOnly;
        renderTree();
        return;
      }
      const wrongChip = event.target.closest("[data-wrong-module]");
      if (wrongChip) {
        state.wrongModule = wrongChip.getAttribute("data-wrong-module");
        renderWrong();
        return;
      }
      const deepChip = event.target.closest("[data-deep-module]");
      if (deepChip) {
        state.deepModule = deepChip.getAttribute("data-deep-module");
        renderDeep();
        return;
      }
      const compareChip = event.target.closest("[data-compare-module]");
      if (compareChip) {
        state.compareModule = compareChip.getAttribute("data-compare-module");
        renderCompare();
        return;
      }
      const statsNoteChip = event.target.closest("[data-stats-note-module]");
      if (statsNoteChip) {
        state.statsNoteModule = statsNoteChip.getAttribute("data-stats-note-module");
        renderStatsNotes();
        return;
      }
      const cardChip = event.target.closest("[data-card-scope]");
      if (cardChip) {
        state.cardScope = cardChip.getAttribute("data-card-scope");
        state.cardIndex = 0;
        state.cardFlipped = false;
        renderCards();
        return;
      }
      const grade = event.target.closest("[data-grade]");
      if (grade) {
        const point = state.cardPool[state.cardIndex];
        if (point) {
          const value = grade.getAttribute("data-grade");
          setProgress(point.id, value === "again" ? "learning" : value);
          state.cardIndex = (state.cardIndex + 1) % Math.max(1, state.cardPool.length);
          state.cardFlipped = false;
          renderCards();
        }
        return;
      }
      if (event.target.closest(".module-block-head")) {
        event.target.closest(".module-block").classList.toggle("open");
        return;
      }
      if (event.target.closest(".unit-head")) {
        event.target.closest(".unit").classList.toggle("open");
      }
    });
    $("#searchInput").addEventListener("input", (event) => {
      state.search = event.target.value;
      renderTree();
    });
    $("#bankSearch").addEventListener("input", (event) => {
      state.bankSearch = event.target.value;
      state.bankLimit = 30;
      renderBank();
    });
    $("#shuffleCards").addEventListener("click", () => {
      if (!state.cardPool.length) return;
      state.cardIndex = Math.floor(Math.random() * state.cardPool.length);
      state.cardFlipped = false;
      renderCards();
    });
    $("#flashcard").addEventListener("click", () => {
      state.cardFlipped = !state.cardFlipped;
      $("#flashcard").classList.toggle("flipped", state.cardFlipped);
    });
  }

  async function loadData() {
    $("main").insertAdjacentHTML("afterbegin", '<div class="loading" id="loading">正在加载知识库…</div>');
    try {
      const [knowledgeResponse, questionsResponse, notesResponse] = await Promise.all([
        fetch("data/knowledge.json", { cache: "no-store" }),
        fetch("data/questions.json", { cache: "no-store" }),
        fetch("data/notes_knowledge.json", { cache: "no-store" }),
      ]);
      if (!knowledgeResponse.ok) throw new Error("HTTP " + knowledgeResponse.status);
      const knowledge = await knowledgeResponse.json();
      let questions = { questions: [], byPoint: {} };
      if (questionsResponse.ok) {
        try {
          questions = await questionsResponse.json();
        } catch {
          questions = { questions: [], byPoint: {} };
        }
      }
      let notes = { knowledge: [], horizontal: [], vertical: [] };
      if (notesResponse.ok) {
        try {
          notes = await notesResponse.json();
        } catch {
          notes = { knowledge: [], horizontal: [], vertical: [] };
        }
      }
      return { knowledge, questions, notes };
    } finally {
      const loading = $("#loading");
      if (loading) loading.remove();
    }
  }

  async function init() {
    initTheme();
    bindEvents();
    try {
      const loaded = await loadData();
      const raw = loaded.knowledge;
      state.raw = raw;
      const normalized = normalizeData(raw);
      state.modules = normalized.modules;
      state.points = normalized.points;
      state.pointsById = new Map(state.points.map((point) => [point.id, point]));
      state.quizTopics = normalized.quizTopics;
      state.quizByKey = normalized.quizByKey;
      state.wrongQuestions = normalized.wrongQuestions;
      state.comparisons = raw.comparisons || { horizontal: [], vertical: [] };
      state.questionStats = raw.questionStats || null;
      state.notesKnowledge = loaded.notes.knowledge || [];
      state.notesHorizontal = loaded.notes.horizontal || [];
      state.notesVertical = loaded.notes.vertical || [];
      state.pages = raw.pages || [];
      state.questions = loaded.questions.questions || [];
      state.questionsById = new Map(
        state.questions.map((question) => [question.id, question]),
      );
      state.pointQuestions = loaded.questions.byPoint || {};
      renderAll();
      route();
    } catch (error) {
      $("main").innerHTML =
        '<div class="error-box"><strong>知识库还没生成</strong><br>请先运行 <code>python scripts/build_site_data.py</code>，' +
        "或检查 <code>data/knowledge.json</code> 是否存在。<br><small>" +
        escapeHtml(error.message) +
        "</small></div>";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
