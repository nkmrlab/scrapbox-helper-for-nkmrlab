// content.js — Scrapbox Research Helper (FULL COMPLETE VERSION)
(() => {
  if (window.__SB_EXTENSION_RUNNING__) return;
  window.__SB_EXTENSION_RUNNING__ = true;

  const CAL_ID = 'sb-cal';
  const PANEL_ID = '__sb_final_panel__';

  /* ================= 設定 ================= */

  let todoTimer = null; 

  const DEFAULT_SETTINGS = {
    userName: '',
    panelWidth: 480,
    panelHeight: 420,
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
    document.getElementById(CAL_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
  };

  const jump = id => {
    const a = document.createElement('a');
    a.href = '#' + id;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
  //const appendLink = (p, label, project, page, prefix = '• ') => {
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

    const hr = document.createElement('hr');
    parent.appendChild(hr);
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
    h.textContent = '⭐ よく見てるページ';
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
        p.id = PANEL_ID;
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

    const move = (p, d) => {
      const m = p.match(/(20\d{2})\.(\d{2})/);
      if (!m) return null;
      let y = +m[1], mo = +m[2] + d;
      if (mo === 0) { y--; mo = 12; }
      if (mo === 13) { y++; mo = 1; }
      return p.replace(
        /20\d{2}\.\d{2}/,
        `${y}.${String(mo).padStart(2, '0')}`
      );
    };

    const todayPage = p => {
      const n = new Date();
      return p.replace(
        /20\d{2}\.\d{2}/,
        `${n.getFullYear()}.${String(n.getMonth() + 1).padStart(2, '0')}`
      );
    };

    /* --- 日付 → 行ID & スニペット抽出 --- */
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

    /* --- パネル --- */
    const box = document.createElement('div');
    box.id = CAL_ID;
    box.style =
      'position:fixed;top:10px;right:10px;width:33vw;max-width:560px;' +
      'min-width:420px;height:66vh;background:#fff;z-index:99999;' +
      'border:1px solid #ccc;box-shadow:0 2px 10px rgba(0,0,0,.25);' +
      'display:flex;flex-direction:column;font-size:12px;' +
      'transition:opacity .2s';
    applyPanelSettings(box);

    setTimeout(() => {
      loadSettings(s => {
        const panelH = s.panelHeight;
        const headerH = head.offsetHeight;
        const weekdayH = 16; // Sun–Sat 行（固定）
        const padding = 12;  // grid padding 合計ざっくり

        const cellH = Math.floor(
          (panelH - headerH - weekdayH - padding) / 6
        );

        grid.style.gridTemplateRows =
          `auto repeat(6, ${cellH}px)`;
      });
    }, 0);

    /* --- ヘッダ（月移動） --- */
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

    /* --- グリッド --- */
    const grid = document.createElement('div');
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

    const today = (() => {
      const d = new Date();
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
    })();

    const ds = Object.keys(days).sort();
    if (ds.length) {
      const f = new Date(ds[0].replace(/\./g, '-')).getDay();
      for (let i = 0; i < f; i++) grid.appendChild(document.createElement('div'));
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

    box.append(head, grid);
    
    document.body.appendChild(box);

    renderTodoPanel(project, page, j.lines);
  };

  /* ================= 実験計画書 ================= */

  const renderPlan = async (project, page) => {
    const j = await fetchPage(project, page);
    if (!j) return;

    const p = document.createElement('div');
    p.id = PANEL_ID;
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

  /* ================= 議事録 ================= */

  const renderMinutesFromLines = (project, page, rawLines) => {
    const lines = rawLines.map(l => ({
      id: l.id,
      text: (l.text || '').trim(),
      uid: l.userId || l.createdBy || l.updatedBy || 'unknown'
    }));

    const isValidUserId = uid =>
      uid && uid !== '-' && uid !== 'unknown';

    const idToName = {};
    lines.forEach(l => {
      const m = l.text.match(/^\[([^\]\/]+)\.icon\]/);
      if (m && isValidUserId(l.uid)) {
        idToName[l.uid] = m[1];
      }
    });

    /* ===== セッション構造抽出 ===== */

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
      if (/^\[\(/.test(l.text)) {
        cur = {
          id: l.id,
          title: l.text.replace(/^\[[^\s]+\s*/, '').replace(/\]$/, ''),
          talks: []
        };
        sessions.push(cur);
        return;
      }

      if (isTitleLine(l.text)) {
        if (!cur) {
          cur = { id: l.id, title: '(auto)', talks: [] };
          sessions.push(cur);
        }
        cur.talks.push({ id: l.id, title: cleanTitle(l.text) });
      }
    });

    /* ===== パネル ===== */

    const p = document.createElement('div');
    p.id = PANEL_ID;
    p.style = basePanelStyle;
    applyPanelSettings(p);

    renderPageTitle(p, rawLines);

    sessions.forEach(s => {
      const h = document.createElement('div');
      h.textContent = s.title;
      h.style = 'font-weight:bold;margin:6px 0;cursor:pointer';
      h.onclick = () => jump(s.id);
      p.appendChild(h);

      s.talks.forEach(t => {
        const d = document.createElement('div');
        d.textContent = '└ ' + t.title;
        d.style = 'padding-left:14px;cursor:pointer';
        d.onclick = () => jump(t.id);
        p.appendChild(d);
      });
    });

    p.appendChild(document.createElement('hr'));

    /* ===== 統計（共通ロジック） ===== */

    const { stats, idToName: nameMap } = buildTalkStats(rawLines);
    renderTalkStats(p, stats, nameMap);

    document.body.appendChild(p);
  };

  /* ================= TODO LIST ================= */

  const startTodoWatcher = (project, page) => {
    if (todoTimer) clearInterval(todoTimer);

    const run = async () => {
      const j = await fetchPage(project, page);
      if (!j) return;

      renderTodoPanel(project, page, j.lines);
    };

    run(); // 初回即実行
    todoTimer = setInterval(run, 10000);
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
        document.getElementById('__sb_todo_panel__')?.remove();
        return;
      }

      /* ---- パネル再生成 ---- */
      document.getElementById('__sb_todo_panel__')?.remove();

      const p = document.createElement('div');
      p.id = '__sb_todo_panel__';
      p.style =
        'position:fixed;top:10px;right:520px;width:320px;' +
        'max-height:60vh;overflow:auto;' +
        'background:#fff;border:1px solid #ccc;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.25);' +
        'z-index:99999;font:12px/1.4 sans-serif;' +
        'transition:opacity .2s';

      applyPanelSettings(p);

      /* ---- ヘッダ（残り / 全体） ---- */
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

      /* ---- DOM生成 ---- */
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

      // 初期表示：未完了 TODO のみ先頭 N 件
      activeItems.forEach((x, i) => {
        x.dom.style.display = i < TODOSHOW ? '' : 'none';
      });
      doneItems.forEach(x => {
        x.dom.style.display = 'none';
      });

      /* ---- 他 N 件 ---- */
      const rest = Math.max(0, activeItems.length - TODOSHOW);
      let moreLine = null;

      if (rest > 0) {
        moreLine = document.createElement('div');
        moreLine.textContent = `… 他 ${rest} 件`;
        moreLine.style =
          'padding:4px 6px;font-size:11px;color:#666';
        list.appendChild(moreLine);
      }

      /* ---- hover：全件表示 ---- */
      p.addEventListener('mouseenter', () => {
        items.forEach(x => {
          x.dom.style.display = '';
        });
        if (moreLine) moreLine.style.display = 'none';
      });

      /* ---- mouseleave：初期状態に戻す ---- */
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

    rawLines.forEach(l => {
      const text = (l.text || '').trim();
      const uid = l.userId || l.createdBy || l.updatedBy || 'unknown';

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


  /* ================= 論文紹介パネル =============== */

  const renderPaperPanelFromLines = (project, page, rawLines) => {
    // ===== 前処理 =====
    const lines = rawLines.map(l => ({
      id: l.id,
      text: (l.text || '').trim()
    }));

    let title = null;
    let titleId = null;
    let abstractId = null;
    let qnaId = null;

    const questions = [];
    const seenQuestionIds = new Set();

    // 質問・コメントセクション判定
    let inQnASection = false;

    // ===== ヘルパー：質問者探索 =====
    const findQuestionAuthor = (idx) => {
      for (let i = idx - 1; i >= 0; i--) {
        const t = lines[i].text;

        // icon 行
        const m = t.match(/^\[([^\]\/]+)\.icon\]/);
        if (m) return m[1];

        // セクション見出しまで来たら打ち切り
        if (/^\[\*{2,3}\s/.test(t)) break;
      }
      return null;
    };

    // ===== 1パス解析 =====
    lines.forEach((l, idx) => {
      const t = l.text;

      // タイトル（最初の非 [] 行）
      if (!title && t && !t.startsWith('[')) {
        title = t;
        titleId = l.id;
        return;
      }

      if (t === '[*** 概要]') {
        abstractId = l.id;
        return;
      }

      if (t === '[*** 質問・コメント]') {
        qnaId = l.id;
        inQnASection = true;
        return;
      }

      // 次の大見出しが来たら質問セクション終了
      if (inQnASection && /^\[\*{3}\s/.test(t)) {
        inQnASection = false;
        return;
      }

      // ===== 質問抽出 =====
      if (inQnASection && /^\?\s/.test(t)) {
        if (seenQuestionIds.has(l.id)) return;
        seenQuestionIds.add(l.id);

        const author = findQuestionAuthor(idx);
        questions.push({
          id: l.id,
          author,
          text: t.replace(/^\?\s*/, '')
        });
      }
    });

    // ===== UI生成 =====
    const p = document.createElement('div');
    p.id = PANEL_ID;
    p.style = basePanelStyle + 'width:520px;max-height:80vh;';
    applyPanelSettings(p);

    // --- タイトル ---
    if (title) {
      const h = document.createElement('div');
      h.textContent = '📄 ' + title;
      h.style =
        'font-weight:bold;font-size:14px;cursor:pointer;margin-bottom:6px';
      h.onclick = () => jump(titleId);
      p.appendChild(h);
    }

    // --- ジャンプ ---
    const jumpLine = (label, id) => {
      if (!id) return;
      const d = document.createElement('div');
      d.textContent = label;
      d.style = 'cursor:pointer;color:#1565c0;margin:2px 0';
      d.onclick = () => jump(id);
      p.appendChild(d);
    };

    jumpLine('🔎 概要へ', abstractId);
    jumpLine('💬 質問・コメントへ', qnaId);

    p.appendChild(document.createElement('hr'));

    // --- 質問表示 ---
    if (questions.length) {
      const qh = document.createElement('div');
      qh.textContent = `❓ 質問 (${questions.length})`;
      qh.style = 'font-weight:bold;margin:6px 0';
      p.appendChild(qh);

      questions.forEach(q => {
        const d = document.createElement('div');
        d.textContent =
          '・' +
          (q.author ? `${q.author}: ` : '?: ') +
          q.text;
        d.style =
          'cursor:pointer;padding-left:8px;' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        d.onclick = () => jump(q.id);
        p.appendChild(d);
      });
    }

    p.appendChild(document.createElement('hr'));

    // --- 統計 ---
    const { stats, idToName } = buildTalkStats(rawLines);
    renderTalkStats(p, stats, idToName);

    document.body.appendChild(p);
  };


  /* ================= SPA監視 ================= */

  const renderPaperOrMinutes = async (project, page) => {
    const j = await fetchPage(project, page);
    if (!j) return;

    if (isPaperIntroPage(j.lines)) {
      renderPaperPanelFromLines(project, page, j.lines);
    } else {
      renderMinutesFromLines(project, page, j.lines);
    }
  };


  let lastKey = null;
  const tick = () => {
    const key = location.pathname + location.hash;
    if (key === lastKey) return;
    lastKey = key;

    clearUI();

    const m = location.pathname.match(/^\/([^/]+)(?:\/(.*))?$/);
    if (!m) return;

    const project = m[1];
    const pageRaw = m[2];
    const page = pageRaw && pageRaw.length > 0 ? decodeURIComponent(pageRaw) : null;

    saveHistory(project, page);
    
    // ページ切り替え時
    if (todoTimer) {
      clearInterval(todoTimer);
      todoTimer = null;
    }

    if (!page) {
      renderProjectTop(project);

    } else if (/研究ノート/.test(page)) {
      renderCalendar(project, page);
      startTodoWatcher(project, page);

    } else if (/実験計画書/.test(page)) {
      renderPlan(project, page);

    } else {
      // デフォルトは「中身を見てから判断」
      renderPaperOrMinutes(project, page);
    }

  };

  setInterval(tick, 600);
  tick();
})();
