/* ============================================================
   日常（Daily）—— 习惯 + 待办 的统一外壳
   - 只做 UI 收拢：两个模块各自建好的面板 DOM 被搬进本外壳的两个 tab
   - 完成打卡 / 勾选后的字卡反馈显示在外壳顶部反馈区，不再进聊天流
   - 反馈只存内存：关掉面板 / 刷新即消失，零新增存储键、零云同步改动
   - 两个模块仍各自持有自己的数据与气泡渲染，本文件不碰
   ============================================================ */

(function () {
    var FEEDBACK_LABEL = '做完啦 · 他回的一句';
    var lastFeedback = '';
    var activeTab = 'habit';

    function el(id) { return document.getElementById(id); }

    /* 让两个模块先按各自原有逻辑建好面板（含绑在 body 上的事件委托），
       再把「面板节点」搬进外壳的 pane。监听器绑在节点本身，搬运不会丢，
       这样就避开了「容器换掉后事件委托失效」那个坑。 */
    function ensureModulesDOM() {
        try {
            if (window.Habits && typeof window.Habits.ensureDOM === 'function') window.Habits.ensureDOM();
            if (window.Todos && typeof window.Todos.ensureDOM === 'function') window.Todos.ensureDOM();
        } catch (e) { console.warn('[daily] 模块面板初始化失败:', e); }
        var hp = el('mcDailyHabitPane'), tp = el('mcDailyTodoPane');
        var hPanel = el('mcHabitsPanel'), tPanel = el('mcTodosPanel');
        if (hp && hPanel && hPanel.parentNode !== hp) hp.appendChild(hPanel);
        if (tp && tPanel && tPanel.parentNode !== tp) tp.appendChild(tPanel);
    }

    function ensureDOM() {
        if (el('mcDailyOverlay')) return;
        var wrap = document.createElement('div');
        wrap.id = 'mcDailyOverlay';
        wrap.className = 'mc-daily-overlay';
        wrap.innerHTML =
            '<div class="mc-daily-panel" id="mcDailyPanel">' +
                '<div class="mc-daily-head">' +
                    '<span class="mc-daily-title">✦ 日常</span>' +
                    '<button class="mc-daily-close" id="mcDailyClose" type="button" aria-label="关闭">✕</button>' +
                '</div>' +
                '<div class="mc-daily-tabs" id="mcDailyTabs">' +
                    '<button class="mc-daily-tab active" type="button" data-tab="habit">习惯</button>' +
                    '<button class="mc-daily-tab" type="button" data-tab="todo">待办</button>' +
                '</div>' +
                '<div class="mc-daily-feedback" id="mcDailyFeedback" style="display:none;">' +
                    '<div class="mc-daily-feedback-label">' + FEEDBACK_LABEL + '</div>' +
                    '<div class="mc-daily-feedback-text" id="mcDailyFeedbackText"></div>' +
                '</div>' +
                '<div class="mc-daily-panes">' +
                    '<div class="mc-daily-pane active" id="mcDailyHabitPane" data-pane="habit"></div>' +
                    '<div class="mc-daily-pane" id="mcDailyTodoPane" data-pane="todo"></div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(wrap);
        wrap.addEventListener('click', function (e) { if (e.target === wrap) closePanel(); });
        el('mcDailyClose').addEventListener('click', closePanel);
        el('mcDailyTabs').addEventListener('click', function (e) {
            var tab = e.target.closest ? e.target.closest('[data-tab]') : null;
            if (tab) switchTab(tab.getAttribute('data-tab'));
        });
        ensureModulesDOM();
    }

    function renderActive() {
        try {
            if (activeTab === 'habit' && window.Habits && typeof window.Habits.render === 'function') window.Habits.render();
            if (activeTab === 'todo' && window.Todos && typeof window.Todos.render === 'function') window.Todos.render();
        } catch (e) { console.warn('[daily] 渲染失败:', e); }
    }

    function switchTab(name) {
        if (name !== 'habit' && name !== 'todo') return;
        activeTab = name;
        var tabs = document.querySelectorAll('#mcDailyTabs .mc-daily-tab');
        Array.prototype.forEach.call(tabs, function (b) {
            if (b.getAttribute('data-tab') === name) b.classList.add('active');
            else b.classList.remove('active');
        });
        var panes = document.querySelectorAll('.mc-daily-pane');
        Array.prototype.forEach.call(panes, function (p) {
            if (p.getAttribute('data-pane') === name) p.classList.add('active');
            else p.classList.remove('active');
        });
        renderActive();
    }

    function clearFeedback() {
        lastFeedback = '';
        var fb = el('mcDailyFeedback'), tx = el('mcDailyFeedbackText');
        if (tx) tx.textContent = '';
        if (fb) fb.style.display = 'none';
    }

    /* 面板没打开时直接丢弃：既不进聊天、也不排队等下次打开。 */
    function showFeedback(text) {
        var ov = el('mcDailyOverlay');
        if (!ov || !ov.classList.contains('active')) return;
        var s = String(text == null ? '' : text);
        if (!s) return;
        lastFeedback = s;
        var fb = el('mcDailyFeedback'), tx = el('mcDailyFeedbackText');
        if (!fb || !tx) return;
        tx.textContent = s;                 // 字卡来自用户可编辑的回复库，用 textContent 不解析 HTML
        fb.style.display = '';
    }

    function isTabActive(name) {
        var ov = el('mcDailyOverlay');
        return !!(ov && ov.classList.contains('active') && activeTab === name);
    }

    function openPanel(tab) {
        ensureDOM();
        clearFeedback();
        switchTab(tab === 'todo' ? 'todo' : 'habit');
        var ov = el('mcDailyOverlay');
        if (ov) ov.classList.add('active');
    }
    function closePanel() {
        var ov = el('mcDailyOverlay');
        if (ov) ov.classList.remove('active');
        clearFeedback();
    }

    function boot() {
        if (window.MoreMenu && typeof window.MoreMenu.registerItem === 'function') {
            window.MoreMenu.registerItem('daily', {
                ready: true,
                action: function () { openPanel(); }
            });
        }
    }

    window.Daily = {
        openPanel: openPanel,
        closePanel: closePanel,
        switchTab: switchTab,
        showFeedback: showFeedback,
        isTabActive: isTabActive,
        getActiveTab: function () { return activeTab; },
        getLastFeedback: function () { return lastFeedback; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
