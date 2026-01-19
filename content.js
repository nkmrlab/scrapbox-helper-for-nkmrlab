// content.js — Scrapbox Research Helper (FULL COMPLETE VERSION)
(() => {
  if (window.__SB_EXTENSION_RUNNING__) return;
  window.__SB_EXTENSION_RUNNING__ = true;

  const isExtensionAlive = () =>
    !!window.__SB_EXTENSION_RUNNING__;

  const TODO_PANEL_ID = '__sb_todo_panel__';
  const MAIN_PANEL_ID = '__sb_final_panel__';
  const MAIN_BODY_ID = '__sb_minutes_body__';
  const MAIN_TITLE_ID = '__sb_minutes_title__';
  const CALENDAR_ID = '__sb_calendar_panel__';
  const CALENDAR_GRID_CLASS = '__sb_calendar_grid__';

  const closedPanels = new Set();
  let currentProjectName = null;

  const settingsKey = projectName => `sb:${projectName}:settings`;
  const historyKey  = projectName => `sb:${projectName}:history`;

  /* ================= Style Registry ================= */

  const Styles = {
    panel: {
      base: `
        position:fixed;
        top:10px;
        right:10px;
        background:#fff;
        border:1px solid #ccc;
        box-shadow:0 2px 10px rgba(0,0,0,.25);
        z-index:99999;
        font:12px/1.5 sans-serif;
        overflow:auto;
        transition:opacity .2s;
      `,
      idle: `
        opacity:0.35;
      `,
      active: `
        opacity:1;
      `,
    },

    panelTodo: `
      right:520px;
      width:320px;
      max-height:60vh;
    `,

    panelCalendar: `
      width:33vw;
      max-width:560px;
      min-width:420px;
      height:66vh;
      display:flex;
      flex-direction:column;
    `,

    panelMain: `
      width:480px;
      max-height:560px;
    `,

    calendar: {
      header: `
        padding:6px;
        font-weight:bold;
        border-bottom:1px solid #ddd;
        background:#f5f5f5;
        display:flex;
        align-items:center;
        gap:8px;
      `,
      grid: `
        flex:1;
        padding:6px;
        display:grid;
        grid-template-columns:repeat(7,1fr);
        grid-template-rows:auto repeat(6,1fr);
        gap:2px;
      `
    },

    text: {
      panelTitle: `
        font-weight:bold;
        font-size:14px;
        margin-bottom:6px;
        cursor:pointer;
      `,

      sectionTitle: `
        font-weight:bold;
        margin:6px 0;
        cursor:pointer;
      `,

      subTitle: `
        font-weight:bold;
        margin-bottom:4px;
      `,

      item: `
        cursor:pointer;
        padding-left:6px;
      `,

      muted: `
        color:#666;
        font-size:11px;
      `
    },

    list: {
      ellipsis: `
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      `
    }
  };

  const applyStyle = (el, ...styles) => {
    el.style.cssText = styles.join('');
  };

  /* ================= 共通ユーティリティ ================= */
  const clearUI = () => {
    document.getElementById(CALENDAR_ID)?.remove();
    document.getElementById(MAIN_PANEL_ID)?.remove();
    document.getElementById(TODO_PANEL_ID)?.remove();
  };

  const jumpToLineId = id => {
    const a = document.createElement('a');
    a.href = '#' + id;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const normalizeLines = (rawLines, { withUid = false } = {}) => {
    return rawLines.map(l => {
      const line = {
        id: l.id,
        text: (l.text || '').trim()
      };
      if (withUid) {
        line.uid = l.userId || l.createdBy || l.updatedBy || 'unknown';
      }
      return line;
    });
  };

  const fetchPage = async (projectName, pageName) => {
    if (projectName === null) return null;
    const r = await fetch(
      `https://scrapbox.io/api/pages/${projectName}/${encodeURIComponent(pageName)}`
    );
    if (!r.ok) return null;
    return r.json();
  };

  const isPaperIntroPage = (lines) =>
    lines.some(line => (line.text || '').includes('#論文紹介'));

  const isContextBoundary = (text) => {
    if (!text) return true;                 // 空行
    if (/^\[\*+\s/.test(text)) return true; // 見出し ([*, [**, [***)
    return false;
  };

  const extractIconName = (text) => {
    const m = text.match(/^\[([^\]\/]+)\.icon\]/);
    return m ? m[1] : null;
  };

  const findAuthorAbove = (lines, fromIndex) => {
    for (let i = fromIndex - 1; i >= 0; i--) {
      const text = lines[i].text;

      if (isContextBoundary(text)) break;
      const name = extractIconName(text);
      if (name) return name;
    }
    return null;
  };

  const isTitleLine = (t) =>
    !!parseBracketTitle(t) ||
    /^タイトル\s*[:：『「]/.test(t);

  const cleanTitle = (t) => {
    const parsed = parseBracketTitle(t);
    if (parsed) return parsed;

    // fallback: タイトル: 系
    return t
      .replace(/^タイトル\s*[:：『「]\s*/, '')
      .replace(/[』」]\s*$/, '')
      .trim();
  };

  const isSessionStart = (t) => {
    const title = parseBracketTitle(t);
    return title && t.includes('(');
  };

  const parseBracketTitle = (text) => {
    if (!text.startsWith('[')) return null;

    // [装飾 + 空白 + 本文]
    const m = text.match(/^\[([\*\(\&]+)\s+(.+?)]$/);
    if (!m) return null;

    const decorators = m[1]; // "*", "**", "(", "*(", "(**", "&*", etc
    const title = m[2].trim();

    // ✕なのは「* が1個だけ」の場合のみ
    if (decorators === '*') return null;

    return title;
  };

  /* =================== 表示関係の共通関数 ====================== */
  const appendLink = (panelNode, label, pageName, prefix = '•') => {
    const d = document.createElement('div');
    d.textContent = prefix + label;
    d.style = 'cursor:pointer;padding-left:6px';
    d.onclick = () => location.assign(`/${currentProjectName}/${encodeURIComponent(pageName)}`);
    panelNode.appendChild(d);
  };

  const renderPageTitle = (parentNode, rawLines) => {
    if (!rawLines || !rawLines.length) return;

    const text = (rawLines[0].text || '').trim();
    if (!text) return;

    appendPanelTitle(parentNode, '📌 ' + text, () => jumpToLineId(rawLines[0].id));
  };

  const appendPanelTitle = (parentNode, text, onClick) => {
    return appendTextNode(parentNode, text, Styles.text.panelTitle, onClick);
  };

  const appendSectionHeader = (parentNode, text, onClick) => {
    return appendTextNode(parentNode, text, [Styles.text.sectionTitle, Styles.list.ellipsis].join(""), onClick);
  };

  const appendTextNode = (parentNode, text, style, onClick) => {
    const headerNode = document.createElement('div');
    headerNode.textContent = text;
    applyStyle(headerNode, style);
    if (onClick) {
      headerNode.onclick = onClick;
    }
    parentNode.appendChild(headerNode);
    return headerNode;
  };

  const attachCloseButton = (panelNode, panelId) => {
    const btn = document.createElement('div');
    btn.textContent = '✕';
    btn.style = `font-weight:bold;position:absolute;top:4px;right:6px;cursor:pointer;font-size:14px;color:#666;`;

    btn.onclick = () => {
      closedPanels.add(panelId);
      panelNode.remove();
    };

    panelNode.style.position = 'fixed'; // 念のため
    panelNode.appendChild(btn);
  };

  const getOrCreatePanel = (id, create) => {
    if (closedPanels.has(id)) return null;
    let el = document.getElementById(id);
    if (el) return el;

    el = create();
    el.id = id;
    document.body.appendChild(el);
    return el;
  };

  /* ================= 設定 ================= */

  const DEFAULT_SETTINGS = {
    userName: '',
    panelWidth: 480,
    panelHeight: 560,
    calendarFontSize: 9,
    idleOpacity: 0.35,
    todoMark: '[_]',      // TODO を示す文字列（正規表現ではない）
    doneMark: '[x]'       // 完了を示す文字列
  };

  const renderSettingsPanel = (panelNode) => {
    panelNode.innerHTML = '';

    loadSettings(currentProjectName, setting => {
      const field = (label, el) => {
        const itemNode = document.createElement('div');
        itemNode.style = 'margin-bottom:6px';
        const labelNode = document.createElement('div');
        labelNode.textContent = label;
        labelNode.style = 'font-size:11px;color:#555';
        itemNode.append(labelNode, el);
        return itemNode;
      };

      const input = (v, type = 'text') => {
        const i = document.createElement('input');
        i.type = type;
        i.value = v;
        i.style = 'width:100%';
        return i;
      };

      const nameI = input(setting.userName);
      const wI = input(setting.panelWidth, 'number');
      const hI = input(setting.panelHeight, 'number');
      const fI = input(setting.calendarFontSize, 'number');
      const oI = input(setting.idleOpacity, 'number');
      const todoI = input(setting.todoMark);
      const doneI = input(setting.doneMark);

      panelNode.append(
        field('名前', nameI),
        field('横幅', wI),
        field('縦幅', hI),
        field('TODO マーク', todoI),
        field('完了マーク', doneI),
        field('カレンダー文字サイズ(px)', fI),
        field('非アクティブ透明度', oI)
      );

      const saveBtn = document.createElement('button');
      saveBtn.textContent = '保存';
      saveBtn.onclick = () => {
        saveSettings(currentProjectName, {
          userName: nameI.value.trim(),
          panelWidth: +wI.value,
          panelHeight: +hI.value,
          calendarFontSize: +fI.value,
          idleOpacity: +oI.value,
          todoMark: todoI.value,
          doneMark: doneI.value
        });
        location.reload();
      };

      panelNode.appendChild(saveBtn);
    });
  };

  const loadSettings = (projectName, cb) => {
    if (!projectName) {
      cb({ ...DEFAULT_SETTINGS });
      return;
    }

    chrome.storage.local.get(
      { [settingsKey(projectName)]: DEFAULT_SETTINGS },
      data => {
        cb({ ...DEFAULT_SETTINGS, ...data[settingsKey(projectName)] });
      }
    );
  };

  const saveSettings = (projectName, settings) => {
    if (!projectName) return;
    chrome.storage.local.set({
      [settingsKey(projectName)]: settings
    });
  };

  const applyPanelSettings = (panelNode) => {
    let fadeTimer = null;

    loadSettings(
      currentProjectName, setting => {
      panelNode.style.width = setting.panelWidth + 'px';
      panelNode.style.maxHeight = setting.panelHeight + 'px';
      panelNode.style.opacity = '1';

      panelNode.onmouseenter = () => {
        if (fadeTimer) {
          clearTimeout(fadeTimer);
          fadeTimer = null;
        }
        panelNode.style.opacity = '1';
      };

      panelNode.onmouseleave = () => {
        if (fadeTimer) clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => {
          panelNode.style.opacity = setting.idleOpacity;
        }, 5000);
      };
    });
  };

  const renderSettingsEntry = (panelNode) => {
    appendSectionHeader(panelNode, '　⚙ 設定', () => renderSettingsPanel(panelNode));
  };

  /* ================== PageWatcher Class =================== */
  class PageWatcher {
    constructor({
      interval = 10000,
      fetchPage,
      getRevision,
      onInit,
      onUpdate
    }) {
      this.interval = interval;
      this.fetchPage = fetchPage;
      this.getRevision = getRevision;
      this.onInit = onInit;
      this.onUpdate = onUpdate;

      this.timer = null;
      this.lastRevision = null;
      this.isWarmedUp = false;
    }

    start(pageName) {
      this.stop();

      const run = async () => {
        const json = await this.fetchPage(currentProjectName, pageName);
        if (!json) return;

        const revision = this.getRevision(json);

        // 初回：baseline 設定のみ
        if (!this.isWarmedUp) {
          this.lastRevision = revision;
          this.isWarmedUp = true;
          this.onInit?.({ pageName, json });
          return;
        }

        // 変更なし
        if (revision === this.lastRevision) return;

        // 変更あり
        this.lastRevision = revision;
        this.onUpdate({ pageName, json });
      };

      run();
      this.timer = setInterval(run, this.interval);
    }

    stop() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.lastRevision = null;
      this.isWarmedUp = false;
    }
  }

  /* ================= 履歴管理 ================= */
  const saveHistory = (projectName, pageName) => {
    if (!projectName || !pageName) return;

    chrome.storage.local.get(
      { [historyKey(projectName)]: [] },
      data => {
        const list = data[historyKey(projectName)];
        if (list.length && list[list.length - 1].pageName === pageName) return;
        list.push({ pageName, ts: Date.now() });
        chrome.storage.local.set({
          [historyKey(projectName)]: list.slice(-100)
        });
      }
    );
  };

  const normalizeHistoryEntries = (history) => {
    if (!Array.isArray(history)) return [];

    return history
      .filter(entry => entry && typeof entry.pageName === 'string' && entry.pageName.trim() !== '')
      .map(entry => ({ pageName: entry.pageName, ts: typeof entry.ts === 'number' ? entry.ts : 0 }));
  };

  const getRecentPages = (history, limit = 10) => {
    const seen = new Set();
    const result = [];

    for (let i = history.length - 1; i >= 0; i--) {
      const pageName = history[i].pageName;
      if (seen.has(pageName)) continue;
      seen.add(pageName);
      result.push(history[i]);
      if (result.length >= limit) break;
    }

    return result;
  };

  const renderHistory = (panelNode, history) => {
    const items = getRecentPages(history, 10);
    if (!items.length) return;

    appendSectionHeader(panelNode, '🕒 最近見たページ');
    items.forEach(item => {
      appendLink(panelNode, item.pageName, item.pageName);
    });
  };

  const renderFrequentPages = (panelNode, history) => {
    const freq = {};
    history.forEach(item => {
      freq[item.pageName] = (freq[item.pageName] || 0) + 1;
    });

    const items = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (!items.length) return;

    appendSectionHeader(panelNode, '⭐ よく見ているページ');
    items.forEach(([pageName, count]) => {
      appendLink(panelNode, `${pageName} (${count})`, pageName);
    });
  };

  /* ================= トップページ ================= */
  const renderMyResearchNote = (panelNode, setting) => {
    if (!setting.userName) return;
    const date = new Date();

    const ym = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
    const pageName = `${ym}_研究ノート_${setting.userName}`;
    appendSectionHeader(panelNode, '🧑 自分の研究ノート');
    appendLink(panelNode, pageName, pageName, '📅 ');
  };

  const renderProjectTop = () => {
    const projectName = currentProjectName;

    chrome.storage.local.get(
      { [historyKey(projectName)]: [] },
      data => {
        if (!isExtensionAlive()) return;
        loadSettings(projectName, setting => {
          if (!isExtensionAlive()) return;
          if (projectName !== currentProjectName) return;

          const history = normalizeHistoryEntries(
            data[historyKey(projectName)]
          );

          const panelNode = getOrCreatePanel(
            MAIN_PANEL_ID,
            () => {
              const p = document.createElement('div');
              applyStyle(p, Styles.panel.base, Styles.panelMain);
              applyPanelSettings(p);
              attachCloseButton(p, MAIN_PANEL_ID);
              return p;
            }
          );

          renderMyResearchNote(panelNode, setting);
          renderFrequentPages(panelNode, history);
          renderHistory(panelNode, history);
          renderSettingsEntry(panelNode);

          document.body.appendChild(panelNode);
        });
      }
    );
  };

  /* ================= 研究ノート：月カレンダー（完全版） ================= */
  const createCalendarPanel = (pageName) => {
    const panelNode = document.createElement('div');
    applyStyle(panelNode, Styles.panel.base, Styles.panelCalendar);
    applyPanelSettings(panelNode);

    const shiftMonthInPageName = (pageName, monthOffset) => {
      const match = pageName.match(/(20\d{2})\.(\d{2})/);
      if (!match) return null;
      let year  = Number(match[1]);
      let month = Number(match[2]) + monthOffset;
      if (month === 0)  { year--; month = 12; }
      if (month === 13) { year++; month = 1; }
      const newYm = `${year}.${String(month).padStart(2, '0')}`;
      return pageName.replace(/20\d{2}\.\d{2}/, newYm);
    };

    const todayPage = pageName => {
      const date = new Date();
      return pageName.replace(
        /20\d{2}\.\d{2}/,
        `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2,'0')}`
      );
    };

    const ym = pageName.match(/(20\d{2})\.(\d{2})/);

    const headerNode = document.createElement('div');
    applyStyle(headerNode, Styles.calendar.header);

    const btn = (label, fn) => {
      const s = document.createElement('span');
      s.textContent = label;
      s.style = 'cursor:pointer';
      s.onclick = fn;
      return s;
    };

    headerNode.append(
      btn('◀', () => {
        const np = shiftMonthInPageName(pageName, -1);
        if (np) location.assign(`/${currentProjectName}/${encodeURIComponent(np)}`);
      }),
      document.createTextNode(
        ym ? `${ym[1]}年${parseInt(ym[2], 10)}月` : ''
      ),
      btn('▶', () => {
        const np = shiftMonthInPageName(pageName, 1);
        if (np) location.assign(`/${currentProjectName}/${encodeURIComponent(np)}`);
      }),
      Object.assign(document.createElement('span'), { style: 'margin-left:auto' }),
      btn('今月へ', () => {
        const np = todayPage(pageName);
        if (np) location.assign(`/${currentProjectName}/${encodeURIComponent(np)}`);
      }),
      btn('✕', () => {
        closedPanels.add(CALENDAR_ID);
        panelNode.remove();
      })
    );

    const gridNode = document.createElement('div');
    gridNode.className = CALENDAR_GRID_CLASS;
    applyStyle(gridNode, Styles.calendar.grid);

    loadSettings(currentProjectName, setting => {
      gridNode.style.fontSize = setting.calendarFontSize + 'px';
    });

    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(weekDay => {
      appendTextNode(gridNode, weekDay, [Styles.text.sectionTitle, 'text-align:center'].join(""));
    });

    panelNode.append(headerNode, gridNode);
    document.body.appendChild(panelNode);

    return panelNode;
  };

  const renderCalendar = (pageName) => {
    getOrCreatePanel(
      CALENDAR_ID,
      () => createCalendarPanel(pageName)
    );
  };

  const renderCalendarFromLines = (json) => {
    const panelNode = document.getElementById(CALENDAR_ID);
    if (!panelNode) return;

    const gridNode = panelNode.querySelector('.' + CALENDAR_GRID_CLASS);
    if (!gridNode) return;

    // 曜日行（7個）だけ残す
    while (gridNode.children.length > 7) {
      gridNode.removeChild(gridNode.lastChild);
    }

    const days = {}, snip = {};
    let cur = null;

    for (const line of json.lines) {
      let text = (line.text || '').trim();
      const mm = text.match(/^\[\*\(\s*(20\d{2})\.(\d{2})\.(\d{2})/);
      if (mm) {
        cur = `${mm[1]}.${mm[2]}.${mm[3]}`;
        days[cur] = line.id;
        snip[cur] = [];
        continue;
      }
      text = text.replace(/\[[^\]]+\.icon\]/g, '').trim();
      if (
        cur &&
        text &&
        !text.startsWith('#') &&
        !text.startsWith('>') &&
        !text.startsWith('[https://') &&
        !text.startsWith('[[https://') &&
        !text.startsWith('[| ') &&
        snip[cur].length < 6
      ) {
        snip[cur].push(text);
      }
    }

    const today = (() => {
      const date = new Date();
      return `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`;
    })();

    const ds = Object.keys(days).sort();
    if (ds.length) {
      const f = new Date(ds[0].replace(/\./g, '-')).getDay();
      for (let i = 0; i < f; i++) {
        gridNode.appendChild(document.createElement('div'));
      }
    }

    ds.forEach(d => {
      const c = document.createElement('div');
      c.style =
        'border:1px solid #ddd;padding:2px;cursor:pointer;' +
        'display:flex;flex-direction:column;gap:1px;overflow:hidden';
      if (d === today) c.style.background = 'rgba(0,200,0,0.18)';

      const dd = document.createElement('div');
      dd.textContent = d.split('.').pop();
      dd.style = 'font-weight:bold;line-height:1';

      const wd = new Date(d.replace(/\./g, '-')).getDay();
      if (wd === 0) dd.style.color = 'red';
      if (wd === 6) dd.style.color = 'blue';

      c.appendChild(dd);

      (snip[d] || []).forEach(t => {
        const p = document.createElement('div');
        p.textContent = t;
        p.style =
          'font-size:0.9em;color:#555;white-space:nowrap;' +
          'overflow:hidden;text-overflow:ellipsis;line-height:1.1';
        c.appendChild(p);
      });

      c.onclick = () => jumpToLineId(days[d]);
      gridNode.appendChild(c);
    });
  };

  /* ================= 実験計画書 ================= */
  const createExperimentPlanPanel = () => {
    const panelNode = document.createElement('div');
    applyStyle(panelNode, Styles.panel.base);
    applyPanelSettings(panelNode);
    return panelNode;
  };

  const renderExperimentPlan = async (pageName) => {
    const json = await fetchPage(currentProjectName, pageName);
    if (!json) return;

    const panelNode = getOrCreatePanel(MAIN_PANEL_ID, createExperimentPlanPanel);
    panelNode.innerHTML = ''; // ← update というより再構築

    renderPageTitle(panelNode, json.lines);
    attachCloseButton(panelNode, MAIN_PANEL_ID);

    let cur = null;
    json.lines.forEach(line => {
      const text = (line.text || '').trim();
      if (/^\[\*{3,}\(&/.test(text)) {
        cur = appendSectionHeader(panelNode, '■ ' + text.replace(/^\[\*+\(&\s*/, '').replace(/\]$/, ''), () => jumpToLineId(line.id));
      } else if (/^\[\*&\s+/.test(text) && cur) {
        appendTextNode(panelNode, '└ ' + text.replace(/^\[\*&\s*/, '').replace(/\]$/, ''), [Styles.text.item, Styles.list.ellipsis].join(""), () => jumpToLineId(line.id));
      }
    });

    document.body.appendChild(panelNode);
  };

  /* ==================== 議事録など ====================== */
  const createMinutesPanel = () => {
    const panelNode = document.createElement('div');
    applyStyle(panelNode, Styles.panel.base);
    applyPanelSettings(panelNode);

    const title = document.createElement('div');
    title.id = MAIN_TITLE_ID;
    panelNode.appendChild(title);

    const body = document.createElement('div');
    body.id = MAIN_BODY_ID;
    panelNode.appendChild(body);

    return panelNode;
  };

  const renderMinutesFromLines = (rawLines) => {
    const lines = normalizeLines(rawLines, { withUid: true });

    const panelNode = getOrCreatePanel(MAIN_PANEL_ID, createMinutesPanel);
    const body = panelNode.querySelector('#' + MAIN_BODY_ID);

    const headerNode = panelNode.querySelector('#' + MAIN_TITLE_ID);
    headerNode.textContent = '📌 ' + (rawLines[0]?.text || '');
    applyStyle(headerNode, Styles.text.panelTitle);
    headerNode.onclick = () => jumpToLineId(rawLines[0]?.id);
    attachCloseButton(panelNode, MAIN_PANEL_ID);

    const fragment = document.createDocumentFragment();

    const sessions = [];
    let cur = null;

    // const isTitleLine = t =>
    //   (/^\[[\*\(\&]*[\(\&][\*\(\&]*\s+/.test(t) && !/^\[\*{1,2}\s/.test(t)) ||
    //   /^タイトル\s*[:：『「]/.test(t);

    lines.forEach(line => {
      // セッション開始（[() 系）
      //if (/^\[\(/.test(line.text)) {
      if (isSessionStart(line.text)) {
        cur = {
          id: line.id,
          title: line.text.replace(/^\[[^\s]+\s*/, '').replace(/\]$/, ''),
          talks: []
        };
        sessions.push(cur);
        return;
      }

      // 発表タイトル行
      if (isTitleLine(line.text)) {
        if (!cur) {
          cur = { id: line.id, title: '(none)', talks: [] };
          sessions.push(cur);
        }
        cur.talks.push({ id: line.id, title: cleanTitle(line.text) });
      }
    });

    /* --- セッション描画 --- */
    sessions.forEach(s => {
      appendSectionHeader(fragment, s.title, () => jumpToLineId(s.id));
      s.talks.forEach(t => {
        appendTextNode(fragment, '└ ' + t.title, [Styles.text.item, Styles.list.ellipsis].join(""), () => jumpToLineId(t.id));
      });
    });

    const statsBlock = createTalkStatsBlock(rawLines);
    if (statsBlock) fragment.appendChild(statsBlock);

    body.replaceChildren(fragment);
  };

  const createTalkStatsBlock = (rawLines) => {
    const { stats, idToName } = buildTalkStats(rawLines);
    if (!Object.keys(stats).length) return null;

    const box = document.createElement('div');
    renderTalkStats(box, stats, idToName);
    return box;
  };

  /* ================= TODO PANEL (stable version) ================= */
  const createTodoPanel = () => {
    const panelNode = document.createElement('div');
    applyStyle(panelNode, Styles.panel.base, Styles.panelTodo);
    applyPanelSettings(panelNode);
    return panelNode;
  };

  const renderTodoPanel = (lines) => {
    loadSettings(currentProjectName, setting => {
      const TODOSHOW = 5;

      const extractTodos = () => {
        const todos = [];
        let currentDate = null;

        lines.forEach(line => {
          const text = (line.text || '').trim();

          const dm = text.match(/^\[\*\(\s*(20\d{2})\.(\d{2})\.(\d{2})/);
          if (dm) {
            currentDate = `${dm[1]}.${dm[2]}.${dm[3]}`;
            return;
          }

          if (text.includes(setting.todoMark)) {
            todos.push({
              id: line.id,
              text: text.replace(setting.todoMark, '').trim(),
              date: currentDate,
              done: false
            });
            return;
          }

          if (text.includes(setting.doneMark)) {
            todos.push({
              id: line.id,
              text: text.replace(setting.doneMark, '').trim(),
              date: currentDate,
              done: true
            });
          }
        });

        return todos;
      };

      const todos = extractTodos();
      if (!todos.length) {
        document.getElementById(TODO_PANEL_ID)?.remove();
        return;
      }

      const panelNode = getOrCreatePanel(TODO_PANEL_ID, createTodoPanel);
      panelNode.innerHTML = '';

      const activeTodos = todos.filter(todo => !todo.done);
      const doneTodos   = todos.filter(todo => todo.done);

      appendPanelTitle(panelNode, `📝 TODO LIST（${activeTodos.length} / ${todos.length}）`);
      attachCloseButton(panelNode, TODO_PANEL_ID);

      const list = document.createElement('div');
      panelNode.appendChild(list);

      const createTodoRow = (todo) => {
        const itemNode = document.createElement('div');
        itemNode.style =
          'cursor:pointer;padding:4px 6px;' +
          'border-bottom:1px solid #eee;' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';

        itemNode.textContent = '□ ' + todo.text + (todo.date ? ` (${todo.date})` : '');

        if (todo.done) {
          itemNode.style.color = '#999';
          itemNode.style.textDecoration = 'line-through';
        }

        itemNode.onclick = () => jumpToLineId(todo.id);
        return itemNode;
      };

      const items = [];

      // 表示順をここで固定（未完了 → 完了）
      [...activeTodos, ...doneTodos].forEach(todo => {
        const row = createTodoRow(todo);
        items.push({ dom: row, done: todo.done });
        list.appendChild(row);
      });

      const activeItems = items.filter(x => !x.done);
      const doneItems   = items.filter(x => x.done);

      let moreLine = null;
      const showCollapsed = () => {
        activeItems.forEach((x, i) => {
          x.dom.style.display = i < TODOSHOW ? '' : 'none';
        });
        doneItems.forEach(x => {
          x.dom.style.display = 'none';
        });
        if (moreLine) moreLine.style.display = '';
      };

      const showAll = () => {
        items.forEach(x => { x.dom.style.display = ''; });
        if (moreLine) moreLine.style.display = 'none';
      };
      showCollapsed();

      panelNode.addEventListener('mouseenter', showAll);
      panelNode.addEventListener('mouseleave', showCollapsed);
    });
  };

  /* ================= 統計処理用 ==================== */
  let userNameCache = {};
  let userNameCacheLoaded = false;

  const loadUserNameCache = (projectName) => {
    if (userNameCacheLoaded) return Promise.resolve(userNameCache);

    return new Promise(resolve => {
      chrome.storage.local.get(
        { [`sb:${projectName}:userMap`]: {} },
        data => {
          userNameCache = data[`sb:${projectName}:userMap`] || {};
          userNameCacheLoaded = true;
          resolve(userNameCache);
        }
      );
    });
  };

  const saveUserNameToCache = (projectName, uid, name) => {
    if (!uid || !name) return;
    if (userNameCache[uid] === name) return;

    userNameCache[uid] = name;

    chrome.storage.local.set({
      [`sb:${projectName}:userMap`]: userNameCache
    });
  };

  const buildTalkStats = (rawLines) => {
    const stats = {};
    const idToName = { ...userNameCache };
    const lines = normalizeLines(rawLines, { withUid: true });

    lines.forEach(line => {
      const { text, uid } = line;
      if (!uid || uid === 'unknown') return;

      const name = extractIconName(text);
      if (name) {
        idToName[uid] = name;
        saveUserNameToCache(currentProjectName, uid, name);
      }

      if (text && !text.startsWith('[')) {
        stats[uid] = (stats[uid] || 0) + text.length;
      }
    });

    return { stats, idToName };
  };

  const renderTalkStats = (parentNode, stats, idToName) => {
    const entries = Object.entries(stats);
    if (!entries.length) return;

    appendSectionHeader(parentNode, '📊 発言数');

    const max = Math.max(...entries.map(e => e[1]), 1);
    entries
      .sort((a, b) => b[1] - a[1])
      .forEach(([uid, v]) => {
        const name = idToName[uid] || uid;
        const d = document.createElement('div');
        d.innerHTML =
          `<div style="font-size:11px">${name} (${v})</div>` +
          `<div style="background:#4caf50;height:6px;width:${(v / max) * 100}%"></div>`;
        parentNode.appendChild(d);
      });
  };

  /* ================= 発表練習パネル =============== */
  const createPresentationTrainingPanel = () => {
    const panelNode = document.createElement('div');
    panelNode.id = MAIN_PANEL_ID;
    applyStyle(panelNode, Styles.panel.base);
    applyPanelSettings(panelNode);
    attachCloseButton(panelNode, MAIN_PANEL_ID);

    const titleNode = document.createElement('div');
    titleNode.id = MAIN_TITLE_ID;
    applyStyle(titleNode, Styles.text.panelTitle);
    panelNode.appendChild(titleNode);

    const bodyNode = document.createElement('div');
    bodyNode.id = MAIN_BODY_ID;
    panelNode.appendChild(bodyNode);

    return panelNode;
  };

  const renderPresentationTrainingFromLines = (pageName, rawLines) => {
    const normalizedLines = normalizeLines(rawLines);
    const panelNode = getOrCreatePanel(MAIN_PANEL_ID, createPresentationTrainingPanel);

    const titleNode = panelNode.querySelector('#' + MAIN_TITLE_ID);
    const bodyNode  = panelNode.querySelector('#' + MAIN_BODY_ID);
    const pageTitle   = normalizedLines[0]?.text || '(untitled)';
    const pageTitleId = normalizedLines[0]?.id;

    titleNode.textContent = '📌 ' + pageTitle;
    if (pageTitleId) titleNode.onclick = () => jumpToLineId(pageTitleId);

    const isTitleLine = (lineText) => /^タイトル[:：]/.test(lineText) || /^タイトル[「『].+[」』]$/.test(lineText);
    const sessions = [];
    let currentSession = null;

    normalizedLines.forEach((line, index) => {
      if (isTitleLine(line.text)) {
        if (currentSession) currentSession.end = index - 1;
        const match = line.text.match(/^タイトル[:：]\s*(.+)$/) || line.text.match(/^タイトル[「『](.+)[」』]$/);
        currentSession = {id: line.id, title: match ? match[1] : line.text, start: index + 1, end: null};
        sessions.push(currentSession);
      }
    });

    if (currentSession) currentSession.end = normalizedLines.length - 1;
    if (sessions.length === 0) sessions.push({id: pageTitleId, title: pageTitle, start: 0, end: normalizedLines.length - 1});

    const seenQuestions = new Set();

    const extractQuestions = (session) => {
      const questions = [];

      for (let i = session.start; i <= session.end; i++) {
        const lineText = normalizedLines[i].text;
        if (!/^\?\s/.test(lineText)) continue;

        const text = lineText.replace(/^\?\s*/, '').trim();
        const key  = text.replace(/\s+/g, ' ');

        if (seenQuestions.has(key)) continue;
        seenQuestions.add(key);

        const author = findAuthorAbove(normalizedLines, i);
        questions.push({ id: normalizedLines[i].id, author, text });
      }

      return questions;
    };

    const fragment = document.createDocumentFragment();

    sessions.forEach(session => {
      const questions = extractQuestions(session);
      if (!questions.length) return;

      appendSectionHeader(fragment, `🎤 ${session.title}`, () => jumpToLineId(session.id));
      questions.forEach(q => {
        appendTextNode(fragment, '・' + (q.author ? `${q.author}: ` : '?: ') + q.text, [Styles.text.item, Styles.list.ellipsis].join(''), () => jumpToLineId(q.id));
      });

      fragment.appendChild(document.createElement('hr'));
    });

    const statsBlock = createTalkStatsBlock(rawLines);
    if (statsBlock) fragment.appendChild(statsBlock);

    bodyNode.replaceChildren(fragment);
  };

  /* ================= 論文紹介パネル =============== */
  const createPaperIntroPanel = () => {
    const panelNode = document.createElement('div');
    applyStyle(panelNode, Styles.panel.base);
    applyPanelSettings(panelNode);
    attachCloseButton(panelNode, MAIN_PANEL_ID);

    const title = document.createElement('div');
    title.id = MAIN_TITLE_ID;
    panelNode.appendChild(title);

    const body = document.createElement('div');
    body.id = MAIN_BODY_ID;
    panelNode.appendChild(body);

    return panelNode;
  };

  const renderPaperPanelFromLines = (pageName, rawLines) => {
    const lines = normalizeLines(rawLines);

    if (!isPaperIntroPage(lines)) return;

    let title = null;
    let titleId = null;
    let abstractId = null;
    let qnaId = null;

    lines.forEach(line => {
      if (!title && line.text) {
        title = line.text;
        titleId = line.id;
      }
      if (line.text === '[*** 概要]') abstractId = line.id;
      if (line.text === '[*** 質問・コメント]') qnaId = line.id;
    });

    let inQnA = false;
    const questionMap = new Map(); // key -> { id, text, author }

    const normalize = (s) => s.replace(/\s+/g, ' ').trim();

    lines.forEach((line, idx) => {
      const t = line.text;

      if (t === '[*** 質問・コメント]') {
        inQnA = true;
        return;
      }

      if (inQnA && /^\[\*{3}\s/.test(t)) {
        inQnA = false;
        return;
      }

      if (inQnA && /^\?\s/.test(t)) {
        const text = normalize(t.replace(/^\?\s*/, ''));
        const author = findAuthorAbove(lines, idx);
        const existing = questionMap.get(text);

        // 重複時：質問者が特定できる方を優先
        if (!existing || (!existing.author && author)) {
          questionMap.set(text, { id: line.id, text, author });
        }
      }
    });

    const questions = Array.from(questionMap.values());

    const panelNode = getOrCreatePanel(MAIN_PANEL_ID, createPaperIntroPanel);
    const body = panelNode.querySelector('#' + MAIN_BODY_ID);

    const headerNode = panelNode.querySelector('#' + MAIN_TITLE_ID);
    headerNode.textContent = '📄 ' + title;
    applyStyle(headerNode, Styles.text.panelTitle);
    if (titleId) headerNode.onclick = () => jumpToLineId(titleId);

    const fragment = document.createDocumentFragment();

    if (questions.length) {
      appendSectionHeader(fragment, `❓ 質問 (${questions.length})`);
      questions.forEach(q => {
        appendTextNode(fragment, '・' + (q.author ? `${q.author}: ` : '?: ') + q.text, [Styles.text.item, Styles.list.ellipsis].join(''), () => jumpToLineId(q.id));
      });
    }

    fragment.appendChild(document.createElement('hr'));
    const statsBlock = createTalkStatsBlock(rawLines);
    if (statsBlock) fragment.appendChild(statsBlock);

    body.replaceChildren(fragment);
  };

  /* =============== Watcher ========================= */
  const paperIntroWatcher = new PageWatcher({
    fetchPage,
    getRevision: j => j.updated,

    onInit: ({ pageName, json }) => {
      if (!isPaperIntroPage(json.lines)) return;
      renderPaperPanelFromLines(pageName, json.lines);
    },

    onUpdate: ({ pageName, json }) => {
      if (!isPaperIntroPage(json.lines)) return;
      renderPaperPanelFromLines(pageName, json.lines);
    }
  });

  const researchNoteWatcher = new PageWatcher({
    fetchPage,
    getRevision: j => j.updated,

    onInit: ({pageName, json }) => {
      renderCalendar(pageName);              // ★ 追加
      renderCalendarFromLines(json);
      renderTodoPanel(json.lines);
    },

    onUpdate: ({ pageName, json }) => {
      renderCalendarFromLines(json);
      renderTodoPanel(json.lines);
    }
  });

  const minutesWatcher = new PageWatcher({
    fetchPage,
    getRevision: j => j.updated,

    onInit: ({ pageName, json }) => {
      renderMinutesByType(pageName, json);
    },

    onUpdate: ({ pageName, json }) => {
      renderMinutesByType(pageName, json);
    }
  });

  const renderMinutesByType = (pageName, json) => {
    const lines = json.lines || [];
    if (/発表練習/.test(pageName)) {
      renderPresentationTrainingFromLines(pageName, lines);
    } else {
      renderMinutesFromLines(lines);
    }
  };

  /* ================= SPA監視 ================= */

  const classifyPage = (pageName, lines) => {
    if (!pageName) return 'project-top';
    if (/研究ノート/.test(pageName)) return 'research-note';
    if (/実験計画書/.test(pageName)) return 'experiment-plan';
    if (/発表練習/.test(pageName)) return 'presentation-training';
    if (isPaperIntroPage(lines)) return 'paper-intro';
    return 'minutes';
  };

  const stopAllWatchers = () => {
    researchNoteWatcher?.stop();
    paperIntroWatcher?.stop();
    minutesWatcher?.stop();
  };

  const route = (pageName, json) => {
    // ページなしは呼ばれない前提
    const lines = normalizeLines(json.lines);
    const type = classifyPage(pageName, lines);
    const handlers = {
      'research-note': () => researchNoteWatcher.start(pageName),
      'experiment-plan': () => renderExperimentPlan(pageName),
      'paper-intro': () => paperIntroWatcher.start(pageName),
      'presentation-training': () => minutesWatcher.start(pageName),
      'minutes': () => minutesWatcher.start(pageName),
    };

    handlers[type]?.();
  };

  let lastKey = null;

  const tick = async () => {
    if (!isExtensionAlive()) return;

    const key = location.pathname;
    if (key === lastKey) return;
    lastKey = key;

    clearUI();
    stopAllWatchers();
    closedPanels.clear();

    const match = location.pathname.match(/^\/([^/]+)(?:\/(.*))?$/);
    if (!match) return;

    currentProjectName = match[1];
    const pageName = match[2] ? decodeURIComponent(match[2]) : null;

    await loadUserNameCache(currentProjectName);
    saveHistory(currentProjectName, pageName);

    // プロジェクトトップ
    if (!pageName) {
      renderProjectTop();
      return;
    }

    // ページあり
    const json = await fetchPage(currentProjectName, pageName);
    if (!json) return;

    route(pageName, json);
  };

  setInterval(tick, 600);
  tick();
})();
