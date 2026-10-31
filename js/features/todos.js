/* ============================================================
   待办清单（Todo）
   - 今日 / 明日 / 逾期 三类，打开时各发一张「清单消息」（一条消息里多行，每行一个勾）
   - 待办的「完成」是「事情做完了」，不绑定具体某天，所以勾选永远有效，随时可勾可撤销
   - 没做完的事顺延：date < 今天 且未完成 -> 显示「挂了 N 天」，他每天会提一句
   - 面板里分组展示（今日 / 明日 / 逾期 / 已完成），面板和气泡都能勾，改同一份数据
   - 结算靠「打开时结算 + 每分钟巡检」，不需要后台；页面开着跨过午夜也能重新归队
   - 存储键 milkchat_todo_v1；前缀 milkchat_todo_ 已在云同步白名单挂号
   ============================================================ */

(function () {
    var STORE_KEY = 'milkchat_todo_v1';
    var store = { todos: [], todayLog: {}, overdueLog: {}, tomorrowLog: {} };
    var editingId = null;

    var CHECK_SVG = '<svg width="12" height="12" viewBox="0 0 12 12">' +
        '<path d="M2 6.2L4.6 8.8L10 3.2" stroke="#fff" stroke-width="1.8" fill="none" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /* ---------- 日期 ---------- */
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function today() { return ymd(new Date()); }
    function shiftDay(str, n) {
        var d = new Date(str + 'T00:00:00');
        if (isNaN(d.getTime())) return str;
        d.setDate(d.getDate() + n);
        return ymd(d);
    }
    function tomorrow() { return shiftDay(today(), 1); }
    function dayDiff(aStr, bStr) {
        var a = new Date(aStr + 'T00:00:00');
        var b = new Date(bStr + 'T00:00:00');
        if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
        return Math.round((b.getTime() - a.getTime()) / 86400000);
    }

    /* ---------- 存取 ---------- */
    function load() {
        try {
            var raw = localStorage.getItem(STORE_KEY);
            if (raw) {
                var o = JSON.parse(raw);
                store.todos = Array.isArray(o.todos) ? o.todos : [];
                store.todayLog = o.todayLog || {};
                store.overdueLog = o.overdueLog || {};
                store.tomorrowLog = o.tomorrowLog || {};
            }
        } catch (e) {}
        var now = today();
        store.todos.forEach(function (t) {
            if (!t || typeof t !== 'object') return;
            if (!t.id) t.id = 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            if (typeof t.text !== 'string') t.text = '';
            if (!t.date) t.date = now;
            if (typeof t.done !== 'boolean') t.done = false;
            if (!t.doneAt) t.doneAt = null;
            if (!t.createdAt) t.createdAt = now;
        });
    }
    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
    }
    function findTodo(id) {
        for (var i = 0; i < store.todos.length; i++) { if (store.todos[i].id === id) return store.todos[i]; }
        return null;
    }

    /* ---------- 派生状态 ---------- */
    function isToday(t) { return t.date === today(); }
    function isTomorrow(t) { return t.date === tomorrow(); }
    /* 逾期：目标日已过且没做完。注意用字符串比较（同格式 YYYY-MM-DD 可直接比） */
    function isOverdue(t) { return t.date < today() && !t.done; }
    function overdueDays(t) { return isOverdue(t) ? dayDiff(t.date, today()) : 0; }

    function partnerName() {
        try { return (typeof settings !== 'undefined' && settings.partnerName) || '对方'; } catch (e) { return '对方'; }
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function toast(msg) {
        try { if (typeof showNotification === 'function') showNotification(msg, 'info', 2000); } catch (e) {}
    }
    function fmtDate(d) {
        if (d === today()) return '今天';
        if (d === tomorrow()) return '明天';
        return d.slice(5).replace('-', '-');
    }

    /* ---------- 让他开口 ---------- */
    function sayList(todos, kind) {
        if (!todos.length) return;
        var lead = kind === 'today' ? '今日还有这些没做呢：'
                 : kind === 'overdue' ? '你还有几件事没办：'
                 : '明天记得做这些：';
        try {
            if (typeof addMessage !== 'function') return;
            addMessage({
                id: Date.now() + Math.random(),
                sender: partnerName(),
                text: lead,
                timestamp: new Date(),
                status: 'received',
                favorited: false,
                note: null,
                replyTo: null,
                type: 'todo',
                todoKind: kind,
                todoIds: todos.map(function (t) { return t.id; })
            });
            if (typeof playSound === 'function') playSound('message');
        } catch (e) { console.warn('[todos] 发清单失败:', e); }
    }

    /* 字卡：规则照抄 habits.js（复用主聊天「回复库·主字卡」，排除被屏蔽条目）。
       勾选成功的回应走普通消息（type:'normal'），不带勾选按钮。 */
    function myName() {
        try { return (typeof settings !== 'undefined' && settings.userName) || '你'; } catch (e) { return '你'; }
    }
    function fill(tpl) {
        return String(tpl || '').replace(/\{partner\}/g, partnerName()).replace(/\{me\}/g, myName());
    }
    function cardPool() {
        var raw = null;
        try { if (Array.isArray(window._customReplies) && window._customReplies.length) raw = window._customReplies; } catch (e) {}
        if (!raw) return [];
        var disabled = {};
        try {
            var d = localStorage.getItem('disabledReplyItems');
            if (d) (JSON.parse(d) || []).forEach(function (x) { disabled[x] = true; });
        } catch (e) {}
        try {
            (window.customReplyGroups || []).forEach(function (g) {
                if (g && g.disabled && Array.isArray(g.items)) {
                    g.items.forEach(function (it) { disabled[it] = true; });
                }
            });
        } catch (e) {}
        return raw
            .filter(function (r) { return !disabled[r]; })
            .map(function (r) { return String(r || '').trim(); })
            .filter(Boolean);
    }
    function say(text) {
        try {
            if (typeof addMessage !== 'function') return;
            addMessage({
                id: Date.now() + Math.random(),
                sender: partnerName(),
                text: text,
                timestamp: new Date(),
                status: 'received',
                favorited: false,
                note: null,
                replyTo: null,
                type: 'normal'
            });
            if (typeof playSound === 'function') playSound('message');
        } catch (e) { console.warn('[todos] 发消息失败:', e); }
    }
    /* 字卡节奏跟随聊天设置里的 replyDelayMin~Max，与他回一句话的时间感一致 */
    function _cardDelay() {
        var lo = 3000, hi = 7000;
        try {
            if (typeof settings !== 'undefined') {
                lo = Number(settings.replyDelayMin) || 3000;
                hi = Number(settings.replyDelayMax) || 7000;
            }
        } catch (e) {}
        if (hi < lo) { var tmp = lo; lo = hi; hi = tmp; }
        return lo + Math.random() * (hi - lo);
    }
    function sayCard(delay) {
        var pool = cardPool();
        if (!pool.length) return;
        var pick = fill(pool[Math.floor(Math.random() * pool.length)]);
        setTimeout(function () { say(pick); }, delay);
    }

    /* ---------- 结算 ---------- */
    var settling = false;
    var lastSettleDay = '';
    function settle() {
        if (settling) return;
        settling = true;
        try {
            var t = today();
            // 页面开着跨过零点：气泡里「挂了 N 天」要重新算，过期的清单含义也变了
            if (lastSettleDay && lastSettleDay !== t) refreshAllBubbles();
            lastSettleDay = t;

            var todayTodos = [], odTodos = [], tmTodos = [];
            store.todos.forEach(function (it) {
                if (it.done) return;
                if (isToday(it)) todayTodos.push(it);
                else if (isTomorrow(it)) tmTodos.push(it);
                else if (isOverdue(it)) odTodos.push(it);
            });

            var changed = false;
            if (todayTodos.length && !store.todayLog[t]) {
                store.todayLog[t] = true; changed = true; sayList(todayTodos, 'today');
            }
            if (odTodos.length && !store.overdueLog[t]) {
                store.overdueLog[t] = true; changed = true; sayList(odTodos, 'overdue');
            }
            if (tmTodos.length && !store.tomorrowLog[t]) {
                store.tomorrowLog[t] = true; changed = true; sayList(tmTodos, 'tomorrow');
            }
            if (changed) save();
        } catch (e) { console.warn('[todos] 结算异常:', e); }
        settling = false;
    }

    /* ---------- 气泡渲染（core.js 的 todo 分支会回调这里） ---------- */
    function rowHTML(t, done, odDays, kind) {
        var oc = ' onclick="window.Todos.toggleFromBubble(\'' + esc(t.id) + '\')"';
        return '<div class="mc-todo-bubble-row" data-kind="' + esc(kind || 'today') + '" data-todo="' + esc(t.id) + '">' +
                   '<div class="mc-todo-bubble-check' + (done ? ' done' : '') + '"' + oc + '>' + CHECK_SVG + '</div>' +
                   '<span class="mc-todo-bubble-text' + (done ? ' done' : '') + '">' + esc(t.text) + '</span>' +
                   (odDays > 0 ? '<span class="mc-todo-bubble-od">挂了 ' + odDays + ' 天</span>' : '') +
               '</div>';
    }
    function renderBubbleHTML(msg) {
        if (!msg) return '';
        var lead = msg.text ? esc(msg.text) : '';
        var kind = msg.todoKind || 'today';
        var ids = Array.isArray(msg.todoIds) ? msg.todoIds : [];
        var rows = ids.map(function (id) {
            var t = findTodo(id);
            if (!t) return '';                       // 待办被删了，跳过这一行
            return rowHTML(t, t.done, kind === 'overdue' ? overdueDays(t) : 0, kind);
        }).join('');
        if (!rows) return lead ? '<div>' + lead + '</div>' : '';
        return '<div>' + lead + '</div><div class="mc-todo-bubble">' + rows + '</div>';
    }

    /* 勾选后只改气泡里该 todo 的视觉，不走全量重渲染（会打断聊天位置） */
    function paintRow(row, t, kind) {
        if (!row) return;
        var check = row.querySelector('.mc-todo-bubble-check');
        var txt = row.querySelector('.mc-todo-bubble-text');
        var od = row.querySelector('.mc-todo-bubble-od');
        if (check) check.className = 'mc-todo-bubble-check' + (t.done ? ' done' : '');
        if (txt) txt.className = 'mc-todo-bubble-text' + (t.done ? ' done' : '');
        if (od) od.parentNode.removeChild(od);
        if (!t.done && kind === 'overdue') {
            var n = overdueDays(t);
            if (n > 0) {
                var sp = document.createElement('span');
                sp.className = 'mc-todo-bubble-od';
                sp.textContent = '挂了 ' + n + ' 天';
                row.appendChild(sp);
            }
        }
    }
    function updateBubbles(id) {
        var t = findTodo(id);
        var nodes = document.querySelectorAll('.mc-todo-bubble-check[data-todo="' + id + '"]');
        Array.prototype.forEach.call(nodes, function (check) {
            var row = check.closest('.mc-todo-bubble-row');
            paintRow(row, t, row ? row.getAttribute('data-kind') : 'today');
        });
    }
    function refreshAllBubbles() {
        var rows = document.querySelectorAll('.mc-todo-bubble-row');
        Array.prototype.forEach.call(rows, function (row) {
            var t = findTodo(row.getAttribute('data-todo'));
            if (!t) { row.style.display = 'none'; return; }
            paintRow(row, t, row.getAttribute('data-kind') || 'today');
        });
    }

    function toggle(id) {
        var t = findTodo(id);
        if (!t) return;
        var wasDone = t.done;
        t.done = !t.done;
        t.doneAt = t.done ? today() : null;
        save();
        updateBubbles(id);
        if (typeof renderPanelSafe === 'function') renderPanelSafe();
        toast(t.done ? '已做完' : '已撤销');
        if (!wasDone && t.done) sayCard(_cardDelay());   // 刚做完那刻，他回一句
    }
    function toggleFromBubble(id) { toggle(id); }

    /* ---------- 面板 ---------- */
    function el(id) { return document.getElementById(id); }

    function ensureDOM() {
        if (el('mcTodosOverlay')) return;
        var wrap = document.createElement('div');
        wrap.id = 'mcTodosOverlay';
        wrap.className = 'mc-todos-overlay';
        wrap.innerHTML =
            '<div class="mc-todos-panel" id="mcTodosPanel">' +
                '<div class="mc-todos-head">' +
                    '<span class="mc-todos-title">✦ 待办清单</span>' +
                    '<button class="mc-todos-close" id="mcTodosClose" type="button" aria-label="关闭">✕</button>' +
                '</div>' +
                '<div class="mc-todos-body" id="mcTodosBody"></div>' +
            '</div>';
        document.body.appendChild(wrap);
        wrap.addEventListener('click', function (e) { if (e.target === wrap) closePanel(); });
        el('mcTodosClose').addEventListener('click', closePanel);
        el('mcTodosBody').addEventListener('click', onBodyClick);
    }

    function panelRow(t) {
        var done = t.done;
        var od = isOverdue(t) ? overdueDays(t) : 0;
        var dateLabel = done
            ? ('完成于 ' + (t.doneAt ? fmtDate(t.doneAt) : '今天'))
            : (od > 0 ? '<span class="mc-todo-date overdue">挂了 ' + od + ' 天</span>'
                      : '<span class="mc-todo-date">' + fmtDate(t.date) + '</span>');
        return '<div class="mc-todo-row' + (done ? ' done' : '') + '">' +
                   '<div class="mc-todo-check' + (done ? ' done' : '') + '" data-act="toggle" data-id="' + esc(t.id) + '">' + CHECK_SVG + '</div>' +
                   '<div class="mc-todo-text' + (done ? ' done' : '') + '">' + esc(t.text) + '</div>' +
                   dateLabel +
                   '<div class="mc-todo-op">' +
                       '<button class="mc-todo-btn" data-act="edit" data-id="' + esc(t.id) + '">改</button>' +
                       '<button class="mc-todo-btn" data-act="del" data-id="' + esc(t.id) + '">删</button>' +
                   '</div>' +
               '</div>';
    }
    function group(title, list) {
        if (!list.length) {
            return '<div class="mc-todos-group-title">' + title + '</div>' +
                   '<div class="mc-todos-group empty">空</div>';
        }
        return '<div class="mc-todos-group-title">' + title + '（' + list.length + '）</div>' +
               '<div class="mc-todos-group">' + list.map(panelRow).join('') + '</div>';
    }

    function render() {
        var body = el('mcTodosBody');
        if (!body) return;
        var todayList = [], tmList = [], odList = [], doneList = [];
        store.todos.forEach(function (t) {
            if (t.done) doneList.push(t);
            else if (isToday(t)) todayList.push(t);
            else if (isTomorrow(t)) tmList.push(t);
            else if (isOverdue(t)) odList.push(t);
        });
        // 逾期按挂得久的排前；已完成按完成日倒序
        odList.sort(function (a, b) { return overdueDays(b) - overdueDays(a); });
        doneList.sort(function (a, b) { return (b.doneAt || '').localeCompare(a.doneAt || ''); });

        var pending = store.todos.filter(function (t) { return !t.done; }).length;
        var html = '<div class="mc-todos-group-title" style="margin-top:0;">待办 ' + pending +
                   ' 项 · 逾期 ' + odList.length + ' 项</div>';

        html += group('今日', todayList);
        html += group('明日', tmList);
        html += group('逾期', odList);

        var ed = editingId ? findTodo(editingId) : null;
        html += '<div class="mc-todo-form">' +
                    '<div class="mc-todo-field">' +
                        '<label>事项</label>' +
                        '<input class="mc-todo-input" id="mcTodoText" value="' + esc(ed ? ed.text : '') + '" placeholder="比如：交周报">' +
                    '</div>' +
                    '<div class="mc-todo-field">' +
                        '<label>目标日</label>' +
                        '<input class="mc-todo-input" id="mcTodoDate" type="date" value="' + esc(ed ? ed.date : today()) + '">' +
                    '</div>' +
                    '<div class="mc-todo-actions">' +
                        (ed ? '<button class="mc-todo-ghost" data-act="cancel">取消</button>' : '') +
                        '<button class="mc-todo-primary" data-act="save">' + (ed ? '保存' : '添加') + '</button>' +
                    '</div>' +
                '</div>';

        html += group('已完成', doneList);
        html += '<div class="mc-todos-tip">这里记录与勾选；他会在打开时按今日 / 明日 / 逾期各提醒一次。</div>';
        body.innerHTML = html;
    }
    function renderPanelSafe() {
        if (el('mcTodosOverlay') && el('mcTodosOverlay').classList.contains('active')) render();
    }

    function onBodyClick(e) {
        var actNode = e.target.closest ? e.target.closest('[data-act]') : null;
        if (!actNode) return;
        var a = actNode.getAttribute('data-act');
        var id = actNode.getAttribute('data-id');
        var t = id ? findTodo(id) : null;

        if (a === 'toggle' && t) {
            toggle(t.id);
            return;
        }
        if (a === 'edit' && t) {
            editingId = id;
            render();
            return;
        }
        if (a === 'cancel') {
            editingId = null;
            render();
            return;
        }
        if (a === 'del' && t) {
            if (!confirm('删除待办「' + t.text + '」？')) return;
            store.todos = store.todos.filter(function (x) { return x.id !== id; });
            if (editingId === id) editingId = null;
            save();
            render();
            return;
        }
        if (a === 'save') {
            var textEl = el('mcTodoText'), dateEl = el('mcTodoDate');
            var text = textEl ? String(textEl.value || '').trim() : '';
            var date = dateEl ? String(dateEl.value || '').trim() : today();
            if (!text) { toast('先写点什么'); return; }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = today();
            if (editingId) {
                var target = findTodo(editingId);
                if (target) { target.text = text; target.date = date; }
                editingId = null;
            } else {
                store.todos.push({
                    id: 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                    text: text,
                    date: date,
                    done: false,
                    doneAt: null,
                    createdAt: today()
                });
            }
            save();
            render();
            return;
        }
    }

    function openPanel() {
        ensureDOM();
        render();
        var ov = el('mcTodosOverlay');
        if (ov) ov.classList.add('active');
    }
    function closePanel() {
        var ov = el('mcTodosOverlay');
        if (ov) ov.classList.remove('active');
    }

    /* ---------- 启动 ---------- */
    function boot() {
        load();
        setTimeout(settle, 4000);          // 开屏动画结束后再结算
        setInterval(settle, 60000);       // 每分钟巡检：跨过午夜能重新归队
    }

    window.Todos = {
        openPanel: openPanel,
        closePanel: closePanel,
        settle: settle,
        renderBubbleHTML: renderBubbleHTML,
        toggleFromBubble: toggleFromBubble,
        getTodos: function () { return store.todos; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            boot();
            if (window.MoreMenu && typeof window.MoreMenu.registerItem === 'function') {
                window.MoreMenu.registerItem('todos', { ready: true, action: openPanel });
            }
        });
    } else {
        boot();
        if (window.MoreMenu && typeof window.MoreMenu.registerItem === 'function') {
            window.MoreMenu.registerItem('todos', { ready: true, action: openPanel });
        }
    }
})();
