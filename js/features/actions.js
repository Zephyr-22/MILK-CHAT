/* ============================================================
   动作（Action）—— 配合 css/actions.css
   移植自《暗点专线 N109》的「动作回应」模块，并适配传讯的架构
   ------------------------------------------------------------
   · 动作库：16 个内置动作 + 自定义动作（localStorage）
   · 动作面板：网格点选 / 随机 / 管理（你点动作 = 永远是你对他做）
   · 动作消息：居中系统消息（复用 MILK-CHAT 的 .system-message）
   · 回应模型：动作与话是平级的两种语言——掷动作个数（场景决定概率链）→ 掷话 →
     完全洗牌成序列 → 按 replyDelayMin~Max 节奏逐个发出（动作紧接动作用 3~6s 短间隔）。
     概率固定衰减、不可调：回你动作 70/50/30（最多 3 个）；回你消息 15%+30%（最多 2 个）。
   ------------------------------------------------------------
   接入协议：window.MoreMenu.registerItem('actions', { ready, action })
   不依赖任何外部库，不改动 js/core.js
   ============================================================ */
(function () {
    'use strict';

    var STORE_KEY = 'milkchat_action_custom_v1';        // 旧键 milkchat_custom_actions_v1 由 loadStore 迁移
    var SET_KEY   = 'milkchat_action_settings_v1';      // 已弃用：仅 loadStore 里 removeItem 清理遗留数据
    var OVERRIDE_KEY = 'milkchat_action_overrides_v1';  // 内置动作的改动：{ 内置id: {字段:值} }
    var HIDDEN_KEY   = 'milkchat_action_hidden_v1';     // 被隐藏的内置动作：{ 内置id: true }

    /* ---------- 内置动作库（{partner}=对方名字，{me}=我的名字）
       group: 'A'=温和 / 'B'=激烈；仅用于面板分组展示，抽签等概率、不分组加权。 ---------- */
    var DEFAULT_ACTIONS = [
        // ===== A 组 · 温和（18）=====
        { id: 'a1', name: '拥抱', icon: '🫂', type: 'mutual', group: 'A',
          desc: '{partner}紧紧抱住你，下巴抵在你头顶',
          meDesc: '你紧紧抱住{partner}，把脸埋在他胸口' },
        { id: 'a2', name: '亲吻', icon: '💋', type: 'mutual', group: 'A',
          desc: '{partner}低头吻住你，温柔而霸道',
          meDesc: '你踮起脚尖吻住{partner}，手指攥住他的衣襟' },
        { id: 'a3', name: '摸头', icon: '🤚', type: 'other', group: 'A',
          desc: '{partner}揉了揉你的头发，眼底带笑',
          meDesc: '你伸手揉了揉{partner}的头发，把他的刘海拨乱' },
        { id: 'a4', name: '牵手', icon: '🤝', type: 'mutual', group: 'A',
          desc: '{partner}握住你的手，十指相扣',
          meDesc: '你握住{partner}的手，十指扣进他指缝' },
        { id: 'a6', name: '投喂', icon: '🍰', type: 'other', group: 'A',
          desc: '{partner}将甜品递到你嘴边，"张嘴"',
          meDesc: '你把甜品递到{partner}嘴边，又往前送了半寸' },
        { id: 'a7', name: '捏脸', icon: '🤏', type: 'other', group: 'A',
          desc: '{partner}捏了捏你的脸，"软软的"',
          meDesc: '你捏了捏{partner}的脸，指腹在他脸颊上揉了一圈' },
        { id: 'a8', name: '靠肩', icon: '🛋️', type: 'mutual', group: 'A',
          desc: '{partner}拍了拍肩膀，"靠过来，不用犹豫"',
          meDesc: '你把头靠上{partner}的肩，又挪了挪位置' },
        { id: 'a9', name: '挠下巴', icon: '✋', type: 'other', group: 'A',
          desc: '{partner}挠了挠你的下巴，像在逗猫',
          meDesc: '你挠了挠{partner}的下巴，指节顺着下颌线刮过' },
        { id: 'a10', name: '背后抱', icon: '🫂', type: 'other', group: 'A',
          desc: '{partner}从背后环住你，用唇蹭了蹭你的脖子',
          meDesc: '你从背后环住{partner}，双臂在他胸前收紧' },
        { id: 'a11', name: '额头吻', icon: '💋', type: 'other', group: 'A',
          desc: '{partner}在你额头落下一吻，很轻',
          meDesc: '你在{partner}额头落下一吻，唇多停了两秒' },
        { id: 'a12', name: '耳语', icon: '👂', type: 'other', group: 'A',
          desc: '{partner}凑近你耳边，低语："在想什么？我倒是想你了"',
          meDesc: '你凑近{partner}耳边，一字一句说给他听' },
        { id: 'a14', name: '揉后颈', icon: '🤚', type: 'other', group: 'A',
          desc: '{partner}的手覆上你的后颈，轻轻揉捏',
          meDesc: '你的手覆上{partner}的后颈，拇指慢慢揉开' },
        { id: 'a15', name: '蹭鼻尖', icon: '👃', type: 'mutual', group: 'A',
          desc: '{partner}低下头，鼻尖抵上你的，轻轻蹭了两下',
          meDesc: '你蹭了蹭{partner}的鼻尖，又蹭了第二下' },
        { id: 'a16', name: '拍背', icon: '👋', type: 'other', group: 'A',
          desc: '{partner}轻拍你的背，像在哄小孩',
          meDesc: '你轻拍{partner}的背，一下一下顺着脊骨往下' },
        { id: 'a17', name: '埋颈窝', icon: '🔥', type: 'mutual', group: 'A',
          desc: '{partner}把脸埋进你颈窝，呼吸一下下打在你皮肤上',
          meDesc: '你把脸埋进{partner}颈窝，双臂环紧他的腰' },
        { id: 'a18', name: '盖毯子', icon: '🧣', type: 'mutual', group: 'A',
          desc: '{partner}把毯子拉过你肩头，边角仔细掖好',
          meDesc: '你把毯子拉过{partner}肩头，把边角掖紧' },
        { id: 'a19', name: '先服软', icon: '🕊️', type: 'mutual', group: 'A',
          desc: '{partner}别开眼不肯看，顿了顿，又转回来用指尖碰了碰你的手',
          meDesc: '你别开眼不肯看，顿了顿，又转回来用指尖碰了碰{partner}的手' },
        { id: 'a20', name: '捧脸', icon: '🫶', type: 'mutual', group: 'A',
          desc: '{partner}双手捧住你的脸，拇指擦过颧骨，目光停住',
          meDesc: '你双手捧住{partner}的脸，拇指擦过颧骨，掌心收拢' },
        // ===== B 组 · 激烈（18，允许稍微露骨）=====
        { id: 'a5', name: '壁咚', icon: '🧱', type: 'other', group: 'B',
          desc: '{partner}将你困在臂弯里，气息逼近',
          meDesc: '你将{partner}推到墙上，手掌按在他耳侧的墙面' },
        { id: 'a13', name: '拽手腕', icon: '✊', type: 'other', group: 'B',
          desc: '{partner}拽住你的手腕，拉进怀里',
          meDesc: '你拽住{partner}的手腕，往自己这边一带' },
        { id: 'a21', name: '压过来', icon: '🛏️', type: 'mutual', group: 'B',
          desc: '{partner}翻身把你压在身下，手撑在你耳侧，眼神没移开过',
          meDesc: '你翻身把{partner}压在身下，握住他两只手腕' },
        { id: 'a22', name: '含指', icon: '👄', type: 'mutual', group: 'B',
          desc: '{partner}含住你的指尖，眼睛一直看着你',
          meDesc: '你把{partner}的指尖含进嘴里，齿尖轻轻划过' },
        { id: 'a23', name: '耳后吻', icon: '💗', type: 'mutual', group: 'B',
          desc: '{partner}的吻落在你耳后，气息比先前的更烫',
          meDesc: '你吻在{partner}耳后，指腹蹭过他耳廓' },
        { id: 'a24', name: '扣腰', icon: '🖐️', type: 'mutual', group: 'B',
          desc: '{partner}的手扣在你腰侧，拇指隔着衣料慢慢摩挲',
          meDesc: '你的手扣在{partner}腰侧，把他往自己这边带' },
        { id: 'a25', name: '留痕', icon: '🫦', type: 'mutual', group: 'B',
          desc: '{partner}在你颈侧反复吻同一处，直到留下痕迹',
          meDesc: '你在{partner}颈侧反复吻同一处，不肯挪开' },
        { id: 'a26', name: '解扣子', icon: '👔', type: 'mutual', group: 'B',
          desc: '{partner}的手落在你第一颗扣子上，停住没动',
          meDesc: '你的手落在{partner}第一颗扣子上，停住没动' },
        { id: 'a27', name: '跨坐', icon: '🖤', type: 'mutual', group: 'B',
          desc: '{partner}跨坐在你身上，双手撑在你两侧',
          meDesc: '你跨坐在{partner}身上，双手撑在他两侧' },
        { id: 'a28', name: '扣住手腕', icon: '⛓️', type: 'mutual', group: 'B',
          desc: '{partner}把你的双手扣过头顶，俯身看你',
          meDesc: '你把{partner}的双手扣过头顶，俯身看他' },
        { id: 'a29', name: '托臀', icon: '🍑', type: 'mutual', group: 'B',
          desc: '{partner}一手托住你的臀，把你的重量整个揽过去，指节陷进衣料',
          meDesc: '你一手托住{partner}的臀，把他的重量整个揽过来，指节陷进衣料' },
        { id: 'a30', name: '缠腿', icon: '🦵', type: 'mutual', group: 'B',
          desc: '{partner}的腿挤进你双膝之间，膝盖抵着你，不肯退开',
          meDesc: '你的腿挤进{partner}双膝之间，膝盖抵着他，不肯退开' },
        { id: 'a31', name: '扯衣领', icon: '👕', type: 'mutual', group: 'B',
          desc: '{partner}攥住你衣领往两侧扯，领口滑到肩头，顿了顿',
          meDesc: '你攥住{partner}衣领往两侧扯，领口滑到他肩头，顿了顿' },
        { id: 'a32', name: '勾颈', icon: '💞', type: 'mutual', group: 'B',
          desc: '{partner}抬手勾住你后颈，拇指抵在下颌线，脸凑近',
          meDesc: '你抬手勾住{partner}后颈，拇指抵在他下颌线，把他带近' },
        { id: 'a33', name: '吻锁骨', icon: '💋', type: 'mutual', group: 'B',
          desc: '{partner}低头吻在你锁骨上，唇停在那里，鼻息压得很低',
          meDesc: '你低头吻在{partner}锁骨上，唇贴住，慢慢移动' },
        { id: 'a34', name: '咬肩', icon: '🦷', type: 'mutual', group: 'B',
          desc: '{partner}低头咬住你肩头，牙齿隔着衣料轻轻磨，鼻尖抵着',
          meDesc: '你低头咬住{partner}肩头，牙齿隔着衣料轻轻磨，唇贴着' },
        { id: 'a35', name: 'Spank', icon: '👋', type: 'mutual', group: 'B',
          desc: '{partner}抬手在你臀上落下一巴掌，掌心发热，旋即停住',
          meDesc: '你抬手在{partner}臀上落下一巴掌，掌心发热，旋即停住' },
        { id: 'a36', name: '拉坐', icon: '🪑', type: 'mutual', group: 'B',
          desc: '{partner}把你抱到腿上，手掌贴在你后背，额头抵着你肩',
          meDesc: '你把{partner}拉到腿上，手掌贴着他后背，手臂收紧' }
    ];

    /* 面板分组展示用：把动作按 group 归类（A / B / 未分组=C 自定义）；抽签不读这里。 */
    var GROUP_META = {
        A: { label: 'A · 温和', sub: '陪伴 · 照料 · 轻浅爱意' },
        B: { label: 'B · 激烈', sub: '亲密张力 · 允许稍微露骨' },
        C: { label: '自定义', sub: '未在 A/B 分组内' }
    };
    function groupActionList(list) {
        var g = { A: [], B: [], C: [] };
        for (var i = 0; i < list.length; i++) {
            var a = list[i];
            if (a.group === 'A') g.A.push(a);
            else if (a.group === 'B') g.B.push(a);
            else g.C.push(a);
        }
        return g;
    }

    /* 回应概率：固定衰减链，不可调（设置项曾只有 replyChance 一个，去掉后设置面板整体退役）。
       回你动作：第 1 个 95%，中了掷第 2 个 72%，再中掷第 3 个 41.8% ——
       第一次回应是义务、第二次是兴趣、第三次是兴起；保留 41.8% 的"他没接住"，是在场感的一部分。 */
    var REPLY_ACTION_CHAIN = [95, 72, 41.8];

    /* 回你普通消息时的话缝穿插：18% 插 1 个动作，中了再 41.8% 插第 2 个（最多 2 个）。
       叠加不占话的数量——话照原分布说，动作是额外插进时间线的身体语言。 */
    var CHAT_ACTION_CHAIN = [18, 41.8];

    /* 回了动作之后再带一句话的概率（%）。没回动作时必说话兜底——他不会完全无视你。 */
    var SPEECH_WITH_ACTION_CHANCE = 41.8;

    /* 主动动作和「主动发送」共用一条时间线：core.js 每次要自动发消息前先问这里一句，
       掷中这个概率就改发动作，没掷中就交还给 core.js 正常发消息。
       所以主动动作没有自己的定时器 —— 开关、间隔都由「聊天设置 → 主动发送」那一个滑块控制。 */
    var PROACTIVE_ACTION_CHANCE = 28.5;   // 每次心跳有多大概率是动作（%）

    var customActions = [];
    var actionOverrides = {};      // 内置动作被改过的字段
    var hiddenBuiltins = {};       // 被隐藏的内置动作
    var currentView = 'grid';      // 'grid' | 'list' | 'add' | 'edit'
    var editingId = null;
    var currentGroup = 'A';        // grid 主视图当前展示的组：'A' 温和 / 'B' 激烈

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
        // 键名统一迁移（一次性、幂等）：milkchat_custom_actions_v1 → milkchat_action_custom_v1
        // 新键已存在时不动（后同步的覆盖先同步的），旧键无论如何都删掉
        try {
            var legacyRaw = localStorage.getItem('milkchat_custom_actions_v1');
            if (legacyRaw !== null) {
                if (localStorage.getItem(STORE_KEY) === null) {
                    localStorage.setItem(STORE_KEY, legacyRaw);
                }
                localStorage.removeItem('milkchat_custom_actions_v1');
            }
        } catch (e) {}
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
        // 「回应设置」已移除（概率改固定衰减链）：清掉遗留的设置数据
        try { localStorage.removeItem(SET_KEY); } catch (e) {}
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

    /* ---------- 统一回应序列 ----------
       动作与话是平级的两种语言，「他回应你」的所有场景共用一套规则：
       掷动作个数（场景决定概率链）→ 掷话 → 完全洗牌 → 按节奏逐个发出。
       洗牌不偏向任何位置：先话后动作、动作中间插话、连续动作（旧"连击"的偶发排列）都可能出现。 */

    /* 回话节奏：跟 core.js 的回复延迟同源，他回动作和回话的时间感一致 */
    function _replyDelay() {
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

    function _shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    /* 按间隔规则把混合序列（{kind:'action',action} / {kind:'speech'}）逐个发出。
       首条走 replyDelay（他"看到并决定回应"的时间）；动作紧接动作用 3~6s 短间隔
       （身体节奏，不该等一个打字的时间）；其余衔接仍走 replyDelay。 */
    function _emitSequence(seq) {
        var delay = 0;
        for (var i = 0; i < seq.length; i++) {
            var gap;
            if (i === 0) gap = _replyDelay();
            else if (seq[i].kind === 'action' && seq[i - 1].kind === 'action') gap = 3000 + Math.random() * 3000;
            else gap = _replyDelay();
            delay += gap;
            (function (item) {
                setTimeout(function () {
                    if (item.kind === 'action') pushSystem(fill(item.action.desc || item.action.meDesc || item.action.name));
                    else sayReply();
                }, delay);
            })(seq[i]);
        }
    }

    /* 掷一条衰减概率链，返回命中个数：chain=[70,50,30] 表示
       70% 有第 1 个 → 中了 50% 有第 2 个 → 再中 30% 有第 3 个。 */
    function _rollChain(chain) {
        var n = 0;
        for (var i = 0; i < chain.length; i++) {
            if (Math.random() * 100 < chain[i]) n++; else break;
        }
        return n;
    }

    /* 你发动作后他的回应：70/50/30 掷动作个数（最多 3 个，互不重复）；
       没回动作则必说一句话兜底；回了动作 50% 再带一句话。话与动作完全洗牌。 */
    function scheduleActionReply(extraDelay, opts) {
        opts = opts || {};
        var exclude = (opts.exclude || []).slice();
        var seq = [];
        var k = _rollChain(REPLY_ACTION_CHAIN);
        for (var i = 0; i < k; i++) {
            var a = pickReplyAction(exclude);
            if (a) { seq.push({ kind: 'action', action: a }); exclude.push(a.id); }
        }
        var speech = seq.length === 0 ? 1 : (Math.random() * 100 < SPEECH_WITH_ACTION_CHANCE ? 1 : 0);
        for (var s = 0; s < speech; s++) seq.push({ kind: 'speech' });
        _shuffle(seq);
        _emitSequence(seq);
    }

    /* ---------- 他主动做动作 ----------
       返回 true = 这次心跳被动作接管（core.js 不再发消息）；false = 交还给 core.js。
       固定 1 个动作 + 50% 带一句话，洗牌——他有时先开口再靠近，有时做完就走。 */
    function fireProactiveAction() {
        var a = pickReplyAction([]);
        if (!a) return false;      // 没有可用动作，别把这次心跳浪费掉
        var seq = [{ kind: 'action', action: a }];
        if (Math.random() * 100 < SPEECH_WITH_ACTION_CHANCE) seq.push({ kind: 'speech' });
        _shuffle(seq);
        // 心跳到点 = 现在：首条立即发出，后续槽位按节奏
        var first = seq.shift();
        if (first.kind === 'action') pushSystem(fill(first.action.desc || first.action.meDesc || first.action.name));
        else sayReply();
        _emitSequence(seq);
        persist();
        return true;
    }

    /* core.js 的主动发送心跳钩子。返回 true 表示"这次我来"，core.js 就不再调 simulateReply。 */
    window._onAutoSendTick = function () {
        if (Math.random() * 100 >= PROACTIVE_ACTION_CHANCE) return false;
        try { return fireProactiveAction(); } catch (e) { return false; }
    };

    /* ---------- 回普通消息时的动作穿插（供 core.js simulateReply 调用）----------
       _mixActionSlots(话数) → 返回与「话数 + 动作数」等长的槽位数组
       （'speech'/'action'，已洗牌）；不插动作时返回 null，调用方走原逻辑。
       心跳发话时跳过（_heartbeatSpeaking 标志）：心跳的动作份额已由 33% 钩子给过，
       发话时再插动作会悄悄抬高他的动作密度。 */
    var _slotExclude = [];
    window._mixActionSlots = function (speechCount) {
        _slotExclude = [];
        if (window._heartbeatSpeaking) return null;
        var n = _rollChain(CHAT_ACTION_CHAIN);
        if (!n) return null;
        var seq = [];
        for (var i = 0; i < speechCount; i++) seq.push('speech');
        for (var j = 0; j < n; j++) seq.push('action');
        return _shuffle(seq);
    };
    window._fireActionSlot = function () {
        var a = pickReplyAction(_slotExclude);
        if (a) { _slotExclude.push(a.id); pushSystem(fill(a.desc || a.meDesc || a.name)); }
        else sayReply();   // 动作库空了，退回说一句话
    };

    /* ---------- 发送动作 ---------- */
    /* 你点动作 = 永远是你对他做（我视角文案）。「他对你做」不走这里，
       由他自己的主动性驱动（心跳 33% / 回你时，pickReplyAction 用 desc）。 */
    function sendAction(id) {
        var a = findAction(id);
        if (!a) return;
        var text = fill(a.meDesc || a.desc);

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
        var item = t.closest('.mc-action-item');
        if (item && item.getAttribute('data-id')) {
            sendAction(item.getAttribute('data-id'));
            return;
        }
        var act = t.closest('[data-act]');
        if (!act) return;
        switch (act.getAttribute('data-act')) {
            case 'tab':      currentGroup = act.getAttribute('data-group') || 'A'; render(); break;
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
        }
    }

    /* ---------- 渲染 ---------- */
    function render() {
        var body = el('mcActionsBody');
        if (!body) return;
        if (currentView === 'grid') { renderGrid(body); }
        else if (currentView === 'list') { renderList(body); }
        else if (currentView === 'add') { renderForm(body, null); }
        else if (currentView === 'edit') { renderForm(body, findAction(editingId)); }
    }

    /* 单张卡片（主视图九宫格）：分组已由顶部 A/B tab 标明，卡片不再显示角标 */
    function gridItemHtml(a) {
        return '<div class="mc-action-item" role="button" data-id="' + esc(a.id) + '">' +
            '<span class="mc-action-icon">' + esc(a.icon || '💫') + '</span>' +
            '<span class="mc-action-name">' + esc(a.name) + '</span>' +
            '</div>';
    }

    /* 单行（管理列表） */
    function listItemHtml(a) {
        var builtin = isBuiltin(a.id);
        var hidden = builtin && isHidden(a.id);
        var edited = builtin && isOverridden(a.id);
        var tags = '';
        if (hidden) tags += '<span class="mc-tag off">已隐藏</span>';
        if (edited) tags += '<span class="mc-tag">已改</span>';
        var badge = a.group === 'B' ? 'b' : (a.group === 'A' ? 'a' : 'c');
        var badgeText = a.group === 'B' ? 'B' : (a.group === 'A' ? 'A' : '·');
        var ops = '<button type="button" class="mc-mini-btn" data-act="edit" data-id="' + esc(a.id) + '">编辑</button>';
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
                '<div class="mc-list-name"><span class="mc-group-badge ' + badge + '">' + badgeText + '</span> ' +
                    esc(a.icon || '💫') + ' ' + esc(a.name) + tags + '</div>' +
                '<div class="mc-list-desc">他：' + esc(fill(a.desc)) + '</div>' +
                (a.meDesc ? '<div class="mc-list-desc">我：' + esc(fill(a.meDesc)) + '</div>' : '') +
            '</div>' +
            '<div class="mc-list-ops">' + ops + '</div>' +
        '</div>';
    }

    /* 按 A / B / C 顺序输出带分组标题的小节（仅展示用，抽签不读这里） */
    function renderGroupSections(g, containerClass, itemFn) {
        var out = '';
        ['A', 'B', 'C'].forEach(function (k) {
            if (!g[k].length) return;
            var meta = GROUP_META[k];
            out += '<div class="mc-group-head"><span>' + meta.label + '</span>' +
                   '<span class="mc-group-sub">' + meta.sub + '（' + g[k].length + '）</span></div>';
            out += '<div class="' + containerClass + '">' + g[k].map(itemFn).join('') + '</div>';
        });
        return out;
    }

    function renderGrid(body) {
        var g = groupActionList(allActions());
        var tabBtn = function (k) {
            var meta = GROUP_META[k];
            return '<button type="button" class="mc-mini-btn mc-tab' + (currentGroup === k ? ' active' : '') +
                '" data-act="tab" data-group="' + k + '">' + esc(meta.label) + '</button>';
        };
        var items = (g[currentGroup] || []).map(gridItemHtml).join('');
        body.innerHTML =
            '<div class="mc-mode-row mc-tabs">' +
                tabBtn('A') + tabBtn('B') +
                '<span class="mc-tab-spacer"></span>' +
                '<button type="button" class="mc-mini-btn" data-act="manage">⚙️ 管理</button>' +
            '</div>' +
            '<div class="mc-actions-grid">' + items + '</div>' +
            '<div class="mc-hint">点一个动作，' + esc(partnerName()) + '会回应你</div>';
    }

    function renderList(body) {
        var g = groupActionList(allRows());
        body.innerHTML =
            '<div class="mc-mode-row">' +
                '<button type="button" class="mc-mini-btn" data-act="back">← 返回</button>' +
                '<button type="button" class="mc-mini-btn" data-act="add-form">➕ 添加动作</button>' +
            '</div>' +
            renderGroupSections(g, 'mc-list', listItemHtml);
    }

    /* 类型下拉框已移除：other/mutual 对抽签完全等价（pickReplyAction 只排除 me），
       三档只剩两种行为，而内置 16 条从未用过 me。新动作固定落 mutual（addCustomAction
       里 type || 'mutual'），编辑时 el('mcActType') 读不到会自动保留原值，无需迁移旧数据。 */
    function renderForm(body, a) {
        var isEdit = !!a;
        body.innerHTML =
            '<div class="mc-mode-row">' +
                '<button type="button" class="mc-mini-btn" data-act="back">← 返回</button>' +
                '<span class="mc-view-label">' + (isEdit ? '编辑动作' : '添加动作') + '</span>' +
            '</div>' +
            '<div class="mc-form">' +
                '<label>动作名称<input type="text" id="mcActName" value="' + esc(a ? a.name : '') + '" placeholder="例如：摸头"></label>' +
                '<label>图标 (emoji)<input type="text" id="mcActIcon" value="' + esc(a ? a.icon : '') + '" placeholder="🤚" maxlength="4"></label>' +
                '<label>他视角描述<textarea id="mcActDesc" placeholder="' + esc(partnerName()) + '揉了揉你的头发">' + esc(a ? a.desc : '') + '</textarea></label>' +
                '<label>我视角描述<textarea id="mcActMe" placeholder="你伸手揉了揉' + esc(partnerName()) + '的头发">' + esc(a ? a.meDesc : '') + '</textarea></label>' +
                (isEdit && isBuiltin(a.id)
                    ? '<div class="mc-hint">这是内置动作，保存后直接替换原内容，不会多出一条。</div>' : '') +
                '<button type="button" class="mc-primary-btn" data-act="' + (isEdit ? 'do-save' : 'do-add') + '">' +
                    (isEdit ? '保存修改' : '添加动作') + '</button>' +
            '</div>';
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
        fireProactiveAction: fireProactiveAction,
        getActions: function () { return allActions(); }
    };

    document.addEventListener('DOMContentLoaded', function () {
        if (window.MoreMenu && typeof window.MoreMenu.registerItem === 'function') {
            window.MoreMenu.registerItem('actions', { ready: true, action: openPanel });
        }
    });
})();
