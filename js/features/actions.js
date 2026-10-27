/* ============================================================
   动作（Action）—— 配合 css/actions.css
   移植自《暗点专线 N109》的「动作回应」模块，并适配传讯的架构
   ------------------------------------------------------------
   · 动作库：16 个内置动作 + 自定义动作（localStorage）
   · 动作面板：我发起 / 他 发起 / 随机 / 管理
   · 动作消息：居中系统消息（复用 MILK-CHAT 的 .system-message）
   · 动作回应：专属话术池抽一条，由对方回出
   ------------------------------------------------------------
   接入协议：window.MoreMenu.registerItem('actions', { ready, action })
   不依赖任何外部库，不改动 js/core.js
   ============================================================ */
(function () {
    'use strict';

    var STORE_KEY = 'milkchat_custom_actions_v1';
    var REPLY_KEY = 'milkchat_action_replies_v1';
    var SET_KEY   = 'milkchat_action_settings_v1';

    /* ---------- 内置动作库（{partner}=对方名字，{me}=我的名字）---------- */
    var DEFAULT_ACTIONS = [
        { id: 'a1', name: '拥抱', icon: '🫂', type: 'mutual',
          desc: '{partner}紧紧抱住你，下巴抵在你头顶',
          meDesc: '你紧紧抱住{partner}，把脸埋在他胸口', chainTo: 'a10' },
        { id: 'a2', name: '亲吻', icon: '💋', type: 'mutual',
          desc: '{partner}低头吻住你，温柔而霸道',
          meDesc: '你踮起脚尖吻住{partner}，他愣了一下随即加深', chainTo: 'a5' },
        { id: 'a3', name: '摸头', icon: '🤚', type: 'other',
          desc: '{partner}揉了揉你的头发，眼底带笑',
          meDesc: '你伸手揉了揉{partner}的头发，被他捉住手腕' },
        { id: 'a4', name: '牵手', icon: '🤝', type: 'mutual',
          desc: '{partner}握住你的手，十指相扣',
          meDesc: '你主动握住{partner}的手，他收紧手指' },
        { id: 'a5', name: '壁咚', icon: '🧱', type: 'other',
          desc: '{partner}将你困在臂弯里，气息逼近',
          meDesc: '你将{partner}推到墙上，他挑眉看你', chainTo: 'a13' },
        { id: 'a6', name: '投喂', icon: '🍰', type: 'other',
          desc: '{partner}将甜品递到你嘴边，"张嘴"',
          meDesc: '你把甜品递到{partner}嘴边，他张口咬住你的手指', chainTo: 'a2' },
        { id: 'a7', name: '捏脸', icon: '🤏', type: 'other',
          desc: '{partner}捏了捏你的脸，"软软的"',
          meDesc: '你捏了捏{partner}的脸，被他轻轻咬了一口' },
        { id: 'a8', name: '靠肩', icon: '🛋️', type: 'mutual',
          desc: '{partner}拍了拍肩膀，"靠过来，不用犹豫"',
          meDesc: '你靠在{partner}肩上，他揽住你的腰' },
        { id: 'a9', name: '挠下巴', icon: '✋', type: 'other',
          desc: '{partner}挠了挠你的下巴，像在逗猫',
          meDesc: '你挠了挠{partner}的下巴，他喉结动了动' },
        { id: 'a10', name: '背后抱', icon: '🫂', type: 'other',
          desc: '{partner}从背后环住你，用唇蹭了蹭你的脖子',
          meDesc: '你从背后环住{partner}，他握住你交叠的手', chainTo: 'a14' },
        { id: 'a11', name: '额头吻', icon: '💋', type: 'other',
          desc: '{partner}在你额头落下一吻，很轻',
          meDesc: '你在{partner}额头落下一吻，他闭了闭眼，笑了' },
        { id: 'a12', name: '耳语', icon: '👂', type: 'other',
          desc: '{partner}凑近你耳边，低语："在想什么？我倒是想你了"',
          meDesc: '你凑近{partner}耳边低语，他侧头捏了捏你耳垂' },
        { id: 'a13', name: '拽手腕', icon: '✊', type: 'other',
          desc: '{partner}拽住你的手腕，拉进怀里',
          meDesc: '你拽住{partner}的手腕，他顺势把你带进怀里' },
        { id: 'a14', name: '揉后颈', icon: '🤚', type: 'other',
          desc: '{partner}的手覆上你的后颈，轻轻揉捏',
          meDesc: '你的手覆上{partner}的后颈，他低哼了一声' },
        { id: 'a15', name: '蹭鼻尖', icon: '👃', type: 'mutual',
          desc: '你们鼻尖相蹭，呼吸交缠',
          meDesc: '你蹭了蹭{partner}的鼻尖，他呼吸一滞' },
        { id: 'a16', name: '拍背', icon: '👋', type: 'other',
          desc: '{partner}轻拍你的背，像在哄小孩',
          meDesc: '你轻拍{partner}的背，他把你搂得更紧' }
    ];

    /* ---------- 内置「动作回应」话术池 ---------- */
    var DEFAULT_REPLIES = [
        '……突然这么主动，我会当真的。',
        '这种时候，你应该看着我说话。',
        '记住了，是你先靠近的。',
        '手这么凉，我帮你暖。',
        '别动，让我抱一会儿。',
        '你知不知道，你这样很犯规。',
        '再靠近一点，我不介意。',
        '……呼吸乱了，都是因为你。',
        '我数到三，你要负责到底。',
        '安静点，让我听听你的心跳。',
        '这种事，你只能对我做。',
        '嗯，我记住这个温度了。',
        '你再这样，我今天就不打算放开你了。',
        '……想逃？已经晚了。',
        '我的耐心，只对你有用。',
        '别说话，让我感受一下。'
    ];

    var ACTION_TYPES = [
        { value: 'mutual', label: '双向' },
        { value: 'other', label: '他发起' },
        { value: 'me', label: '我发起' }
    ];

    /* 回应设置：他是否随机回一个动作、命中概率、回完动作后是否再说话 */
    var DEFAULT_SETTINGS = {
        replyAction: true,         // 开启「他随机回动作」
        replyChance: 50,           // 命中概率（%）
        textAfterAction: true,     // 回完动作后再补一句回应话术
        replySource: 'phrase',     // 他说的话从哪来：'phrase'=动作话术池 / 'card'=主字卡
        proactiveEnabled: true,    // 开启「他主动做动作」
        proactiveInterval: 30,     // 主动动作间隔（分钟）
        proactiveText: true        // 主动动作后是否再补一句话
    };
    var actSettings = null;
    var proactiveTimer = null;

    var customActions = [];
    var customReplies = null;      // null 表示用户没自定义，用内置池
    var currentMode = 'me';        // 'me' | 'other'
    var currentView = 'grid';      // 'grid' | 'list' | 'add' | 'edit' | 'replies' | 'settings'
    var editingId = null;

    /* ---------- 工具 ---------- */
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function partnerName() {
        try { return (typeof settings !== 'undefined' && settings.partnerName) || '对方'; }
        catch (e) { return '对方'; }
    }
    function myName() {
        try { return (typeof settings !== 'undefined' && settings.myName) || '我'; }
        catch (e) { return '我'; }
    }
    function fill(tpl) {
        return String(tpl || '').replace(/\{partner\}/g, partnerName()).replace(/\{me\}/g, myName());
    }
    function toast(msg) {
        if (typeof showNotification === 'function') showNotification(msg, 'info', 2000);
    }
    function persist() {
        if (typeof throttledSaveData === 'function') { try { throttledSaveData(); } catch (e) {} }
    }

    /* ---------- 存取 ---------- */
    function loadStore() {
        try {
            var raw = localStorage.getItem(STORE_KEY);
            customActions = raw ? (JSON.parse(raw) || []) : [];
        } catch (e) { customActions = []; }
        if (!Array.isArray(customActions)) customActions = [];
        try {
            var r2 = localStorage.getItem(REPLY_KEY);
            customReplies = r2 ? JSON.parse(r2) : null;
        } catch (e) { customReplies = null; }
        if (customReplies !== null && !Array.isArray(customReplies)) customReplies = null;
        try {
            var r3 = localStorage.getItem(SET_KEY);
            actSettings = r3 ? (JSON.parse(r3) || null) : null;
        } catch (e) { actSettings = null; }
        actSettings = mergeSettings(actSettings);
    }
    function mergeSettings(s) {
        var out = {
            replyAction: DEFAULT_SETTINGS.replyAction,
            replyChance: DEFAULT_SETTINGS.replyChance,
            textAfterAction: DEFAULT_SETTINGS.textAfterAction,
            replySource: DEFAULT_SETTINGS.replySource,
            proactiveEnabled: DEFAULT_SETTINGS.proactiveEnabled,
            proactiveInterval: DEFAULT_SETTINGS.proactiveInterval,
            proactiveText: DEFAULT_SETTINGS.proactiveText
        };
        if (s && typeof s === 'object') {
            if (typeof s.replyAction === 'boolean') out.replyAction = s.replyAction;
            var n = Number(s.replyChance);
            if (!isNaN(n)) out.replyChance = Math.max(0, Math.min(100, Math.round(n)));
            if (typeof s.textAfterAction === 'boolean') out.textAfterAction = s.textAfterAction;
            if (s.replySource === 'card' || s.replySource === 'phrase') out.replySource = s.replySource;
            if (typeof s.proactiveEnabled === 'boolean') out.proactiveEnabled = s.proactiveEnabled;
            var m = Number(s.proactiveInterval);
            if (!isNaN(m)) out.proactiveInterval = Math.max(1, Math.min(720, Math.round(m)));
            if (typeof s.proactiveText === 'boolean') out.proactiveText = s.proactiveText;
        }
        return out;
    }
    function saveSettings() {
        try { localStorage.setItem(SET_KEY, JSON.stringify(actSettings)); } catch (e) {}
    }
    function saveStore() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(customActions)); } catch (e) {}
    }
    function saveReplies() {
        try {
            if (customReplies === null) localStorage.removeItem(REPLY_KEY);
            else localStorage.setItem(REPLY_KEY, JSON.stringify(customReplies));
        } catch (e) {}
    }

    function allActions() { return DEFAULT_ACTIONS.concat(customActions); }
    function findAction(id) {
        var all = allActions();
        for (var i = 0; i < all.length; i++) { if (all[i].id === id) return all[i]; }
        return null;
    }
    function isBuiltin(id) {
        for (var i = 0; i < DEFAULT_ACTIONS.length; i++) { if (DEFAULT_ACTIONS[i].id === id) return true; }
        return false;
    }
    function typeLabel(v) {
        for (var i = 0; i < ACTION_TYPES.length; i++) { if (ACTION_TYPES[i].value === v) return ACTION_TYPES[i].label; }
        return v || '';
    }

    /* ---------- 发消息 ---------- */
    function pushSystem(text) {
        if (typeof addMessage !== 'function') return null;
        var msg = { id: Date.now() + Math.random(), text: text, timestamp: new Date(), type: 'system' };
        addMessage(msg);
        return msg;
    }
    function pushPartner(text) {
        if (typeof addMessage !== 'function') return null;
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
        if (typeof playSound === 'function') { try { playSound('message'); } catch (e) {} }
    }

    /* ---------- 动作回应：抽一句专属话术 ---------- */
    function replyPool() {
        var pool = (customReplies && customReplies.length) ? customReplies : DEFAULT_REPLIES;
        return pool.filter(function (t) { return t && String(t).trim(); });
    }

    /* ---------- 主字卡池：复用主聊天的「回复库 · 主字卡」----------
       本模块的 customReplies 遮蔽了全局同名变量，所以走 core.js:630 暴露的
       window._customReplies。过滤规则照抄 core.js:2660-2675（simulateReply）：
       排除被单独屏蔽的条目 + 被禁用分组里的条目，跟平时聊天自动回复完全一致。 */
    function cardPool() {
        var raw = null;
        try {
            if (Array.isArray(window._customReplies) && window._customReplies.length) raw = window._customReplies;
        } catch (e) { raw = null; }
        if (!raw) return [];

        var disabled = {};
        try {
            var d = localStorage.getItem('disabledReplyItems');
            if (d) {
                (JSON.parse(d) || []).forEach(function (x) { disabled[x] = true; });
            }
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
    /* 抽一个「他对你做」的动作：优先双向/他发起类型，并排除刚出现过的 */
    function pickReplyAction(excludeIds) {
        var all = allActions();
        if (!all.length) return null;
        var ex = excludeIds || [];
        var pick = function (arr) {
            if (!arr.length) return null;
            return arr[Math.floor(Math.random() * arr.length)];
        };
        var usable = all.filter(function (a) {
            return ex.indexOf(a.id) === -1 && (a.type === 'other' || a.type === 'mutual');
        });
        var hit = pick(usable);
        if (!hit) {
            // 全是「我发起」类型或不巧被排空了，退而求其次
            var rest = all.filter(function (a) { return ex.indexOf(a.id) === -1; });
            hit = pick(rest);
        }
        if (!hit) hit = pick(all);
        return hit || null;
    }

    /* 让他开口。来源由 replySource 决定：'phrase'=动作话术池，'card'=主字卡。
       选了字卡但字卡库是空的，自动退回话术池，保证他不会哑巴。 */
    function sayReply() {
        var st = actSettings || DEFAULT_SETTINGS;
        var pool = (st.replySource === 'card') ? cardPool() : replyPool();
        if (!pool.length && st.replySource === 'card') pool = replyPool();

        if (pool.length > 0) {
            pushPartner(fill(pool[Math.floor(Math.random() * pool.length)]));
        } else if (typeof window._triggerDelayedReply === 'function') {
            window._triggerDelayedReply(true);
        }
    }

    /* opts: { exclude: [动作id...] } —— 排除刚出现过的动作，避免自言自语地重复 */
    function scheduleActionReply(extraDelay, opts) {
        opts = opts || {};
        var st = actSettings || DEFAULT_SETTINGS;
        var base = 2200 + Math.random() * 2600;
        var wait = base + (extraDelay || 0);
        var wantsAction = !!st.replyAction && Math.random() * 100 < Number(st.replyChance || 0);

        setTimeout(function () {
            if (wantsAction) {
                var back = pickReplyAction(opts.exclude);
                if (back) {
                    pushSystem('💝 ' + fill(back.desc || back.meDesc || back.name));
                    if (st.textAfterAction) {
                        // 动作落地后，再补一句回应话术
                        setTimeout(function () { sayReply(); }, 2000 + Math.random() * 2200);
                    }
                    return;
                }
            }
            sayReply();
        }, wait);
    }

    /* ---------- 他主动做动作（独立于「自动发送」，不碰 core.js） ---------- */
    function fireProactiveAction() {
        var a = pickReplyAction([]);
        if (!a) return;
        pushSystem('💝 ' + fill(a.desc || a.meDesc || a.name));
        if (actSettings && actSettings.proactiveText) {
            setTimeout(function () { sayReply(); }, 2500 + Math.random() * 2500);
        }
        persist();
    }

    /* 每次触发后重新排期，间隔带 ±30% 抖动，避免机械感 */
    function scheduleProactive() {
        if (proactiveTimer) { clearTimeout(proactiveTimer); proactiveTimer = null; }
        var st = actSettings || DEFAULT_SETTINGS;
        if (!st.proactiveEnabled) return;
        var mins = Math.max(1, Number(st.proactiveInterval) || 30);
        var ms = mins * 60 * 1000 * (0.7 + Math.random() * 0.6);
        proactiveTimer = setTimeout(function () {
            proactiveTimer = null;
            try { fireProactiveAction(); } catch (e) {}
            scheduleProactive();
        }, ms);
    }

    /* ---------- 发送动作 ---------- */
    function sendAction(id, mode) {
        var a = findAction(id);
        if (!a) return;
        var fromMe = (mode !== 'other');
        var raw = fromMe ? (a.meDesc || a.desc) : a.desc;
        var text = fill(raw);

        closePanel();
        pushSystem('💝 ' + text);

        var chainDelay = 0;
        var exclude = [a.id];
        if (a.chainTo) {
            var chain = findAction(a.chainTo);
            if (chain) {
                chainDelay = 2400 + Math.random() * 2200;
                exclude.push(chain.id);
                setTimeout(function () { pushSystem('💝 ' + fill(chain.desc)); }, chainDelay);
            }
        }
        scheduleActionReply(chainDelay, { exclude: exclude });
        persist();
    }

    /* ---------- DOM ---------- */
    function el(id) { return document.getElementById(id); }

    function ensureDOM() {
        if (el('mcActionsOverlay')) return;
        var wrap = document.createElement('div');
        wrap.id = 'mcActionsOverlay';
        wrap.className = 'mc-actions-overlay';
        wrap.innerHTML =
            '<div class="mc-actions-panel" id="mcActionsPanel">' +
                '<div class="mc-actions-head">' +
                    '<span class="mc-actions-title" id="mcActionsTitle">💝 动作</span>' +
                    '<button class="mc-actions-close" id="mcActionsClose" type="button" aria-label="关闭">✕</button>' +
                '</div>' +
                '<div class="mc-actions-body" id="mcActionsBody"></div>' +
            '</div>';
        document.body.appendChild(wrap);

        wrap.addEventListener('click', function (e) { if (e.target === wrap) closePanel(); });
        el('mcActionsClose').addEventListener('click', closePanel);
        el('mcActionsBody').addEventListener('click', onBodyClick);
    }

    function onBodyClick(e) {
        var t = e.target;
        var modeBtn = t.closest('.mc-mode-tab');
        if (modeBtn) {
            currentMode = modeBtn.getAttribute('data-mode');
            currentView = 'grid';
            render();
            return;
        }
        var item = t.closest('.mc-action-item');
        if (item && item.getAttribute('data-id')) {
            sendAction(item.getAttribute('data-id'), currentMode);
            return;
        }
        var act = t.closest('[data-act]');
        if (!act) return;
        switch (act.getAttribute('data-act')) {
            case 'random':   randomAction(); break;
            case 'manage':   currentView = 'list'; render(); break;
            case 'back':     currentView = 'grid'; render(); break;
            case 'add-form': currentView = 'add'; editingId = null; render(); break;
            case 'do-add':   addCustomAction(); break;
            case 'do-save':  saveEditAction(); break;
            case 'edit':     startEdit(act.getAttribute('data-id')); break;
            case 'del':      removeCustomAction(act.getAttribute('data-id')); break;
            case 'replies':  currentView = 'replies'; render(); break;
            case 'do-save-rep': saveReplies(); toast('话术已保存'); break;
            case 'reset-rep': resetReplies(); break;
            case 'settings': currentView = 'settings'; render(); break;
            case 'do-save-set': saveSettingsFromForm(); break;
            case 'reset-set': resetSettings(); break;
            case 'proactive-now': fireProactiveAction(); closePanel(); toast('他来了'); break;
        }
    }

    function randomAction() {
        var all = allActions();
        if (!all.length) { toast('动作库为空'); return; }
        sendAction(all[Math.floor(Math.random() * all.length)].id, currentMode);
    }

    /* ---------- 渲染 ---------- */
    function render() {
        var body = el('mcActionsBody');
        if (!body) return;
        if (currentView === 'grid') { renderGrid(body); }
        else if (currentView === 'list') { renderList(body); }
        else if (currentView === 'add') { renderForm(body, null); }
        else if (currentView === 'edit') { renderForm(body, findAction(editingId)); }
        else if (currentView === 'replies') { renderReplies(body); }
        else if (currentView === 'settings') { renderSettings(body); }
    }

    function renderGrid(body) {
        var all = allActions();
        var html =
            '<div class="mc-mode-row">' +
                '<button type="button" class="mc-mode-tab' + (currentMode === 'me' ? ' active' : '') + '" data-mode="me">我发起</button>' +
                '<button type="button" class="mc-mode-tab' + (currentMode === 'other' ? ' active' : '') + '" data-mode="other">他发起</button>' +
                '<button type="button" class="mc-mini-btn" data-act="random">🎲 随机</button>' +
                '<button type="button" class="mc-mini-btn" data-act="manage">⚙️ 管理</button>' +
            '</div>' +
            '<div class="mc-actions-grid">' +
                all.map(function (a) {
                    return '<div class="mc-action-item" role="button" data-id="' + esc(a.id) + '">' +
                        '<span class="mc-action-icon">' + esc(a.icon || '💫') + '</span>' +
                        '<span class="mc-action-name">' + esc(a.name) + '</span>' +
                        '<span class="mc-action-type">' + esc(typeLabel(a.type)) + '</span>' +
                        '</div>';
                }).join('') +
            '</div>' +
            '<div class="mc-hint">点一个动作，' + esc(partnerName()) + '会回应你</div>';
        body.innerHTML = html;
    }

    function renderList(body) {
        var all = allActions();
        var html =
            '<div class="mc-mode-row">' +
                '<button type="button" class="mc-mini-btn" data-act="back">← 返回</button>' +
                '<button type="button" class="mc-mini-btn" data-act="add-form">➕ 添加动作</button>' +
                '<button type="button" class="mc-mini-btn" data-act="replies">💬 回话术</button>' +
                '<button type="button" class="mc-mini-btn" data-act="settings">🔁 回动作</button>' +
            '</div>' +
            '<div class="mc-list">' +
                all.map(function (a) {
                    var builtin = isBuiltin(a.id);
                    return '<div class="mc-list-item">' +
                        '<div class="mc-list-main">' +
                            '<div class="mc-list-name">' + esc(a.icon || '💫') + ' ' + esc(a.name) +
                                ' <span class="mc-list-type">(' + esc(typeLabel(a.type)) + ')</span></div>' +
                            '<div class="mc-list-desc">他：' + esc(fill(a.desc)) + '</div>' +
                            (a.meDesc ? '<div class="mc-list-desc">我：' + esc(fill(a.meDesc)) + '</div>' : '') +
                        '</div>' +
                        '<div class="mc-list-ops">' +
                            '<button type="button" class="mc-mini-btn" data-act="edit" data-id="' + esc(a.id) + '">编辑</button>' +
                            (builtin ? '' : '<button type="button" class="mc-mini-btn danger" data-act="del" data-id="' + esc(a.id) + '">删除</button>') +
                        '</div>' +
                    '</div>';
                }).join('') +
            '</div>';
        body.innerHTML = html;
    }

    function renderForm(body, a) {
        var isEdit = !!a;
        var opts = ACTION_TYPES.map(function (t) {
            return '<option value="' + t.value + '"' + (a && a.type === t.value ? ' selected' : '') + '>' + t.label + '</option>';
        }).join('');
        body.innerHTML =
            '<div class="mc-mode-row">' +
                '<button type="button" class="mc-mini-btn" data-act="back">← 返回</button>' +
                '<span class="mc-view-label">' + (isEdit ? '编辑动作' : '添加动作') + '</span>' +
            '</div>' +
            '<div class="mc-form">' +
                '<label>动作名称<input type="text" id="mcActName" value="' + esc(a ? a.name : '') + '" placeholder="例如：摸头"></label>' +
                '<label>图标 (emoji)<input type="text" id="mcActIcon" value="' + esc(a ? a.icon : '') + '" placeholder="🤚" maxlength="4"></label>' +
                '<label>类型<select id="mcActType">' + opts + '</select></label>' +
                '<label>他视角描述<textarea id="mcActDesc" placeholder="' + esc(partnerName()) + '揉了揉你的头发">' + esc(a ? a.desc : '') + '</textarea></label>' +
                '<label>我视角描述<textarea id="mcActMe" placeholder="你伸手揉了揉' + esc(partnerName()) + '的头发">' + esc(a ? a.meDesc : '') + '</textarea></label>' +
                '<button type="button" class="mc-primary-btn" data-act="' + (isEdit ? 'do-save' : 'do-add') + '">' +
                    (isEdit ? '保存修改' : '添加动作') + '</button>' +
            '</div>';
    }

    function renderReplies(body) {
        var pool = (customReplies && customReplies.length) ? customReplies : DEFAULT_REPLIES;
        body.innerHTML =
            '<div class="mc-mode-row">' +
                '<button type="button" class="mc-mini-btn" data-act="back">← 返回</button>' +
                '<span class="mc-view-label">动作回应话术</span>' +
            '</div>' +
            '<div class="mc-hint">每行一句。留空则使用内置话术。</div>' +
            '<textarea id="mcReplyBox" class="mc-reply-box">' + esc(pool.join('\n')) + '</textarea>' +
            '<div class="mc-form-row">' +
                '<button type="button" class="mc-primary-btn" data-act="do-save-rep">保存话术</button>' +
                '<button type="button" class="mc-mini-btn danger" data-act="reset-rep">恢复内置</button>' +
            '</div>';
        var box = el('mcReplyBox');
        if (box) {
            box.addEventListener('input', function () {
                customReplies = box.value.split('\n');
            });
        }
    }

    function renderSettings(body) {
        var st = actSettings || DEFAULT_SETTINGS;
        body.innerHTML =
            '<div class="mc-mode-row">' +
                '<button type="button" class="mc-mini-btn" data-act="back">← 返回</button>' +
                '<span class="mc-view-label">回应方式设置</span>' +
            '</div>' +
            '<div class="mc-hint">① 你发动作后，' + esc(partnerName()) + '怎么回应你</div>' +
            '<div class="mc-form">' +
                '<label class="mc-check-row">' +
                    '<input type="checkbox" id="mcSetReplyAction"' + (st.replyAction ? ' checked' : '') + '>' +
                    '<span>他随机回一个动作</span>' +
                '</label>' +
                '<label>回动作的概率（%）' +
                    '<input type="number" id="mcSetChance" min="0" max="100" step="5" value="' + Number(st.replyChance) + '">' +
                '</label>' +
                '<label class="mc-check-row">' +
                    '<input type="checkbox" id="mcSetTextAfter"' + (st.textAfterAction ? ' checked' : '') + '>' +
                    '<span>回完动作后再说一句话</span>' +
                '</label>' +
                '<label>他说的话从哪来' +
                    '<select id="mcSetSource">' +
                        '<option value="phrase"' + (st.replySource === 'card' ? '' : ' selected') + '>动作话术池（💬 回话术）</option>' +
                        '<option value="card"' + (st.replySource === 'card' ? ' selected' : '') + '>主字卡（回复库）</option>' +
                    '</select>' +
                '</label>' +
                '<div class="mc-hint">选「主字卡」时，他用你平时聊天那套回复库说话；字卡库为空会自动退回话术池。</div>' +
            '</div>' +
            '<div class="mc-hint mc-sec">② 他自己找上门（主动动作）</div>' +
            '<div class="mc-form">' +
                '<label class="mc-check-row">' +
                    '<input type="checkbox" id="mcSetProactive"' + (st.proactiveEnabled ? ' checked' : '') + '>' +
                    '<span>他会主动做动作</span>' +
                '</label>' +
                '<label>间隔（分钟，1~720）' +
                    '<input type="number" id="mcSetProInterval" min="1" max="720" step="5" value="' + Number(st.proactiveInterval) + '">' +
                '</label>' +
                '<label class="mc-check-row">' +
                    '<input type="checkbox" id="mcSetProText"' + (st.proactiveText ? ' checked' : '') + '>' +
                    '<span>做完动作后说一句话</span>' +
                '</label>' +
                '<div class="mc-hint">不等你开口，他自己过来。间隔带 ±30% 随机抖动。</div>' +
                '<div class="mc-form-row">' +
                    '<button type="button" class="mc-mini-btn" data-act="proactive-now">⚡ 立刻来一个</button>' +
                '</div>' +
            '</div>' +
            '<div class="mc-form-row">' +
                '<button type="button" class="mc-primary-btn" data-act="do-save-set">保存设置</button>' +
                '<button type="button" class="mc-mini-btn danger" data-act="reset-set">恢复默认</button>' +
            '</div>';
    }

    function saveSettingsFromForm() {
        var on = el('mcSetReplyAction');
        var ch = el('mcSetChance');
        var ta = el('mcSetTextAfter');
        var n = ch ? Number(ch.value) : NaN;
        if (isNaN(n)) n = DEFAULT_SETTINGS.replyChance;
        n = Math.max(0, Math.min(100, Math.round(n)));

        var src = el('mcSetSource');
        var pro = el('mcSetProactive');
        var pi = el('mcSetProInterval');
        var pt = el('mcSetProText');
        var m = pi ? Number(pi.value) : NaN;
        if (isNaN(m)) m = DEFAULT_SETTINGS.proactiveInterval;
        m = Math.max(1, Math.min(720, Math.round(m)));

        actSettings = {
            replyAction: !!(on && on.checked),
            replyChance: n,
            textAfterAction: !!(ta && ta.checked),
            replySource: (src && src.value === 'card') ? 'card' : 'phrase',
            proactiveEnabled: !!(pro && pro.checked),
            proactiveInterval: m,
            proactiveText: !!(pt && pt.checked)
        };
        saveSettings();
        persist();
        scheduleProactive();     // 设置变了，重新排期
        toast('回应设置已保存');
        currentView = 'list';
        render();
    }

    function resetSettings() {
        actSettings = mergeSettings(null);
        saveSettings();
        scheduleProactive();
        toast('已恢复默认（回动作 50% / 主动动作 30 分钟 / 说话用话术池）');
        render();
    }

    /* ---------- 增删改 ---------- */
    function addCustomAction() {
        var name = (el('mcActName') || {}).value;
        var icon = (el('mcActIcon') || {}).value;
        var type = (el('mcActType') || {}).value;
        var desc = (el('mcActDesc') || {}).value;
        var meDesc = (el('mcActMe') || {}).value;
        if (!name || !name.trim() || !desc || !desc.trim()) { toast('请填写名称和他视角描述'); return; }
        customActions.push({
            id: 'ca_' + Date.now(),
            name: name.trim(),
            icon: (icon || '').trim() || '💫',
            type: type || 'mutual',
            desc: desc.trim(),
            meDesc: (meDesc || '').trim() || desc.trim()
        });
        saveStore();
        persist();
        toast('动作添加成功');
        currentView = 'list';
        render();
    }

    function startEdit(id) {
        editingId = id;
        currentView = 'edit';
        render();
    }

    function saveEditAction() {
        var a = findAction(editingId);
        if (!a) { currentView = 'list'; render(); return; }
        var name = (el('mcActName') || {}).value;
        var icon = (el('mcActIcon') || {}).value;
        var type = (el('mcActType') || {}).value;
        var desc = (el('mcActDesc') || {}).value;
        var meDesc = (el('mcActMe') || {}).value;

        if (isBuiltin(editingId)) {
            // 内置动作不可改，复制成自定义副本
            customActions.push({
                id: 'ca_' + Date.now(),
                name: (name || '').trim() || a.name,
                icon: (icon || '').trim() || a.icon,
                type: type || a.type,
                desc: (desc || '').trim() || a.desc,
                meDesc: (meDesc || '').trim() || (a.meDesc || '')
            });
            saveStore();
            persist();
            toast('内置动作已复制为自定义');
        } else {
            for (var i = 0; i < customActions.length; i++) {
                if (customActions[i].id === editingId) {
                    customActions[i].name = (name || '').trim() || customActions[i].name;
                    customActions[i].icon = (icon || '').trim() || customActions[i].icon;
                    customActions[i].type = type || customActions[i].type;
                    customActions[i].desc = (desc || '').trim() || customActions[i].desc;
                    customActions[i].meDesc = (meDesc || '').trim() || customActions[i].meDesc;
                    break;
                }
            }
            saveStore();
            persist();
            toast('动作已更新');
        }
        currentView = 'list';
        render();
    }

    function removeCustomAction(id) {
        if (isBuiltin(id)) { toast('内置动作不能删除'); return; }
        customActions = customActions.filter(function (a) { return a.id !== id; });
        saveStore();
        persist();
        toast('动作已删除');
        render();
    }

    function resetReplies() {
        customReplies = null;
        saveReplies();
        toast('已恢复内置话术');
        render();
    }

    /* ---------- 开关 ---------- */
    function openPanel() {
        ensureDOM();
        currentMode = 'me';
        currentView = 'grid';
        render();
        var ov = el('mcActionsOverlay');
        if (ov) ov.classList.add('active');
    }
    function closePanel() {
        var ov = el('mcActionsOverlay');
        if (ov) ov.classList.remove('active');
    }

    loadStore();

    window.Actions = {
        openPanel: openPanel,
        closePanel: closePanel,
        sendAction: sendAction,
        randomAction: randomAction,
        fireProactiveAction: fireProactiveAction,
        scheduleProactive: scheduleProactive,
        getActions: function () { return allActions(); }
    };

    document.addEventListener('DOMContentLoaded', function () {
        if (window.MoreMenu && typeof window.MoreMenu.registerItem === 'function') {
            window.MoreMenu.registerItem('actions', { ready: true, action: openPanel });
        }
        scheduleProactive();
    });
})();
