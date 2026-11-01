/* ============================================================
   字卡自删提议（CardDelete）
   - 「他」在他本要发包卡的某一轮，以小概率改为提议删除若干字卡
   - 气泡列出 1~5 条候选字卡，每条独立「同意 / 不同意」；每条确认互不影响
   - 同意：按内容从字卡池（含分组）物理删除并落盘（不可恢复，故气泡完整显示要删的内容让你看清）
   - 整批处理完后，他只回一句「好，以后有需要了再加回来。」（仅当本批至少删了一条）
   - 每日上限 1 次：本地日期标记（刻意不用 milkchat_ 前缀，不进云同步白名单）
   - 不做「已提议删除集合」：用户在本地多维表格自行备注
   ============================================================ */

(function () {
    var PROB = 0.015;              // 触发概率（每次他本要发包卡时）
    var MAX_PER_BATCH = 5;        // 一次最多提议删除的条数
    var LAST_DATE_KEY = 'mcCardDeleteLastDate';  // 本地日期标记，控制每日 1 次
    var REPLY_TEXT = '好，以后有需要了再加回来。';

    function today() {
        var d = new Date();
        var p = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
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
    function saveData() {
        try { if (typeof saveData === 'function') return; } catch (e) {}
        try { if (typeof window.saveData === 'function') window.saveData(); } catch (e) {}
    }

    /* 取当前活的字卡数组（优先裸 global，回退到 window._customReplies） */
    function getReplyArray() {
        try { if (typeof customReplies !== 'undefined' && Array.isArray(customReplies)) return customReplies; } catch (e) {}
        try { if (Array.isArray(window._customReplies)) return window._customReplies; } catch (e) {}
        return [];
    }

    /* 排除被禁用条目（disabledReplyItems + 被禁用的分组），与核心发包卡逻辑一致 */
    function availablePool() {
        var pool = getReplyArray().slice();
        var disabled = {};
        try {
            var raw = localStorage.getItem('disabledReplyItems');
            if (raw) (JSON.parse(raw) || []).forEach(function (x) { disabled[x] = true; });
        } catch (e) {}
        var groupDisabled = {};
        try {
            (window.customReplyGroups || []).forEach(function (g) {
                if (g && g.disabled && Array.isArray(g.items)) g.items.forEach(function (it) { groupDisabled[it] = true; });
            });
        } catch (e) {}
        return pool
            .filter(function (r) { return !disabled[r] && !groupDisabled[r]; })
            .map(function (r) { return String(r || '').trim(); })
            .filter(Boolean);
    }

    function pickRandom(arr, n) {
        var copy = arr.slice(), out = [];
        while (out.length < n && copy.length) {
            var i = Math.floor(Math.random() * copy.length);
            out.push(copy.splice(i, 1)[0]);
        }
        return out;
    }

    /* 实际删除：按内容从字卡池（含分组）移除并落盘 */
    function deleteCard(content) {
        try {
            var arr = getReplyArray();
            for (var i = arr.length - 1; i >= 0; i--) {
                if (arr[i] === content) arr.splice(i, 1);
            }
            if (Array.isArray(window.customReplyGroups)) {
                window.customReplyGroups.forEach(function (g) {
                    if (g && Array.isArray(g.items)) g.items = g.items.filter(function (it) { return it !== content; });
                });
            }
            if (typeof saveData === 'function') saveData();
        } catch (e) { console.warn('[card-delete] 删除失败', e); }
    }

    /* 触发判定：命中则发提议气泡并 return true（调用方应跳过本轮正常发包卡） */
    function maybePropose() {
        try {
            // 每日上限 1 次
            var last = '';
            try { last = localStorage.getItem(LAST_DATE_KEY) || ''; } catch (e) {}
            if (last === today()) return false;
            // 概率
            if (Math.random() >= PROB) return false;
            var pool = availablePool();
            if (!pool.length) return false;
            var n = Math.max(1, Math.min(MAX_PER_BATCH, 1 + Math.floor(Math.random() * MAX_PER_BATCH))); // 1~5
            var chosen = pickRandom(pool, n);
            // 标记今日已触发（先标记，避免本轮之后重复）
            try { localStorage.setItem(LAST_DATE_KEY, today()); } catch (e) {}
            // 发气泡
            if (typeof addMessage === 'function') {
                addMessage({
                    id: Date.now() + Math.random(),
                    sender: partnerName(),
                    text: '我想删掉这几条字卡，你看看：',
                    timestamp: new Date(),
                    status: 'received',
                    favorited: false,
                    note: null,
                    replyTo: null,
                    type: 'card-delete',
                    cards: chosen
                });
                if (typeof playSound === 'function') playSound('message');
            }
            return true;
        } catch (e) { console.warn('[card-delete] 提议失败', e); return false; }
    }

    /* 渲染气泡（core.js 的 card-delete 分支会回调这里） */
    function renderBubbleHTML(msg) {
        if (!msg) return '';
        var cards = Array.isArray(msg.cards) ? msg.cards : [];
        var lead = msg.text ? esc(msg.text) : '我想删掉这几条字卡：';
        if (!cards.length) return lead ? '<div>' + lead + '</div>' : '';
        var mid = esc(String(msg.id));
        var rows = cards.map(function (c, i) {
            return '<div class="mc-cd-row" data-idx="' + i + '">' +
                       '<div class="mc-cd-text">' + esc(c) + '</div>' +
                       '<div class="mc-cd-acts">' +
                           '<button class="mc-cd-btn agree" type="button" onclick="window.CardDelete.confirm(\'' + mid + '\',\'' + i + '\')">同意</button>' +
                           '<button class="mc-cd-btn reject" type="button" onclick="window.CardDelete.reject(\'' + mid + '\',\'' + i + '\')">不同意</button>' +
                       '</div>' +
                   '</div>';
        }).join('');
        return '<div>' + lead + '</div><div class="mc-cd-bubble" data-mid="' + mid + '">' + rows + '</div>';
    }

    function findBubble(mid) {
        try { return document.querySelector('.mc-cd-bubble[data-mid="' + String(mid) + '"]'); } catch (e) { return null; }
    }
    function markResolved(bubble, idx, agreed) {
        var row = bubble.querySelector('.mc-cd-row[data-idx="' + idx + '"]');
        if (!row) return;
        row.classList.add('resolved', agreed ? 'agreed' : 'rejected');
        var acts = row.querySelector('.mc-cd-acts');
        if (acts) acts.innerHTML = '<span class="mc-cd-state">' + (agreed ? '已删除' : '已保留') + '</span>';
    }
    function checkBatchDone(bubble, agreedThisTime) {
        var rows = bubble.querySelectorAll('.mc-cd-row');
        if (!rows.length) return;
        var all = true, anyAgreed = false;
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (!r.classList.contains('resolved')) { all = false; break; }
            if (r.classList.contains('agreed')) anyAgreed = true;
        }
        if (!all) return;
        if (anyAgreed && !bubble.dataset.replied) {
            bubble.dataset.replied = '1';
            setTimeout(sayReply, 900);
        }
    }
    function _cardDelay() {
        var lo = 3000, hi = 7000;
        try {
            if (typeof settings !== 'undefined') {
                lo = Number(settings.replyDelayMin) || 3000;
                hi = Number(settings.replyDelayMax) || 7000;
            }
        } catch (e) {}
        if (hi < lo) { var t = lo; lo = hi; hi = t; }
        return lo + Math.random() * (hi - lo);
    }
    function sayReply() {
        if (typeof addMessage !== 'function') return;
        var delay = _cardDelay();
        setTimeout(function () {
            addMessage({
                id: Date.now() + Math.random(),
                sender: partnerName(),
                text: REPLY_TEXT,
                timestamp: new Date(),
                status: 'received',
                favorited: false,
                note: null,
                replyTo: null,
                type: 'normal'
            });
            if (typeof playSound === 'function') playSound('message');
        }, delay);
    }

    function confirm(mid, idx) {
        var bubble = findBubble(mid);
        if (!bubble) return;
        var row = bubble.querySelector('.mc-cd-row[data-idx="' + idx + '"]');
        if (!row || row.classList.contains('resolved')) return;
        var content = row.getAttribute('data-content');
        deleteCard(content);
        markResolved(bubble, idx, true);
        checkBatchDone(bubble, true);
        toast('已删除该字卡');
    }
    function reject(mid, idx) {
        var bubble = findBubble(mid);
        if (!bubble) return;
        var row = bubble.querySelector('.mc-cd-row[data-idx="' + idx + '"]');
        if (!row || row.classList.contains('resolved')) return;
        markResolved(bubble, idx, false);
        checkBatchDone(bubble, false);
    }

    window.CardDelete = {
        maybePropose: maybePropose,
        renderBubbleHTML: renderBubbleHTML,
        confirm: confirm,
        reject: reject
    };
})();
