// content.js — Scrapbox Research Helper (FULL COMPLETE VERSION)
(() => {
  if (window.__SB_EXTENSION_RUNNING__) return;
  window.__SB_EXTENSION_RUNNING__ = true;

  const TODO_PANEL_ID = '__sb_todo_panel__';
  const MAIN_PANEL_ID = '__sb_final_panel__';
  const CALENDAR_ID = 'sb-cal';

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

  const loadSettings = (cb) => {
    chrome.storage.local.get({ settings: DEFAULT_SETTINGS }, data => {
      cb({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
    });
  };

  const saveSettings = (settings) => {
    chrome.storage.local.set({ settings });
  };

  /* ================= 共通ユーティリティ ================= */
  const clearUI = () => {
    document.getElementById(CALENDAR_ID)?.remove();
    document.getElementById(MAIN_PANEL_ID)?.remove();
  };

  const jump = id => {
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
        line.uid =
          l.userId ||
          l.createdBy ||
          l.updatedBy ||
          'unknown';
      }

      return line;
    });
  };

  const fetchPage = async (project, page) => {
    const r = await fetch(
      `https://scrapbox.io/api/pages/${project}/${encodeURIComponent(page)}`
    );
    if (!r.ok) return null;
    return r.json();
  };

  const isPaperIntroPage = (lines) =>
    lines.some(l => (l.text || '').includes('#論文紹介関連'));

  const basePanelStyle =
    'position:fixed;top:10px;right:10px;' +
    'background:#fff;border:1px solid #ccc;' +
    'box-shadow:0 2px 10px rgba(0,0,0,.25);' +
    'z-index:99999;font:12px/1.5 sans-serif;' +
    'overflow:auto;transition:opacity .2s';

  const appendLink = (p, label, project, page, prefix = '•') => {
    const d = document.createElement('div');
    d.textContent = prefix + label;
    d.style = 'cursor:pointer;padding-left:6px';
    d.onclick = () =>
      location.assign(`/${project}/${encodeURIComponent(page)}`);
    p.appendChild(d);
  };

  const applyPanelSettings = (p) => {
    let fadeTimer = null;

    loadSettings(s => {
      p.style.width = s.panelWidth + 'px';
      p.style.maxHeight = s.panelHeight + 'px';
      p.style.opacity = '1';

      p.onmouseenter = () => {
        if (fadeTimer) {
          clearTimeout(fadeTimer);
          fadeTimer = null;
        }
        p.style.opacity = '1';
      };

      p.onmouseleave = () => {
        if (fadeTimer) clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => {
          p.style.opacity = s.idleOpacity;
        }, 5000); // ← ★ 5秒後に透明化
      };
    });
  };

  const renderPageTitle = (parent, rawLines) => {
    if (!rawLines || !rawLines.length) return;

    const t = (rawLines[0].text || '').trim();
    if (!t) return;

    const h = document.createElement('div');
    h.textContent = '📌 ' + t;
    h.style =
      'font-weight:bold;font-size:14px;' +
      'margin-bottom:6px;cursor:pointer';

    h.onclick = () => jump(rawLines[0].id);

    parent.appendChild(h);
  };

  const createPageWatcher = ({ interval = 10000, onUpdate }) => {
    let timer = null;
    let lastUpdated = null;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
      lastUpdated = null;
    };

    const start = (project, page) => {
      stop();

      const run = async () => {
        const json = await fetchPage(project, page);
        if (!json) return;

        if (
          typeof json.updated === 'number' &&
          json.updated === lastUpdated
        ) {
          return;
        }
        lastUpdated = json.updated;

        onUpdate({
          project,
          page,
          lines: json.lines,
          json
        });
      };

      run(); // 初回即時
      timer = setInterval(run, interval);
    };

    return { start, stop };
  };


  /* ================= 履歴管理 ================= */

  const saveHistory = (project, page) => {
    if (!page) return;
    chrome.storage.local.get({ history: [] }, data => {
      let h = data.history;
      if (h.length && h[h.length - 1].page === page) return;
      h.push({ page, ts: Date.now() });
      if (h.length > 50) h = h.slice(-50);
      chrome.storage.local.set({ history: h });
    });
  };

  /* ================= トップページ ================= */

  const renderMyResearchNote = (p, project, s) => {
    if (!s.userName) return;

    const n = new Date();
    const ym = `${n.getFullYear()}.${String(n.getMonth() + 1).padStart(2, '0')}`;
    const page = `${ym}_研究ノート_${s.userName}`;

    const h = document.createElement('div');
    h.textContent = '🧑 自分の研究ノート';
    h.style = 'font-weight:bold;margin-bottom:4px';
    p.appendChild(h);

    appendLink(p, page, project, page, '📅 ');
  };

  const renderFrequentPages = (p, project, history) => {
    const freq = {};
    history.forEach(e => {
      freq[e.page] = (freq[e.page] || 0) + 1;
    });

    const items = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (!items.length) return;

    const h = document.createElement('div');
    h.textContent = '⭐ よく見ているページ';
    h.style = 'font-weight:bold;margin:8px 0 4px';
    p.appendChild(h);

    items.forEach(([page, count]) => {
      appendLink(p, `${page} (${count})`, project, page);
    });
  };

  const renderHistory = (p, project, history) => {
    if (!history.length) return;

    const h = document.createElement('div');
    h.textContent = '🕒 最近見たページ';
    h.style = 'font-weight:bold;margin:8px 0 4px';
    p.appendChild(h);

    history.slice(-10).reverse().forEach(e => {
      appendLink(p, e.page, project, e.page);
    });
  };

  const renderSettingsEntry = (p) => {
    const d = document.createElement('div');
    d.textContent = '⚙ 設定';
    d.style =
      'cursor:pointer;font-size:11px;color:#555;margin-top:10px';
    d.onclick = () => renderSettingsPanel(p);
    p.appendChild(d);
  };

  const renderProjectTop = (project) => {
    chrome.storage.local.get({ history: [] }, data => {
      loadSettings(s => {
        const history = data.history || [];

        const p = document.createElement('div');
        p.id = MAIN_PANEL_ID;
        p.style = basePanelStyle;
        applyPanelSettings(p);

        // 表示順はここで完全に制御
        renderMyResearchNote(p, project, s);
        renderFrequentPages(p, project, history);
        renderHistory(p, project, history);
        renderSettingsEntry(p);

        document.body.appendChild(p);
      });
    });
  };

  /* ================= 設定画面 ================= */

  const renderSettingsPanel = (p) => {
    p.innerHTML = '';
    loadSettings(s => {
      const field = (label, el) => {
        const d = document.createElement('div');
        d.style = 'margin-bottom:6px';
        const l = document.createElement('div');
        l.textContent = label;
        l.style = 'font-size:11px;color:#555';
        d.append(l, el);
        return d;
      };
      const input = (v, type='text') => {
        const i = document.createElement('input');
        i.type = type;
        i.value = v;
        i.style = 'width:100%';
        return i;
      };

      const nameI = input(s.userName);
      const wI = input(s.panelWidth, 'number');
      const hI = input(s.panelHeight, 'number');
      const fI = input(s.calendarFontSize, 'number');
      const oI = input(s.idleOpacity, 'number');
      const todoI = input(s.todoMark);
      const doneI = input(s.doneMark);

      p.append(
        field('名前', nameI),
        field('横幅', wI),
        field('縦幅', hI),
        field('TODO マーク', todoI),
        field('完了マーク', doneI),
        field('カレンダー文字サイズ(px)', fI),
        field('非アクティブ透明度', oI)
      );

      const save = document.createElement('button');
      save.textContent = '保存';
      save.onclick = () => {
        saveSettings({
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
      p.appendChild(save);
    });
  };

  /* ================= 研究ノート：月カレンダー（完全版） ================= */

  const renderCalendar = async (project, page) => {
    const j = await fetchPage(project, page);
    if (!j) return;

    // 既に存在する場合は作らない
    if (document.getElementById(CALENDAR_ID)) return;

    const box = document.createElement('div');
    box.id = CALENDAR_ID;
    box.style =
      'position:fixed;top:10px;right:10px;width:33vw;max-width:560px;' +
      'min-width:420px;height:66vh;background:#fff;z-index:99999;' +
      'border:1px solid #ccc;box-shadow:0 2px 10px rgba(0,0,0,.25);' +
      'display:flex;flex-direction:column;font-size:12px;' +
      'transition:opacity .2s';

    applyPanelSettings(box);

    const move = (p, d) => {
      const m = p.match(/(20\d{2})\.(\d{2})/);
      if (!m) return null;
      let y = +m[1], mo = +m[2] + d;
      if (mo === 0) { y--; mo = 12; }
      if (mo === 13) { y++; mo = 1; }
      return p.replace(/20\d{2}\.\d{2}/, `${y}.${String(mo).padStart(2,'0')}`);
    };

    const todayPage = p => {
      const n = new Date();
      return p.replace(
        /20\d{2}\.\d{2}/,
        `${n.getFullYear()}.${String(n.getMonth() + 1).padStart(2,'0')}`
      );
    };

    const ym = page.match(/(20\d{2})\.(\d{2})/);

    const head = document.createElement('div');
    head.style =
      'padding:6px;font-weight:bold;border-bottom:1px solid #ddd;' +
      'background:#f5f5f5;display:flex;align-items:center;gap:8px';

    const btn = (label, fn) => {
      const s = document.createElement('span');
      s.textContent = label;
      s.style = 'cursor:pointer';
      s.onclick = fn;
      return s;
    };

    head.append(
      btn('◀', () => {
        const np = move(page, -1);
        if (np) location.assign(`/${project}/${encodeURIComponent(np)}`);
      }),
      document.createTextNode(
        ym ? `${ym[1]}年${parseInt(ym[2], 10)}月` : ''
      ),
      btn('▶', () => {
        const np = move(page, 1);
        if (np) location.assign(`/${project}/${encodeURIComponent(np)}`);
      }),
      Object.assign(document.createElement('span'), { style: 'margin-left:auto' }),
      btn('今月へ', () => {
        const np = todayPage(page);
        if (np) location.assign(`/${project}/${encodeURIComponent(np)}`);
      })
    );

    const grid = document.createElement('div');
    grid.className = '__sb_calendar_grid__'; // ★ 更新用フック
    grid.style =
      'flex:1;padding:6px;display:grid;' +
      'grid-template-columns:repeat(7,1fr);' +
      'grid-template-rows:auto repeat(6,1fr);gap:2px';

    loadSettings(s => {
      grid.style.fontSize = s.calendarFontSize + 'px';
    });

    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
      const h = document.createElement('div');
      h.textContent = d;
      h.style =
        'text-align:center;font-weight:bold;color:#666;font-size:10px';
      grid.appendChild(h);
    });

    box.append(head, grid);
    document.body.appendChild(box);

    // 初回描画
    updateCalendarFromLines(project, page, j);
  };

  const updateCalendarFromLines = (project, page, j) => {
    const box = document.getElementById(CALENDAR_ID);
    if (!box) return;

    const grid = box.querySelector('.__sb_calendar_grid__');
    if (!grid) return;

    // 曜日行（7個）だけ残す
    while (grid.children.length > 7) {
      grid.removeChild(grid.lastChild);
    }

    const days = {}, snip = {};
    let cur = null;

    for (const l of j.lines) {
      let t = (l.text || '').trim();
      const mm = t.match(/^\[\*\(\s*(20\d{2})\.(\d{2})\.(\d{2})/);
      if (mm) {
        cur = `${mm[1]}.${mm[2]}.${mm[3]}`;
        days[cur] = l.id;
        snip[cur] = [];
        continue;
      }
      t = t.replace(/\[[^\]]+\.icon\]/g, '').trim();
      if (
        cur &&
        t &&
        !t.startsWith('#') &&
        !t.startsWith('>') &&
        !t.startsWith('[https://') &&
        !t.startsWith('[[https://') &&
        !t.startsWith('[| ') &&
        snip[cur].length < 6
      ) {
        snip[cur].push(t);
      }
    }

    const today = (() => {
      const d = new Date();
      return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
    })();

    const ds = Object.keys(days).sort();
    if (ds.length) {
      const f = new Date(ds[0].replace(/\./g, '-')).getDay();
      for (let i = 0; i < f; i++) {
        grid.appendChild(document.createElement('div'));
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

      c.onclick = () => jump(days[d]);
      grid.appendChild(c);
    });
  };

  /* ================= 実験計画書 ================= */

  const renderExperimentPlan = async (project, page) => {
    const j = await fetchPage(project, page);
    if (!j) return;

    const p = document.createElement('div');
    p.id = MAIN_PANEL_ID;
    p.style = basePanelStyle;
    applyPanelSettings(p);

    renderPageTitle(p, j.lines);

    let cur = null;
    j.lines.forEach(l => {
      const t = (l.text || '').trim();
      if (/^\[\*{3,}\(&/.test(t)) {
        cur = document.createElement('div');
        cur.textContent = '■ ' + t.replace(/^\[\*+\(&\s*/, '').replace(/\]$/, '');
        cur.style = 'font-weight:bold;margin:6px 0;cursor:pointer';
        cur.onclick = () => jump(l.id);
        p.appendChild(cur);
      } else if (/^\[\*&\s+/.test(t) && cur) {
        const d = document.createElement('div');
        d.textContent = '└ ' + t.replace(/^\[\*&\s*/, '').replace(/\]$/, '');
        d.style = 'padding-left:16px;cursor:pointer';
        d.onclick = () => jump(l.id);
        p.appendChild(d);
      }
    });

    document.body.appendChild(p);
  };

  /* ==================== 議事録など ====================== */
  const renderMinutesFromLines = (project, page, rawLines) => {
    const lines = normalizeLines(rawLines, { withUid: true });

    let panel = document.getElementById(MAIN_PANEL_ID);
    let body;

    if (!panel) {
      panel = document.createElement('div');
      panel.id = MAIN_PANEL_ID;
      panel.style = basePanelStyle;
      applyPanelSettings(panel);

      const title = document.createElement('div');
      title.id = '__sb_minutes_title__';
      title.style =
        'font-weight:bold;font-size:14px;cursor:pointer;margin-bottom:6px';
      panel.appendChild(title);

      panel.appendChild(document.createElement('hr'));

      body = document.createElement('div');
      body.id = '__sb_minutes_body__';
      panel.appendChild(body);

      document.body.appendChild(panel);
    } else {
      body = panel.querySelector('#__sb_minutes_body__');
    }

    const header = panel.querySelector('#__sb_minutes_title__');
    header.textContent = '📌 ' + (rawLines[0]?.text || '');
    header.onclick = () => jump(rawLines[0]?.id);

    const frag = document.createDocumentFragment();

    const sessions = [];
    let cur = null;

    const isTitleLine = t =>
      (/^\[[\*\(\&]*[\(\&][\*\(\&]*\s+/.test(t) && !/^\[\*{1,2}\s/.test(t)) ||
      /^タイトル\s*[:：『「]/.test(t);

    const cleanTitle = t =>
      t.replace(/^\[[\*\(\&]+\s*/, '')
      .replace(/^タイトル\s*[:：『「]\s*/, '')
      .replace(/[』」]\s*$/, '')
      .replace(/\]\s*$/, '');

    lines.forEach(l => {
      // セッション開始（[() 系）
      if (/^\[\(/.test(l.text)) {
        cur = {
          id: l.id,
          title: l.text.replace(/^\[[^\s]+\s*/, '').replace(/\]$/, ''),
          talks: []
        };
        sessions.push(cur);
        return;
      }

      // 発表タイトル行
      if (isTitleLine(l.text)) {
        if (!cur) {
          cur = { id: l.id, title: '(auto)', talks: [] };
          sessions.push(cur);
        }
        cur.talks.push({
          id: l.id,
          title: cleanTitle(l.text)
        });
      }
    });

    /* --- セッション描画 --- */
    sessions.forEach(s => {
      const h = document.createElement('div');
      h.textContent = s.title;
      h.style = 'font-weight:bold;margin:6px 0;cursor:pointer';
      h.onclick = () => jump(s.id);
      frag.appendChild(h);

      s.talks.forEach(t => {
        const d = document.createElement('div');
        d.textContent = '└ ' + t.title;
        d.style = 'padding-left:14px;cursor:pointer';
        d.onclick = () => jump(t.id);
        frag.appendChild(d);
      });
    });

    frag.appendChild(document.createElement('hr'));

    /* --- 発言統計 --- */
    const { stats, idToName } = buildTalkStats(rawLines);
    const statsBox = document.createElement('div');
    renderTalkStats(statsBox, stats, idToName);
    frag.appendChild(statsBox);

    body.replaceChildren(frag);
  };


  /* ================= TODO PANEL (stable version) ================= */
  const renderTodoPanel = (project, page, lines) => {
    loadSettings(s => {
      const TODOSHOW = 5;

      const todos = [];
      let currentDate = null;

      /* ---- TODO / DONE 抽出 ---- */
      lines.forEach(l => {
        const text = (l.text || '').trim();

        // 日付ヘッダ
        const dm = text.match(/^\[\*\(\s*(20\d{2})\.(\d{2})\.(\d{2})/);
        if (dm) {
          currentDate = `${dm[1]}.${dm[2]}.${dm[3]}`;
          return;
        }

        // TODO
        if (text.includes(s.todoMark)) {
          todos.push({
            id: l.id,
            text: text.replace(s.todoMark, '').trim(),
            date: currentDate,
            done: false
          });
          return;
        }

        // DONE
        if (text.includes(s.doneMark)) {
          todos.push({
            id: l.id,
            text: text.replace(s.doneMark, '').trim(),
            date: currentDate,
            done: true
          });
        }
      });

      if (!todos.length) {
        document.getElementById(TODO_PANEL_ID)?.remove();
        return;
      }

      document.getElementById(TODO_PANEL_ID)?.remove();

      const p = document.createElement('div');
      p.id = TODO_PANEL_ID;
      p.style =
        'position:fixed;top:10px;right:520px;width:320px;' +
        'max-height:60vh;overflow:auto;' +
        'background:#fff;border:1px solid #ccc;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.25);' +
        'z-index:99999;font:12px/1.4 sans-serif;' +
        'transition:opacity .2s';

      applyPanelSettings(p);

      const activeCount = todos.filter(t => !t.done).length;
      const totalCount = todos.length;

      const h = document.createElement('div');
      h.textContent = `📝 TODO LIST（残り ${activeCount} / 全 ${totalCount}）`;
      h.style =
        'font-weight:bold;padding:6px;border-bottom:1px solid #ddd;' +
        'background:#f5f5f5';
      p.appendChild(h);

      const list = document.createElement('div');
      p.appendChild(list);

      const items = [];

      todos.forEach(t => {
        const d = document.createElement('div');
        d.style =
          'cursor:pointer;padding:4px 6px;' +
          'border-bottom:1px solid #eee;' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';

        d.textContent =
          '• ' + t.text + (t.date ? ` (${t.date})` : '');

        if (t.done) {
          d.style.color = '#999';
          d.style.textDecoration = 'line-through'; // ★ 取り消し線
        }

        d.onclick = () => {
          const a = document.createElement('a');
          a.href = '#' + t.id;
          document.body.appendChild(a);
          a.click();
          a.remove();
        };

        items.push({ dom: d, done: t.done });
        list.appendChild(d);
      });

      /* ---- 表示制御 ---- */
      const activeItems = items.filter(x => !x.done);
      const doneItems = items.filter(x => x.done);

      activeItems.forEach((x, i) => {
        x.dom.style.display = i < TODOSHOW ? '' : 'none';
      });
      doneItems.forEach(x => {
        x.dom.style.display = 'none';
      });

      const rest = Math.max(0, activeItems.length - TODOSHOW);
      let moreLine = null;

      if (rest > 0) {
        moreLine = document.createElement('div');
        moreLine.textContent = `… 他 ${rest} 件`;
        moreLine.style =
          'padding:4px 6px;font-size:11px;color:#666';
        list.appendChild(moreLine);
      }

      p.addEventListener('mouseenter', () => {
        items.forEach(x => {
          x.dom.style.display = '';
        });
        if (moreLine) moreLine.style.display = 'none';
      });

      p.addEventListener('mouseleave', () => {
        activeItems.forEach((x, i) => {
          x.dom.style.display = i < TODOSHOW ? '' : 'none';
        });
        doneItems.forEach(x => {
          x.dom.style.display = 'none';
        });
        if (moreLine) moreLine.style.display = '';
      });

      document.body.appendChild(p);
    });
  };

  /* ================= 統計処理用 ==================== */
  const buildTalkStats = (rawLines) => {
    const stats = {};
    const idToName = {};

    const lines = normalizeLines(rawLines, { withUid: true });

    lines.forEach(l => {
      const { text, uid } = l;

      if (!uid || uid === 'unknown') return;

      // 表示名推定（icon）
      const m = text.match(/^\[([^\]\/]+)\.icon\]/);
      if (m) {
        idToName[uid] = m[1];
      }

      // 発言としてカウントする条件
      if (
        text &&
        !text.startsWith('[') // 見出し・icon除外
      ) {
        stats[uid] = (stats[uid] || 0) + 1;
      }
    });

    return { stats, idToName };
  };

  const renderTalkStats = (parent, stats, idToName) => {
    const entries = Object.entries(stats);
    if (!entries.length) return;

    const h = document.createElement('div');
    h.textContent = '📊 発言数';
    h.style = 'font-weight:bold;margin:6px 0';
    parent.appendChild(h);

    const max = Math.max(...entries.map(e => e[1]), 1);

    entries
      .sort((a, b) => b[1] - a[1])
      .forEach(([uid, v]) => {
        const name = idToName[uid] || uid;
        const d = document.createElement('div');
        d.innerHTML =
          `<div style="font-size:11px">${name} (${v})</div>` +
          `<div style="background:#4caf50;height:6px;width:${(v / max) * 100}%"></div>`;
        parent.appendChild(d);
      });
  };

  /* ================= 発表練習パネル =============== */
  const renderPresentationTrainingFromLines = (project, page, rawLines) => {
    const lines = normalizeLines(rawLines);

    let panel = document.getElementById(MAIN_PANEL_ID);
    let body;

    if (!panel) {
      panel = document.createElement('div');
      panel.id = MAIN_PANEL_ID;
      panel.style = basePanelStyle;
      applyPanelSettings(panel);

      const title = document.createElement('div');
      title.id = '__sb_minutes_title__';
      title.style = 'font-weight:bold;font-size:14px;cursor:pointer;margin-bottom:6px';
      panel.appendChild(title);

      panel.appendChild(document.createElement('hr'));

      body = document.createElement('div');
      body.id = '__sb_minutes_body__';
      panel.appendChild(body);

      document.body.appendChild(panel);
    } else {
      body = panel.querySelector('#__sb_minutes_body__');
    }

    const pageTitle = lines[0]?.text || '(untitled)';
    const pageTitleId = lines[0]?.id;

    const titleEl = panel.querySelector('#__sb_minutes_title__');
    titleEl.textContent = '📌 ' + pageTitle;
    if (pageTitleId) titleEl.onclick = () => jump(pageTitleId);


    const isTitleLine = (t) =>
      /^タイトル[:：]/.test(t) ||
      /^タイトル[「『].+[」』]$/.test(t);

    const sessions = [];
    let cur = null;

    lines.forEach((l, idx) => {
      if (isTitleLine(l.text)) {
        if (cur) cur.end = idx - 1;

        const m =
          l.text.match(/^タイトル[:：]\s*(.+)$/) ||
          l.text.match(/^タイトル[「『](.+)[」』]$/);

        cur = {
          id: l.id,
          title: m ? m[1] : l.text,
          start: idx + 1, // ★ タイトル行の下から
          end: null
        };
        sessions.push(cur);
      }
    });

    if (cur) cur.end = lines.length - 1;

    if (sessions.length === 0) {
      sessions.push({
        id: pageTitleId,
        title: pageTitle,
        start: 0,
        end: lines.length - 1
      });
    }

    const seenQuestions = new Set();

    const extractQuestions = (session) => {
      const qs = [];

      for (let i = session.start; i <= session.end; i++) {
        const t = lines[i].text;
        if (!/^\?\s/.test(t)) continue;

        const text = t.replace(/^\?\s*/, '').trim();
        const key = text.replace(/\s+/g, ' ');

        if (seenQuestions.has(key)) continue;
        seenQuestions.add(key);

        let author = null;
        for (let j = i - 1; j >= session.start; j--) {
          const m = lines[j].text.match(/^\[([^\]\/]+)\.icon\]/);
          if (m) {
            author = m[1];
            break;
          }
        }

        qs.push({
          id: lines[i].id,
          author,
          text
        });
      }

      return qs;
    };

    const frag = document.createDocumentFragment();

    sessions.forEach(s => {
      const qs = extractQuestions(s);
      if (!qs.length) return;

      const sh = document.createElement('div');
      sh.textContent = `🎤 ${s.title}`;
      sh.style = 'font-weight:bold;margin-top:8px;cursor:pointer';
      sh.onclick = () => jump(s.id);
      frag.appendChild(sh);

      qs.forEach(q => {
        const d = document.createElement('div');
        d.textContent =
          '・' + (q.author ? `${q.author}: ` : '?: ') + q.text;
        d.style =
          'padding-left:12px;cursor:pointer;' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        d.onclick = () => jump(q.id);
        frag.appendChild(d);
      });

      frag.appendChild(document.createElement('hr'));
    });

    body.replaceChildren(frag);
  };

  /* ================= 論文紹介パネル =============== */

  const renderPaperPanelFromLines = (project, page, rawLines) => {
    const lines = normalizeLines(rawLines);

    if (!isPaperIntroPage(lines)) return;

    let title = null;
    let titleId = null;
    let abstractId = null;
    let qnaId = null;

    lines.forEach(l => {
      if (!title && l.text) {
        title = l.text;
        titleId = l.id;
      }
      if (l.text === '[*** 概要]') abstractId = l.id;
      if (l.text === '[*** 質問・コメント]') qnaId = l.id;
    });

    let inQnA = false;
    const questionMap = new Map(); // key -> { id, text, author }

    const normalize = (s) =>
      s.replace(/\s+/g, ' ').trim();

    const findAuthor = (idx) => {
      for (let i = idx - 1; i >= 0; i--) {
        const t = lines[i].text;
        const m = t.match(/^\[([^\]\/]+)\.icon\]/);
        if (m) return m[1];
        if (/^\[\*{2,3}\s/.test(t)) break;
      }
      return null;
    };

    lines.forEach((l, idx) => {
      const t = l.text;

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
        const author = findAuthor(idx);
        const existing = questionMap.get(text);

        // 重複時：質問者が特定できる方を優先
        if (!existing || (!existing.author && author)) {
          questionMap.set(text, {
            id: l.id,
            text,
            author
          });
        }
      }
    });

    const questions = Array.from(questionMap.values());

    let panel = document.getElementById(MAIN_PANEL_ID);
    let body;

    if (!panel) {
      panel = document.createElement('div');
      panel.id = MAIN_PANEL_ID;
      panel.style = basePanelStyle + 'width:520px;max-height:80vh;';
      applyPanelSettings(panel);

      // タイトル
      const h = document.createElement('div');
      h.id = '__sb_paper_title__';
      h.style =
        'font-weight:bold;font-size:14px;cursor:pointer;margin-bottom:6px';
      panel.appendChild(h);

      // ジャンプ
      const jumps = document.createElement('div');
      jumps.id = '__sb_paper_jumps__';
      jumps.style = 'margin-bottom:6px';
      panel.appendChild(jumps);

      panel.appendChild(document.createElement('hr'));

      // body（差し替え対象）
      body = document.createElement('div');
      body.id = '__sb_paper_body__';
      panel.appendChild(body);

      document.body.appendChild(panel);
    } else {
      body = panel.querySelector('#__sb_paper_body__');
    }

    const h = panel.querySelector('#__sb_paper_title__');
    h.textContent = '📄 ' + title;
    if (titleId) h.onclick = () => jump(titleId);

    const jumps = panel.querySelector('#__sb_paper_jumps__');
    jumps.replaceChildren();

    const addJump = (label, id) => {
      if (!id) return;
      const d = document.createElement('div');
      d.textContent = label;
      d.style = 'cursor:pointer;color:#1565c0';
      d.onclick = () => jump(id);
      jumps.appendChild(d);
    };

    addJump('🔎 概要へ', abstractId);
    addJump('💬 質問・コメントへ', qnaId);

    const frag = document.createDocumentFragment();

    if (questions.length) {
      const qh = document.createElement('div');
      qh.textContent = `❓ 質問 (${questions.length})`;
      qh.style = 'font-weight:bold;margin:6px 0';
      frag.appendChild(qh);

      questions.forEach(q => {
        const d = document.createElement('div');
        d.textContent =
          '・' + (q.author ? `${q.author}: ` : '?: ') + q.text;
        d.style =
          'cursor:pointer;padding-left:8px;' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        d.onclick = () => jump(q.id);
        frag.appendChild(d);
      });
    }

    body.replaceChildren(frag);
  };

  /* =============== Watcher ========================= */
  const paperIntroWatcher = createPageWatcher({
    onUpdate: ({ project, page, lines }) => {
      if (!isPaperIntroPage(lines)) return;
      renderPaperPanelFromLines(project, page, lines);
    }
  });

  const researchNoteWatcher = createPageWatcher({
    onUpdate: ({ project, page, lines, json }) => {
      updateCalendarFromLines(project, page, json);
      renderTodoPanel(project, page, lines);
    }
  });

  const minutesWatcher = createPageWatcher({
    onUpdate: ({ project, page, lines }) => {
      if (/発表練習/.test(page)) {
        renderPresentationTrainingFromLines(project, page, lines);
      } else {
        renderMinutesFromLines(project, page, lines);
      }
    }
  });

  /* ================= SPA用 =================== */
  const classifyPage = (page, lines) => {
    if (!page) return 'project-top';
    if (/研究ノート/.test(page)) return 'research-note';
    if (/実験計画書/.test(page)) return 'experiment-plan';
    if (/発表練習/.test(page)) return 'presentation-training';
    if (isPaperIntroPage(lines)) return 'paper-intro';
    return 'minutes';
  };

  const stopAllWatchers = () => {
    researchNoteWatcher?.stop();
    paperIntroWatcher?.stop();
    minutesWatcher?.stop();
  };

  /* ================= SPA監視 ================= */

  let lastKey = null;
  const tick = async () => {
    const key = location.pathname + location.hash;
    if (key === lastKey) return;
    lastKey = key;

    clearUI();
    stopAllWatchers();

    const m = location.pathname.match(/^\/([^/]+)(?:\/(.*))?$/);
    if (!m) return;

    const project = m[1];
    const pageRaw = m[2];
    const page =
      pageRaw && pageRaw.length > 0
        ? decodeURIComponent(pageRaw)
        : null;

    saveHistory(project, page);

    /* ==================
    * ページなし：プロジェクトトップ
    * ================== */
    if (!page) {
      renderProjectTop(project);
      return;
    }

    /* ==================
    * ページあり：中身を見る
    * ================== */
    const json = await fetchPage(project, page);
    if (!json) return;

    const lines = normalizeLines(json.lines);
    const type = classifyPage(page, lines);

    switch (type) {

      case 'research-note':
        renderCalendar(project, page);
        researchNoteWatcher.start(project, page);
        break;

      case 'experiment-plan':
        renderExperimentPlan(project, page);
        break;

      case 'paper-intro':
        renderPaperPanelFromLines(project, page, lines);
        paperIntroWatcher.start(project, page);
        break;

      case 'presentation-training':
        renderPresentationTrainingFromLines(project, page, lines);
        minutesWatcher.start(project, page);
        break;

      case 'minutes':
        renderMinutesFromLines(project, page, lines);
        minutesWatcher.start(project, page);
        break;
    }
  };

  setInterval(tick, 600);
  tick();
})();
