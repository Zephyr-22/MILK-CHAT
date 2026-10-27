/* ============================================================
   动作（Action）—— 配合 css/actions.css
   移植自《暗点专线 N109》的「动作回应」模块，并适配传讯的架构
   ------------------------------------------------------------
   · 动作库：16 个内置动作 + 自定义动作（localStorage）
   · 动作面板：我发起 / 他 发起 / 随机 / 管理
   · 动作消息：居中系统消息（复用 MILK-CHAT 的 .system-message）
   · 动作回应：按概率回动作，可连击最多 MAX_REPLY_ACTIONS 个；说的话来自「回复库 · 主字卡」
   ------------------------------------------------------------
   接入协议：window.MoreMenu.registerItem('actions', { ready, action })
   不依赖任何外部库，不改动 js/core.js
   ============================================================ */
(function () {
    'use strict';

    var STORE_KEY = 'milkchat_custom_actions_v1';
    var SET_KEY   = 'milkchat_action_settings_v1';
    var OVERRIDE_KEY = 'milkchat_action_overrides_v1';  // 内置动作的改动：{ 内置id: {字段:值} }
    var HIDDEN_KEY   = 'milkchat_action_hidden_v1';     // 被隐藏的内置动作：{ 内置id: true }

    /* ---------- 内置动作库（{partner}=对方名字，{me}=我的名字）---------- */
    var DEFAULT_ACTIONS = [
        { id: 'a1', name: '拥抱', icon: '🫂', type: 'mutual',
          desc: '{partner}紧紧抱住你，下巴抵在你头顶',
          meDesc: '你紧紧抱住{partner}，把脸埋在他胸口' },
        { id: 'a2', name: '亲吻', icon: '💋', type: 'mutual',
          desc: '{partner}低头吻住你，温柔而霸道',
          meDesc: '你踮起脚尖吻住{partner}，他愣了一下随即加深' },
        { id: 'a3', name: '摸头', icon: '🤚', type: 'other',
          desc: '{partner}揉了揉你的头发，眼底带笑',
          meDesc: '你伸手揉了揉{partner}的头发，被他捉住手腕' },
        { id: 'a4', name: '牵手', icon: '🤝', type: 'mutual',
          desc: '{partner}握住你的手，十指相扣',
          meDesc: '你主动握住{partner}的手，他收紧手指' },
        { id: 'a5', name: '壁咚', icon: '🧱', type: 'other',
          desc: '{partner}将你困在臂弯里，气息逼近',
          meDesc: '你将{partner}推到墙上，他挑眉看你' },
        { id: 'a6', name: '投喂', icon: '🍰', type: 'other',
          desc: '{partner}将甜品递到你嘴边，"张嘴"',
          meDesc: '你把甜品递到{partner}嘴边，他张口咬住你的手指' },
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
          meDesc: '你从背后环住{partner}，他握住你交叠的手' },
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

    var ACTION_TYPES = [
        { value: 'mutual', label: '双向' },
        { value: 'other', label: '他发起' },
        { value: 'me', label: '我发起' }
    ];

    /* 回应设置：所有开关都固定为「开」，只保留概率这一项可调。
       理由：这些项关掉之后他就变哑巴/变木头，没有实际意义，不值得占一个界面控件。 */
    var DEFAULT_SETTINGS = {
        replyChance: 50            // 每一轮掷的概率（%），第 1、2、3 个动作各掷一次，互不影响
    };

    /* 一次回应里他最多连出几个动作（含第一个）。到上限后收尾补一句话。 */
    var MAX_REPLY_ACTIONS = 3;

    /* 主动动作和「主动发送」共用一条时间线：core.js 每次要自动发消息前先问这里一句，
       掷中这个概率就改发动作（动作之后照常补一句话），没掷中就交还给 core.js 正常发消息。
       所以主动动作没有自己的定时器 —— 开关、间隔都由「聊天设置 → 主动发送」那一个滑块控制。 */
    var PROACTIVE_ACTION_CHANCE = 33;   // 每次心跳有多大概率是动作（%）
    var actSettings = null;

    var customActions = [];
    var actionOverrides = {};      // 内置动作被改过的字段
    var hiddenBuiltins = {};       // 被隐藏的内置动作
    var currentMode = 'me';        // 'me' | 'other'
    var currentView = 'grid';      // 'grid' | 'list' | 'add' | 'edit' | 'settings'
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
        // 连锁动作功能已移除：清掉历史数据里残留的 chainTo 字段（并落盘）
        var cleanedCustom = false;
        for (var ci = 0; ci < customActions.length; ci++) {
            if (customActions[ci] && 'chainTo' in customActions[ci]) {
                delete customActions[ci].chainTo;
                cleanedCustom = true;
            }
        }
        if (cleanedCustom) saveStore();
        // 「回话术」功能已移除：清掉遗留的自定义话术数据，避免白占 localStorage 配额
        try { localStorage.removeItem('milkchat_action_replies_v1'); } catch (e) {}
        try {
            var r3 = localStorage.getItem(SET_KEY);
            actSettings = r3 ? (JSON.parse(r3) || null) : null;
        } catch (e) { actSettings = null; }
        actSettings = mergeSettings(actSettings);
        try {
            var r4 = localStorage.getItem(OVERRIDE_KEY);
            actionOverrides = r4 ? (JSON.parse(r4) || {}) : {};
        } catch (e) { actionOverrides = {}; }
        if (!actionOverrides || typeof actionOverrides !== 'object') actionOverrides = {};
        var cleanedOv = false;
        for (var ok in actionOverrides) {
            if (Object.prototype.hasOwnProperty.call(actionOverrides, ok) && actionOverrides[ok]
                && 'chainTo' in actionOverrides[ok]) {
                delete actionOverrides[ok].chainTo;
                cleanedOv = true;
            }
        }
        if (cleanedOv) saveOverrides();
        try {
            var r5 = localStorage.getItem(HIDDEN_KEY);
            hiddenBuiltins = r5 ? (JSON.parse(r5) || {}) : {};
        } catch (e) { hiddenBuiltins = {}; }
        if (!hiddenBuiltins || typeof hiddenBuiltins !== 'object') hiddenBuiltins = {};

        migrateLegacyCopies();
    }

    /* 旧版本编辑内置动作会"另存为副本"，导致列表里出现同名重复。
       这里把那些副本回收成真正的覆盖记录，用户之前改的内容不丢。 */
    function migrateLegacyCopies() {
        if (!customActions.length) return;
        var changed = false;
        var keep = [];
        for (var i = 0; i < customActions.length; i++) {
            var a = customActions[i];
            var match = null;
            for (var j = 0; j < DEFAULT_ACTIONS.length; j++) {
                if (DEFAULT_ACTIONS[j].name === a.name) { match = DEFAULT_ACTIONS[j]; break; }
            }
            // 只回收"和内置动作同名"、且该内置动作还没被覆盖过的副本
            if (match && !actionOverrides[match.id]) {
                actionOverrides[match.id] = {
                    name: a.name, icon: a.icon, type: a.type,
                    desc: a.desc, meDesc: a.meDesc
                };
                changed = true;
            } else {
                keep.push(a);
            }
        }
        if (changed) {
            customActions = keep;
            saveStore();
            saveOverrides();
        }
    }
    function saveOverrides() {
        try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(actionOverrides)); } catch (e) {}
    }
    function saveHidden() {
        try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hiddenBuiltins)); } catch (e) {}
    }
    function mergeSettings(s) {
        var out = {
            replyChance: DEFAULT_SETTINGS.replyChance
        };
        if (s && typeof s === 'object') {
            var n = Number(s.replyChance);
            if (!isNaN(n)) out.replyChance = Math.max(0, Math.min(100, Math.round(n)));
        }
        return out;
    }
    function saveSettings() {
        try { localStorage.setItem(SET_KEY, JSON.stringify(actSettings)); } catch (e) {}
    }
    function saveStore() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(customActions)); } catch (e) {}
    }
    /* 内置动作：套用覆盖记录。includeHidden=true 时连隐藏的也列出（管理页要用） */
    function builtinRows(includeHidden) {
        var out = [];
        for (var i = 0; i < DEFAULT_ACTIONS.length; i++) {
            var a = DEFAULT_ACTIONS[i];
            if (!includeHidden && hiddenBuiltins[a.id]) continue;
            var ov = actionOverrides[a.id];
            if (!ov) { out.push(a); continue; }
            var merged = {};
            var k;
            for (k in a) { if (Object.prototype.hasOwnProperty.call(a, k)) merged[k] = a[k]; }
            for (k in ov) { if (Object.prototype.hasOwnProperty.call(ov, k)) merged[k] = ov[k]; }
            out.push(merged);
        }
        return out;
    }
    /* 可见动作 = 内置（套用覆盖、剔除隐藏）+ 自定义 */
    function allActions() { return builtinRows(false).concat(customActions); }
    /* 管理页列表：隐藏的也要列出来，否则没法放回来 */
    function allRows() { return builtinRows(true).concat(customActions); }
    function isOverridden(id) { return !!actionOverrides[id]; }
    function isHidden(id) { return !!hiddenBuiltins[id]; }
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

    /* ---------- 发消息 ----------
       这个模块里所有系统消息都是动作消息，统一打上 actionMsg 标记，
       渲染时加 .system-message-action（斜体），跟普通系统提示区分开。
       标记存在消息对象里，刷新后依然生效；文案本身保持纯文本，不塞 HTML。 */
    function pushSystem(text) {
        if (typeof addMessage !== 'function') return null;
        var msg = {
            id: Date.now() + Math.random(),
            text: text,
            timestamp: new Date(),
            type: 'system',
            actionMsg: true
        };
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

    /* ---------- 主字卡池：复用主聊天的「回复库 · 主字卡」----------
       走 core.js:630 暴露的 window._customReplies（模块内已无同名变量遮蔽）。
       过滤规则照抄 core.js:2660-2675（simulateReply）：排除被单独屏蔽的条目 +
       被禁用分组里的条目，跟平时聊天自动回复完全一致。 */
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

    /* 让他开口：统一从「回复库 · 主字卡」抽一句。
       字卡库为空时退回主聊天的延迟回复，保证他不会哑巴。 */
    function sayReply() {
        var pool = cardPool();

        if (pool.length > 0) {
            pushPartner(fill(pool[Math.floor(Math.random() * pool.length)]));
        } else if (typeof window._triggerDelayedReply === 'function') {
            window._triggerDelayedReply(true);
        }
    }

    /* opts: { exclude: [动作id...], round: 第几轮(0起) } —— exclude 排除刚出现过的动作，避免自言自语地重复。
       连击：回中动作后若未到 MAX_REPLY_ACTIONS 上限，用同一个 replyChance 再排一轮，接不接由下一轮自己掷。 */
    function scheduleActionReply(extraDelay, opts) {
        opts = opts || {};
        var st = actSettings || DEFAULT_SETTINGS;
        var round = opts.round || 0;
        var exclude = opts.exclude || [];
        var base = 2200 + Math.random() * 2600;
        var wait = base + (extraDelay || 0);
        // 每一轮独立掷一次，概率互不影响：第 1、2、3 个动作各占 replyChance
        var wantsAction = Math.random() * 100 < Number(st.replyChance || 0);

        setTimeout(function () {
            if (wantsAction) {
                var back = pickReplyAction(exclude);
                if (back) {
                    pushSystem(fill(back.desc || back.meDesc || back.name));
                    if ((round + 1) < MAX_REPLY_ACTIONS) {
                        // 还没到上限：再排一轮，接不接由它自己掷概率
                        scheduleActionReply(0, { exclude: exclude.concat([back.id]), round: round + 1 });
                        return;
                    }
                    // 已到上限：收尾补一句话（来自主字卡）
                    setTimeout(function () { sayReply(); }, 2000 + Math.random() * 2200);
                    return;
                }
            }
            sayReply();
        }, wait);
    }

    /* ---------- 他主动做动作 ----------
       返回 true = 这次心跳被动作接管（core.js 不再发消息）；false = 交还给 core.js。
       动作之后照常补一句话，所以他说话的密度不会因为这个心跳做动作而变少。 */
    function fireProactiveAction() {
        var a = pickReplyAction([]);
        if (!a) return false;      // 没有可用动作，别把这次心跳浪费掉
        pushSystem(fill(a.desc || a.meDesc || a.name));
        setTimeout(function () { sayReply(); }, 2500 + Math.random() * 2500);
        persist();
        return true;
    }

    /* core.js 的主动发送心跳钩子。返回 true 表示"这次我来"，core.js 就不再调 simulateReply。 */
    window._onAutoSendTick = function () {
        if (Math.random() * 100 >= PROACTIVE_ACTION_CHANCE) return false;
        try { return fireProactiveAction(); } catch (e) { return false; }
    };

    /* ---------- 发送动作 ---------- */
    function sendAction(id, mode) {
        var a = findAction(id);
        if (!a) return;
        var fromMe = (mode !== 'other');
        var raw = fromMe ? (a.meDesc || a.desc) : a.desc;
        var text = fill(raw);

        closePanel();
        pushSystem(text);

        scheduleActionReply(0, { exclude: [a.id] });
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
            case 'hide':     hideAction(act.getAttribute('data-id')); break;
            case 'show':     showAction(act.getAttribute('data-id')); break;
            case 'reset-one': resetBuiltin(act.getAttribute('data-id')); break;
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
        var all = allRows();
        var html =
            '<div class="mc-mode-row">' +
                '<button type="button" class="mc-mini-btn" data-act="back">← 返回</button>' +
                '<button type="button" class="mc-mini-btn" data-act="add-form">➕ 添加动作</button>' +
                '<button type="button" class="mc-mini-btn" data-act="settings">⚙️ 回应设置</button>' +
            '</div>' +
            '<div class="mc-list">' +
                all.map(function (a) {
                    var builtin = isBuiltin(a.id);
                    var hidden = builtin && isHidden(a.id);
                    var edited = builtin && isOverridden(a.id);
                    var tags = '';
                    if (hidden) tags += '<span class="mc-tag off">已隐藏</span>';
                    if (edited) tags += '<span class="mc-tag">已改</span>';
                    var ops ='<button type="button" class="mc-mini-btn" data-act="edit" data-id="' + esc(a.id) + '">编辑</button>';
                    if (builtin) {
                        ops += hidden
                            ? '<button type="button" class="mc-mini-btn" data-act="show" data-id="' + esc(a.id) + '">显示</button>'
                            : '<button type="button" class="mc-mini-btn" data-act="hide" data-id="' + esc(a.id) + '">隐藏</button>';
                        if (edited || hidden) {
                            ops += '<button type="button" class="mc-mini-btn" data-act="reset-one" data-id="' + esc(a.id) + '">还原</button>';
                        }
                    } else {
                        ops += '<button type="button" class="mc-mini-btn danger" data-act="del" data-id="' + esc(a.id) + '">删除</button>';
                    }
                    return '<div class="mc-list-item' + (hidden ? ' is-hidden' : '') + '">' +
                        '<div class="mc-list-main">' +
                            '<div class="mc-list-name">' + esc(a.icon || '💫') + ' ' + esc(a.name) +
                                ' <span class="mc-list-type">(' + esc(typeLabel(a.type)) + ')</span>' + tags + '</div>' +
                            '<div class="mc-list-desc">他：' + esc(fill(a.desc)) + '</div>' +
                            (a.meDesc ? '<div class="mc-list-desc">我：' + esc(fill(a.meDesc)) + '</div>' : '') +
                        '</div>' +
                        '<div class="mc-list-ops">' + ops + '</div>' +
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
                (isEdit && isBuiltin(a.id)
                    ? '<div class="mc-hint">这是内置动作，保存后直接替换原内容，不会多出一条。</div>' : '') +
                '<button type="button" class="mc-primary-btn" data-act="' + (isEdit ? 'do-save' : 'do-add') + '">' +
                    (isEdit ? '保存修改' : '添加动作') + '</button>' +
            '</div>';
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
                '<label>回动作的概率（%）' +
                    '<input type="number" id="mcSetChance" min="0" max="100" step="5" value="' + Number(st.replyChance) + '">' +
                '</label>' +
                '<div class="mc-hint">每一轮都独立掷一次、互不影响：' +
                    '第 1 个动作 ' + Number(st.replyChance) + '%，中了再掷第 2 个也是 ' + Number(st.replyChance) +
                    '%，再中掷第 3 个还是 ' + Number(st.replyChance) + '%。' +
                '</div>' +
                '<div class="mc-hint">一次回应最多连出 ' + MAX_REPLY_ACTIONS + ' 个动作；动作结束后，' +
                    '他会再说一句话，来自「回复库 · 主字卡」，跟平时聊天的自动回复一致。</div>' +
            '</div>' +
            '<div class="mc-hint mc-sec">② 他自己找上门（主动动作）</div>' +
            '<div class="mc-form">' +
                '<div class="mc-hint">和「设置 → 聊天设置 → 主动发送」共用一条时间线：' +
                    '那里的开关关掉就都不来了，间隔也由那里的滑块决定。</div>' +
                '<div class="mc-hint">每 ' + PROACTIVE_ACTION_CHANCE + '% 的心跳他会做个动作，' +
                    '动作之后照常说一句话（来自主字卡），所以他说话的密度不变。</div>' +
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
        var ch = el('mcSetChance');
        var n = ch ? Number(ch.value) : NaN;
        if (isNaN(n)) n = DEFAULT_SETTINGS.replyChance;
        n = Math.max(0, Math.min(100, Math.round(n)));

        actSettings = {
            replyChance: n
        };
        saveSettings();
        persist();
        toast('回应设置已保存');
        currentView = 'list';
        render();
    }

    function resetSettings() {
        actSettings = mergeSettings(null);
        saveSettings();
        toast('已恢复默认（回动作 50% / 主动动作 33% / 说话用主字卡）');
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
            id: 'ca_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
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
            // 内置动作：不另存副本，直接在原条目上覆盖
            actionOverrides[editingId] = {
                name: (name || '').trim() || a.name,
                icon: (icon || '').trim() || a.icon,
                type: type || a.type,
                desc: (desc || '').trim() || a.desc,
                meDesc: (meDesc || '').trim() || (a.meDesc || '')
            };
            saveOverrides();
            persist();
            toast('内置动作已更新');
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

    /* 内置动作不真删，改成"隐藏"——随时能放回来 */
    function hideAction(id) {
        if (!isBuiltin(id)) { removeCustomAction(id); return; }
        hiddenBuiltins[id] = true;
        saveHidden();
        persist();
        toast('已隐藏');
        render();
    }
    function showAction(id) {
        delete hiddenBuiltins[id];
        saveHidden();
        persist();
        toast('已恢复显示');
        render();
    }
    /* 把内置动作改回出厂文案 */
    function resetBuiltin(id) {
        if (!isBuiltin(id)) return;
        delete actionOverrides[id];
        delete hiddenBuiltins[id];
        saveOverrides();
        saveHidden();
        persist();
        toast('已恢复内置原始内容');
        render();
    }

    function removeCustomAction(id) {
        if (isBuiltin(id)) { toast('内置动作请点「隐藏」'); return; }
        customActions = customActions.filter(function (a) { return a.id !== id; });
        saveStore();
        persist();
        toast('动作已删除');
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
        getActions: function () { return allActions(); }
    };

    document.addEventListener('DOMContentLoaded', function () {
        if (window.MoreMenu && typeof window.MoreMenu.registerItem === 'function') {
            window.MoreMenu.registerItem('actions', { ready: true, action: openPanel });
        }
    });
})();
