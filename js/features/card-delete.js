/* ============================================================
   自主删除提议（CardDelete）—— 支持三类：字卡 / Emoji / 表情包
   - 「他」在他本要发包卡的某一轮，以小概率改为提议删除若干条目
   - 三类各自独立、各自一条气泡（字卡一条 / Emoji 一条 / 表情包一条），互不影响
   - 每类独立「每日 1 次上限」：各自用本地日期标记，当天该类占过名额后不再触发
   - 每类各自 1.5% 概率（每次他本要发包卡时判定一次），所以不一定每天都触发
   - 字卡 / Emoji / 表情包：同意 = 物理删除并落盘（不可恢复，气泡完整显示内容让你看清）
   - 表情包走物理删除（此前逻辑禁用因无恢复入口已废弃），与字卡/Emoji 一致
   - 每条气泡独立处理：该气泡内所有项都表态后，他回一句「好，以后有需要了再加回来。」（仅当本气泡至少删了一条）
   - 日期标记刻意不用 milkchat_ 前缀，不进云同步白名单
   - 不做「已提议删除集合」：用户在本地多维表格自行备注
   - 测试：maybePropose() 正常路径；maybePropose('card' / 'emoji' / 'sticker') 可单独强制触发某一类
   ============================================================ */

(function () {
    var PROB = 0.015;              // 每类触发概率（每次他本要发包卡时，对本类判定一次）
    var MAX_PER_BATCH = 5;        // 一次最多提议删除的条数（每类 1~5）
    // 每类独立每日上限：各自一个本地日期标记（刻意不用 milkchat_ 前缀，不进云同步白名单）
    var LAST_DATE_KEYS = {
        card: 'mcCardDeleteCardLastDate',
        emoji: 'mcCardDeleteEmojiLastDate',
        sticker: 'mcCardDeleteStickerLastDate'
    };
    var REPLY_TEXT = '好，以后有需要了再加回来。';

    var LEAD = {
        card: '我想删掉这几条字卡，你看看：',
        emoji: '我想删掉这几个表情，你看看：',
        sticker: '我想删掉这几个表情包，你看看：',
        fallback: '我想删掉这些东西，你看看：'
    };
    var RESOLVED_TEXT = { card: '已删除', emoji: '已删除', sticker: '已删除' };

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
    // 落盘：调用全局 saveData（会保存 customReplies / customEmojis / stickerLibrary 等）
    function saveData() {
        try { if (typeof window.saveData === 'function') { window.saveData(); return; } } catch (e) {}
        try { if (typeof window.throttledSaveData === 'function') { window.throttledSaveData(); return; } } catch (e) {}
    }

    /* ---------- 取各类候选池（均排除已禁用/已屏蔽项，与核心发包逻辑一致） ---------- */

    function getReplyArray() {
        try { if (typeof customReplies !== 'undefined' && Array.isArray(customReplies)) return customReplies; } catch (e) {}
        try { if (Array.isArray(window._customReplies)) return window._customReplies; } catch (e) {}
        return [];
    }
    function cardPool() {
        var pool = getReplyArray().slice();
        var disabled = {};
        try { var raw = localStorage.getItem('disabledReplyItems'); if (raw) (JSON.parse(raw) || []).forEach(function (x) { disabled[x] = true; }); } catch (e) {}
        var groupDisabled = {};
        try { (window.customReplyGroups || []).forEach(function (g) { if (g && g.disabled && Array.isArray(g.items)) g.items.forEach(function (it) { groupDisabled[it] = true; }); }); } catch (e) {}
        return pool
            .filter(function (r) { return !disabled[r] && !groupDisabled[r]; })
            .map(function (r) { return String(r || '').trim(); })
            .filter(Boolean);
    }
    function emojiPool() {
        try {
            var arr = (typeof customEmojis !== 'undefined' && Array.isArray(customEmojis))
                ? customEmojis
                : (Array.isArray(window.customEmojis) ? window.customEmojis : []);
            return arr.slice().map(String).filter(Boolean);
        } catch (e) { return []; }
    }
    function stickerPool() {
        // 表情包走物理删除：池里包含全部（含此前被逻辑禁用的残留），便于一次性清空
        try {
            var arr = (typeof stickerLibrary !== 'undefined' && Array.isArray(stickerLibrary))
                ? stickerLibrary
                : (Array.isArray(window.stickerLibrary) ? window.stickerLibrary : []);
            return arr.slice().filter(Boolean);
        } catch (e) { return []; }
    }

    function pickRandom(arr, n) {
        var copy = arr.slice(), out = [];
        while (out.length < n && copy.length) {
            var i = Math.floor(Math.random() * copy.length);
            out.push(copy.splice(i, 1)[0]);
        }
        return out;
    }

    /* ---------- 删除执行 ---------- */

    function deleteCard(content) {
        try {
            var arr = getReplyArray();
            for (var i = arr.length - 1; i >= 0; i--) { if (arr[i] === content) arr.splice(i, 1); }
            if (Array.isArray(window.customReplyGroups)) {
                window.customReplyGroups.forEach(function (g) {
                    if (g && Array.isArray(g.items)) g.items = g.items.filter(function (it) { return it !== content; });
                });
            }
            saveData();
        } catch (e) { console.warn('[card-delete] 字卡删除失败', e); }
    }
    function deleteEmoji(content) {
        try {
            var arr = (typeof customEmojis !== 'undefined' && Array.isArray(customEmojis))
                ? customEmojis
                : (Array.isArray(window.customEmojis) ? window.customEmojis : null);
            if (arr) {
                for (var i = arr.length - 1; i >= 0; i--) { if (arr[i] === content) arr.splice(i, 1); }
            }
            saveData();
        } catch (e) { console.warn('[card-delete] Emoji 删除失败', e); }
    }
    function deleteSticker(content) {
        try {
            var arr = (typeof stickerLibrary !== 'undefined' && Array.isArray(stickerLibrary))
                ? stickerLibrary
                : (Array.isArray(window.stickerLibrary) ? window.stickerLibrary : null);
            if (arr) {
                for (var i = arr.length - 1; i >= 0; i--) { if (arr[i] === content) arr.splice(i, 1); }
            }
            // 同步从禁用集合移除（若存在），避免死条目残留
            try {
                var raw = localStorage.getItem('disabledStickerItems');
                if (raw) {
                    var set = new Set(JSON.parse(raw));
                    if (set.has(content)) { set.delete(content); localStorage.setItem('disabledStickerItems', JSON.stringify(Array.from(set))); }
                }
            } catch (e) {}
            saveData();
        } catch (e) { console.warn('[card-delete] 表情包删除失败', e); }
    }

    /* ---------- 触发判定 ---------- */

    // 对某一类发一条气泡
    function sendBubble(kind, contents) {
        if (!contents || !contents.length) return;
        var items = contents.map(function (c) { return { kind: kind, content: c }; });
        if (typeof addMessage === 'function') {
            addMessage({
                id: Date.now() + Math.random(),
                sender: partnerName(),
                text: LEAD[kind] || LEAD.fallback,
                timestamp: new Date(),
                status: 'received',
                favorited: false,
                note: null,
                replyTo: null,
                type: 'card-delete',
                items: items
            });
            if (typeof playSound === 'function') playSound('message');
        }
    }

    function maybePropose(forceKind) {
        try {
            var kinds = ['card', 'emoji', 'sticker'];
            var triggeredAny = false;
            for (var ki = 0; ki < kinds.length; ki++) {
                var k = kinds[ki];
                if (forceKind && k !== forceKind) continue;

                var pool = (k === 'card') ? cardPool() : (k === 'emoji') ? emojiPool() : stickerPool();
                if (!pool.length) continue;   // 该类无候选：不占名额，改日自然再 Roll

                if (!forceKind) {
                    var last = '';
                    try { last = localStorage.getItem(LAST_DATE_KEYS[k]) || ''; } catch (e) {}
                    if (last === today()) continue;                 // 今日该类已占过名额（已触发或已 Roll 未中）
                    try { localStorage.setItem(LAST_DATE_KEYS[k], today()); } catch (e) {}  // 占当日名额
                    if (Math.random() >= PROB) continue;            // 本类概率未命中，名额已占，今日不再 Roll
                }

                var n = Math.max(1, Math.min(MAX_PER_BATCH, pool.length, 1 + Math.floor(Math.random() * MAX_PER_BATCH))); // 每类 1~5
                var picked = pickRandom(pool, n);
                sendBubble(k, picked);
                triggeredAny = true;
            }
            return triggeredAny;
        } catch (e) { console.warn('[card-delete] 提议失败', e); return false; }
    }

    /* ---------- 渲染气泡（core.js 的 card-delete 分支会回调这里） ---------- */

    function renderBubbleHTML(msg) {
        if (!msg) return '';
        var items = Array.isArray(msg.items) ? msg.items : [];
        var lead = msg.text ? esc(msg.text) : (LEAD.fallback || '');
        var mid = esc(String(msg.id));
        var html = '<div>' + lead + '</div>';
        if (!items.length) return html;
        html += '<div class="mc-cd-bubble" data-mid="' + mid + '">';
        var idx = 0;
        items.forEach(function (it) {
            var k = it.kind || 'card';
            var content = it.content;
            var inner = (k === 'sticker')
                ? '<img class="mc-cd-stk" src="' + esc(content) + '" alt="[表情包]" onerror="this.style.opacity=0.35;this.alt=\'[图片]\'">'
                : '<div class="mc-cd-text">' + esc(content) + '</div>';
            html += '<div class="mc-cd-row" data-idx="' + idx + '" data-kind="' + k + '" data-content="' + esc(content) + '">' +
                            inner +
                            '<div class="mc-cd-acts">' +
                                '<button class="mc-cd-btn agree" type="button" onclick="window.CardDelete.confirm(\'' + mid + '\',\'' + idx + '\')">同意</button>' +
                                '<button class="mc-cd-btn reject" type="button" onclick="window.CardDelete.reject(\'' + mid + '\',\'' + idx + '\')">不同意</button>' +
                            '</div>' +
                        '</div>';
            idx++;
        });
        html += '</div>';
        return html;
    }

    function findBubble(mid) {
        try { return document.querySelector('.mc-cd-bubble[data-mid="' + String(mid) + '"]'); } catch (e) { return null; }
    }
    function markResolved(bubble, idx, agreed, kind) {
        var row = bubble.querySelector('.mc-cd-row[data-idx="' + idx + '"]');
        if (!row) return;
        row.classList.add('resolved', agreed ? 'agreed' : 'rejected');
        var acts = row.querySelector('.mc-cd-acts');
        if (acts) {
            var label = agreed ? (RESOLVED_TEXT[kind] || '已删除') : '已保留';
            acts.innerHTML = '<span class="mc-cd-state">' + label + '</span>';
        }
    }
    function checkBatchDone(bubble, anyAgreed) {
        var rows = bubble.querySelectorAll('.mc-cd-row');
        if (!rows.length) return;
        var all = true;
        for (var i = 0; i < rows.length; i++) {
            if (!rows[i].classList.contains('resolved')) { all = false; break; }
        }
        if (!all) return;
        if (anyAgreed && !bubble.dataset.replied) {
            bubble.dataset.replied = '1';
            sayReply();
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
        var kind = row.getAttribute('data-kind') || 'card';
        var content = row.getAttribute('data-content');
        if (kind === 'sticker') deleteSticker(content);
        else if (kind === 'emoji') deleteEmoji(content);
        else deleteCard(content);
        markResolved(bubble, idx, true, kind);
        checkBatchDone(bubble, true);
        toast('已删除');
    }
    function reject(mid, idx) {
        var bubble = findBubble(mid);
        if (!bubble) return;
        var row = bubble.querySelector('.mc-cd-row[data-idx="' + idx + '"]');
        if (!row || row.classList.contains('resolved')) return;
        var kind = row.getAttribute('data-kind') || 'card';
        markResolved(bubble, idx, false, kind);
        checkBatchDone(bubble, false);
    }

    window.CardDelete = {
        maybePropose: maybePropose,
        renderBubbleHTML: renderBubbleHTML,
        confirm: confirm,
        reject: reject
    };
})();
