/* ============================================================
   习惯打卡（Habit）
   - 面板只做记录与统计（增删改 / 连续天数）；打卡在他提醒的那条气泡上
   - 打卡记录只存 history（日期串数组），连续天数与统计全部派生，不冗余存
   - 打卡只对当天有效：过了零点就封存，没打就是漏了，不许第二天补
   - 每天每个习惯最多：提醒一次 + 漏打卡补说一次；两者撞在同一时刻就合并成一句
   - 提醒靠"打开时结算 + 每分钟巡检"，不需要后台；页面开着跨过设定时间也能准时说
   ============================================================ */

(function () {
    var STORE_KEY = 'milkchat_habit_v1';
    var store = { habits: [], remindLog: {}, missLog: {} };
    var editingId = null;

    /* ---------- 日期 ---------- */
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function today() { return ymd(new Date()); }
    function dayDiff(aStr, bStr) {
        var a = new Date(aStr + 'T00:00:00');
        var b = new Date(bStr + 'T00:00:00');
        if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
        return Math.round((b.getTime() - a.getTime()) / 86400000);
    }
    function shiftDay(str, n) {
        var d = new Date(str + 'T00:00:00');
        if (isNaN(d.getTime())) return str;
        d.setDate(d.getDate() + n);
        return ymd(d);
    }
    function dueAt(hhmm) {
        var p = String(hhmm || '21:00').split(':');
        var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
        if (isNaN(h)) h = 21;
        if (isNaN(m)) m = 0;
        var d = new Date();
        d.setHours(h, m, 0, 0);
        return d;
    }
    function isDue(hhmm) { return Date.now() >= dueAt(hhmm).getTime(); }

    /* ---------- 存取 ---------- */
    function load() {
        try {
            var raw = localStorage.getItem(STORE_KEY);
            if (raw) {
                var o = JSON.parse(raw);
                store.habits = Array.isArray(o.habits) ? o.habits : [];
                store.remindLog = o.remindLog || {};
                store.missLog = o.missLog || {};
            }
        } catch (e) {}
        store.habits.forEach(function (h) {
            if (!Array.isArray(h.history)) h.history = [];
            if (typeof h.enabled !== 'boolean') h.enabled = true;
            if (!h.time) h.time = '21:00';
            if (!h.id) h.id = 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        });
    }
    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
    }
    function findHabit(id) {
        for (var i = 0; i < store.habits.length; i++) { if (store.habits[i].id === id) return store.habits[i]; }
        return null;
    }

    /* ---------- 派生状态 ---------- */
    function lastDate(h) {
        var max = '';
        (h.history || []).forEach(function (d) { if (d > max) max = d; });
        return max || '';
    }
    function doneOn(h, day) { return (h.history || []).indexOf(day) !== -1; }
    /* 连续天数：今天打了从今天数；今天没打但昨天连着，也还没断（今天可能还没到点） */
    function streak(h) {
        var t = today();
        var start = doneOn(h, t) ? t : (doneOn(h, shiftDay(t, -1)) ? shiftDay(t, -1) : '');
        if (!start) return 0;
        var n = 0, cur = start;
        while (doneOn(h, cur)) { n++; cur = shiftDay(cur, -1); }
        return n;
    }
    function weekCount(h) {
        var t = today(), n = 0;
        for (var i = 0; i < 7; i++) { if (doneOn(h, shiftDay(t, -i))) n++; }
        return n;
    }

    /* ---------- 让他开口 ---------- */
    function partnerName() {
        try { return (typeof settings !== 'undefined' && settings.partnerName) || '对方'; } catch (e) { return '对方'; }
    }
    function myName() {
        try { return (typeof settings !== 'undefined' && settings.myName) || '我'; } catch (e) { return '我'; }
    }
    function fill(tpl) {
        return String(tpl || '').replace(/\{partner\}/g, partnerName()).replace(/\{me\}/g, myName());
    }

    /* 字卡池：规则照抄 actions.js:282（复用主聊天的「回复库 · 主字卡」，排除被屏蔽条目） */
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

    /* addMessage 是 core.js 顶层 const，全局词法作用域可见，这里直接调。
       带 habitId 时发成 type:'habit'，气泡由 renderBubbleHTML 自己渲染（打卡按钮在那里面）；
       不带就是普通消息——字卡那句走这条路，情话不该挂打卡按钮。 */
    function say(text, habitId) {
        try {
            if (typeof addMessage !== 'function') return;
            var m = {
                id: Date.now() + Math.random(),
                sender: partnerName(),
                text: text,
                timestamp: new Date(),
                status: 'received',
                favorited: false,
                note: null,
                replyTo: null,
                type: habitId ? 'habit' : 'normal'
            };
            // 按钮打的是「发出这条提醒的那天」，所以昨天的提醒点一下补的就是昨天的卡
            if (habitId) { m.habitId = habitId; m.habitDate = today(); }
            addMessage(m);
            if (typeof playSound === 'function') playSound('message');
        } catch (e) { console.warn('[habits] 发消息失败:', e); }
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
            // 页面开着跨过零点：昨天遗留的「打卡」按钮作废，改显示「已错过」
            if (lastSettleDay && lastSettleDay !== t) refreshAllBubbles();
            lastSettleDay = t;
            var changed = false;
            store.habits.forEach(function (h) {
                if (!h.enabled) return;
                if (doneOn(h, t)) return;              // 今天已打卡，什么都不说

                var last = lastDate(h);
                var missed = last ? dayDiff(last, t) - 1 : 0;   // 中间完整漏掉的天数
                var dueNow = isDue(h.time);

                /* 漏卡 + 已到点：本来是两句，合成一句说。
                   否则同一时刻会连发四条（两句提醒 + 两句字卡），太吵。 */
                if (missed >= 1 && dueNow &&
                    store.missLog[h.id] !== t && store.remindLog[h.id] !== t) {
                    store.missLog[h.id] = t;
                    store.remindLog[h.id] = t;
                    changed = true;
                    say('你已经 ' + missed + ' 天没' + h.name + '了——今天别忘了', h.id);
                    return;
                }

                // 漏卡但还没到点：先说漏的这句，到点后由巡检再正经提醒
                if (missed >= 1 && store.missLog[h.id] !== t) {
                    store.missLog[h.id] = t;
                    changed = true;
                    say('你已经 ' + missed + ' 天没' + h.name + '了', h.id);
                }

                // 今日提醒：到点才说，每天每习惯只一条
                if (dueNow && store.remindLog[h.id] !== t) {
                    store.remindLog[h.id] = t;
                    changed = true;
                    say('提醒：' + h.name, h.id);
                }
            });
            if (changed) save();
        } catch (e) { console.warn('[habits] 结算异常:', e); }
        settling = false;
    }

    /* ---------- 面板 ---------- */
    function el(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function toast(msg) {
        try { if (typeof showNotification === 'function') showNotification(msg, 'info', 2000); } catch (e) {}
    }

    /* ---------- 气泡：core.js 的 habit 分支会回调这里 ----------
       按钮只对「今天」有效。过了零点，昨天那条提醒当场封存：打了就是打了，
       没打就是漏了，不许第二天补——否则补一下就能把漏卡天数抹成 0，
       连续天数和「你已经几天没…」都失去意义。
       按钮态从 store 现读，不往消息里存冗余字段，刷新后自然是对的。 */
    function btnState(h, day) {
        if (!h) return { cls: ' missed', label: '已作废', clickable: false };   // 习惯被删了
        var done = doneOn(h, day);
        var sealed = day !== today();          // 不是今天 = 已封存
        if (done) return { cls: ' done', label: '已打卡', clickable: !sealed };  // 只有今天能撤销
        if (sealed) return { cls: ' missed', label: '已错过', clickable: false };
        return { cls: '', label: '打卡', clickable: true };
    }
    function paintBtn(node, h, day) {
        var s = btnState(h, day);
        node.className = 'mc-habit-bubble-btn' + s.cls;
        node.textContent = s.label;
        if (s.clickable && h) {
            node.setAttribute('onclick',
                'window.Habits.toggleFromBubble(\'' + esc(h.id) + '\',\'' + esc(day) + '\')');
        } else {
            node.removeAttribute('onclick');
        }
    }

    function renderBubbleHTML(msg) {
        if (!msg) return '';
        var h = msg.habitId ? findHabit(msg.habitId) : null;
        var text = msg.text ? esc(msg.text) : '';
        if (!h) return text ? '<div>' + text + '</div>' : '';
        var day = msg.habitDate || today();
        var s = btnState(h, day);
        var oc = s.clickable
            ? ' onclick="window.Habits.toggleFromBubble(\'' + esc(h.id) + '\',\'' + esc(day) + '\')"'
            : '';
        return '<div>' + text + '</div>' +
            '<div class="mc-habit-bubble-btn' + s.cls + '"' +
               ' data-habit="' + esc(h.id) + '" data-day="' + esc(day) + '"' + oc +
               '>' + s.label + '</div>';
    }

    /* 打卡后只改按钮这一处 DOM，不走 renderMessages：
       全量重渲染会打断正在看的聊天位置，而消息本身没变，变的只有按钮态 */
    function updateBubbles(habitId, day) {
        var h = findHabit(habitId);
        var els = document.querySelectorAll(
            '.mc-habit-bubble-btn[data-habit="' + habitId + '"][data-day="' + day + '"]');
        Array.prototype.forEach.call(els, function (n) { paintBtn(n, h, day); });
    }

    /* 页面开着跨过零点时：昨天那些还写着「打卡」的按钮当场作废 */
    function refreshAllBubbles() {
        var els = document.querySelectorAll('.mc-habit-bubble-btn');
        Array.prototype.forEach.call(els, function (n) {
            paintBtn(n, findHabit(n.getAttribute('data-habit')), n.getAttribute('data-day'));
        });
    }

    function toggleFromBubble(habitId, day) {
        var h = findHabit(habitId);
        if (!h) return;
        if (day !== today()) { toast('那天的已经结算了，只能打今天的'); return; }
        var i = h.history.indexOf(day);
        var wasDone = i !== -1;
        if (wasDone) h.history.splice(i, 1);
        else h.history.push(day);
        save();
        updateBubbles(habitId, day);
        toast(wasDone ? '已撤销打卡' : '已打卡');
        if (!wasDone) sayCard(_cardDelay());   // 打卡成功那一刻，他回一句
    }

    function ensureDOM() {
        if (el('mcHabitsOverlay')) return;
        var wrap = document.createElement('div');
        wrap.id = 'mcHabitsOverlay';
        wrap.className = 'mc-habits-overlay';
        wrap.innerHTML =
            '<div class="mc-habits-panel" id="mcHabitsPanel">' +
                '<div class="mc-habits-head">' +
                    '<span class="mc-habits-title">✦ 习惯打卡</span>' +
                    '<button class="mc-habits-close" id="mcHabitsClose" type="button" aria-label="关闭">✕</button>' +
                '</div>' +
                '<div class="mc-habits-body" id="mcHabitsBody"></div>' +
            '</div>';
        document.body.appendChild(wrap);
        wrap.addEventListener('click', function (e) { if (e.target === wrap) closePanel(); });
        el('mcHabitsClose').addEventListener('click', closePanel);
        el('mcHabitsBody').addEventListener('click', onBodyClick);
    }

    function statItem(num, label) {
        return '<div class="mc-habits-stat-item">' +
                   '<div class="mc-habits-stat-num">' + esc(num) + '</div>' +
                   '<div class="mc-habits-stat-label">' + esc(label) + '</div>' +
               '</div>';
    }

    function render() {
        var body = el('mcHabitsBody');
        if (!body) return;
        var t = today();
        var total = store.habits.length;
        var doneToday = 0, weekTotal = 0, best = 0;
        store.habits.forEach(function (h) {
            if (doneOn(h, t)) doneToday++;
            weekTotal += weekCount(h);
            var s = streak(h);
            if (s > best) best = s;
        });

        var html = '<div class="mc-habits-stat">' +
                       statItem(doneToday + '/' + total, '今日') +
                       statItem(String(weekTotal), '本周打卡') +
                       statItem(String(best), '最长连续') +
                   '</div>';

        if (!total) {
            html += '<div class="mc-habits-empty">还没有习惯<br>在下面加一个，比如「读书」21:00</div>';
        }

        store.habits.forEach(function (h) {
            var st = streak(h);
            html += '<div class="mc-habit-row' + (h.enabled ? '' : ' off') + '">' +
                        '<div class="mc-habit-main">' +
                            '<div class="mc-habit-name">' + esc(h.name) +
                                (doneOn(h, t) ? '<span class="mc-habit-done-tag">今日已打卡</span>' : '') +
                            '</div>' +
                            '<div class="mc-habit-meta">' + esc(h.time) +
                                (st ? ' · 连续 <span class="streak">' + st + '</span> 天' : ' · 还没开始') +
                            '</div>' +
                        '</div>' +
                        '<div class="mc-habit-op">' +
                            '<button class="mc-habit-btn" data-act="edit" data-id="' + esc(h.id) + '">改</button>' +
                            '<button class="mc-habit-btn" data-act="enable" data-id="' + esc(h.id) + '">' + (h.enabled ? '停' : '启') + '</button>' +
                            '<button class="mc-habit-btn" data-act="del" data-id="' + esc(h.id) + '">删</button>' +
                        '</div>' +
                    '</div>';
        });

        var ed = editingId ? findHabit(editingId) : null;
        html += '<div class="mc-habit-form">' +
                    '<div class="mc-habit-field">' +
                        '<label>名称</label>' +
                        '<input class="mc-habit-input" id="mcHabitName" value="' + esc(ed ? ed.name : '') + '" placeholder="读书">' +
                    '</div>' +
                    '<div class="mc-habit-field">' +
                        '<label>时间</label>' +
                        '<input class="mc-habit-input" id="mcHabitTime" type="time" value="' + esc(ed ? ed.time : '21:00') + '">' +
                    '</div>' +
                    '<div class="mc-habit-actions">' +
                        (ed ? '<button class="mc-habit-ghost" data-act="cancel">取消</button>' : '') +
                        '<button class="mc-habit-primary" data-act="save">' + (ed ? '保存' : '添加') + '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="mc-habits-tip">这里只做记录和统计；打卡在他提醒的那条消息上点「打卡」。</div>';

        body.innerHTML = html;
    }

    function onBodyClick(e) {
        var act = e.target.closest ? e.target.closest('[data-act]') : null;
        if (!act) return;
        var a = act.getAttribute('data-act');
        var id = act.getAttribute('data-id');
        var h = id ? findHabit(id) : null;

        if (a === 'edit' && h) {
            editingId = id;
            render();
            return;
        }
        if (a === 'cancel') {
            editingId = null;
            render();
            return;
        }
        if (a === 'enable' && h) {
            h.enabled = !h.enabled;
            save();
            render();
            return;
        }
        if (a === 'del' && h) {
            if (!confirm('删除习惯「' + h.name + '」？打卡记录会一起删掉。')) return;
            store.habits = store.habits.filter(function (x) { return x.id !== id; });
            if (editingId === id) editingId = null;
            save();
            render();
            return;
        }
        if (a === 'save') {
            var nameEl = el('mcHabitName'), timeEl = el('mcHabitTime');
            var name = nameEl ? String(nameEl.value || '').trim() : '';
            var time = timeEl ? String(timeEl.value || '').trim() : '21:00';
            if (!name) { toast('先给它起个名字'); return; }
            if (!/^\d{1,2}:\d{2}$/.test(time)) time = '21:00';
            if (editingId) {
                var target = findHabit(editingId);
                if (target) { target.name = name; target.time = time; }
                editingId = null;
            } else {
                store.habits.push({
                    id: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                    name: name,
                    time: time,
                    enabled: true,
                    history: []
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
        var ov = el('mcHabitsOverlay');
        if (ov) ov.classList.add('active');
    }
    function closePanel() {
        var ov = el('mcHabitsOverlay');
        if (ov) ov.classList.remove('active');
    }

    /* ---------- 启动 ---------- */
    function boot() {
        load();
        // 开屏动画结束后再结算，别一进站就刷消息
        setTimeout(settle, 4000);
        // 每分钟巡检：页面开着跨过设定时间也能准时提醒
        setInterval(settle, 60000);
    }

    window.Habits = {
        openPanel: openPanel,
        closePanel: closePanel,
        settle: settle,
        renderBubbleHTML: renderBubbleHTML,
        toggleFromBubble: toggleFromBubble,
        getHabits: function () { return store.habits; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            boot();
            if (window.MoreMenu && typeof window.MoreMenu.registerItem === 'function') {
                window.MoreMenu.registerItem('habits', { ready: true, action: openPanel });
            }
        });
    } else {
        boot();
        if (window.MoreMenu && typeof window.MoreMenu.registerItem === 'function') {
            window.MoreMenu.registerItem('habits', { ready: true, action: openPanel });
        }
    }
})();
