/**
 * notes.js — 情侣空间：读书笔记（第 6 个 tab）
 *
 * 数据（localforage，键带 SESSION_ID 前缀）：
 *   milkchat_note_books   [{ id, title, author, createdAt }]
 *   milkchat_note_entries [{ id, bookId, text, location, createdAt, updatedAt,
 *                            replies: [{ id, text, createdAt, isNew }],
 *                            replyAt }]
 *   replyAt 是创建笔记时就算好、之后永不改写的送达时刻（0 = 这次已读不回）。
 *   不存「等待中 / 已处理」这类会变的状态：云同步恢复是全量覆盖、无合并语义，
 *   两端各自推进状态会重复留言或互相回退。改用 replyAt + replies.length 这两个
 *   不可变事实做判据，天然幂等。
 *   bookId === '__misc__' 表示「未归类散记」，是内置书，不写进 books。
 *
 * 云同步：cloud-sync-engine.js 的 SESSION_TEXT_NEEDLES 登记了 'milkchat_note_' 前缀，
 *   本模块今后新增任何键都会自动进同步包；备份引擎全量遍历 localforage，也会自动带走。
 *
 * 设计纪律：
 *   1) 正文先转义再进 innerHTML，并靠 CSS 的 white-space: pre-wrap 保留换行
 *      —— 动态标签页「文字全挤成一段」就是缺了这两样（CSS 那边已单独修）。
 *   2) 只重渲 #notes-view 内部，不动外层 panel，更不整页 innerHTML 重写
 *      （cinema.js 用 panel.innerHTML 重写，档案页被迫放到 panel 外）。
 *   3) 数据没确认 load 成功前不写回，避免覆盖云端恢复后的历史。
 *   4) 只有 id 会进 onclick 字符串，id 由 _uid 生成（字母数字下划线），用户文本一律 _esc。
 */
(function () {
    'use strict';

    var BOOKS_KEY = 'milkchat_note_books';
    var ENTRIES_KEY = 'milkchat_note_entries';
    var MISC_ID = '__misc__';
    var MISC_TITLE = '未归类散记';

    var _books = [];
    var _entries = [];
    var _settings = {};
    var _loaded = false;
    var _loading = null;
    var _view = 'shelf';          // 'shelf' | 'book'
    var _currentBookId = null;
    var _edit = null;             // { type: 'book' | 'entry', id: string | null }
    var _sheet = null;

    /* ────────────────────────── 工具 ────────────────────────── */

    function _key(base) {
        if (typeof getStorageKey === 'function') {
            try { return getStorageKey(base); } catch (e) {}
        }
        // 兜底也要带 SESSION_ID：云同步白名单只认带会话前缀的键，
        // 少了前缀会变成「能存、但永远不同步」，很难查
        var sid = (typeof SESSION_ID !== 'undefined' && SESSION_ID) ? SESSION_ID + '_' : '';
        return (window.APP_PREFIX || 'CHAT_APP_V3_') + sid + base;
    }

    function _uid(p) {
        return (p || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    }

    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _partnerName() {
        return (typeof settings !== 'undefined' && settings && settings.partnerName) || '梦角';
    }

    function _pad(n) { return n < 10 ? '0' + n : '' + n; }

    function _fmt(ts) {
        var d = new Date(ts), now = new Date();
        var hm = _pad(d.getHours()) + ':' + _pad(d.getMinutes());
        if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
        return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
    }

    function _fmtShort(ts) {
        if (!ts) return '';
        var d = new Date(ts), now = new Date();
        if (d.toDateString() === now.toDateString()) return '今天';
        var y = new Date(now.getTime() - 86400000);
        if (d.toDateString() === y.toDateString()) return '昨天';
        return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }

    function _findBook(id) { return _books.find(function (b) { return b.id === id; }); }
    function _findEntry(id) { return _entries.find(function (n) { return n.id === id; }); }
    function _ofBook(bookId) { return _entries.filter(function (n) { return n.bookId === bookId; }); }
    function _lastTs(bookId) {
        var list = _ofBook(bookId), t = 0;
        list.forEach(function (n) { if (n.createdAt > t) t = n.createdAt; });
        return t;
    }
    function _hasUnread(bookId) {
        return _ofBook(bookId).some(function (n) {
            return (n.replies || []).some(function (r) { return r.isNew; });
        });
    }
    function _anyUnread() {
        return _entries.some(function (n) {
            return (n.replies || []).some(function (r) { return r.isNew; });
        });
    }

    /* ────────────────────────── 存储 ────────────────────────── */

    function _normalize() {
        _books = _books.filter(function (b) { return b && b.id; }).map(function (b) {
            return {
                id: String(b.id),
                title: String(b.title || '未命名'),
                author: String(b.author || ''),
                createdAt: Number(b.createdAt) || Date.now()
            };
        });
        _entries = _entries.filter(function (n) { return n && n.id; }).map(function (n) {
            var created = Number(n.createdAt) || Date.now();
            return {
                id: String(n.id),
                bookId: String(n.bookId || MISC_ID),
                text: String(n.text || ''),
                location: String(n.location || ''),
                createdAt: created,
                updatedAt: Number(n.updatedAt) || created,
                replies: Array.isArray(n.replies) ? n.replies.map(function (r) {
                    return {
                        id: String(r.id || _uid('r')),
                        text: String(r.text || ''),
                        createdAt: Number(r.createdAt) || Date.now(),
                        isNew: !!r.isNew
                    };
                }) : [],
                replyAt: (n.replyAt === undefined || n.replyAt === null)
                    ? undefined : (Number(n.replyAt) || 0)
            };
        });
        // 指向已删除书的笔记归到散记，避免变成看不见的孤儿
        var ids = {};
        _books.forEach(function (b) { ids[b.id] = 1; });
        _entries.forEach(function (n) {
            if (n.bookId !== MISC_ID && !ids[n.bookId]) n.bookId = MISC_ID;
        });
    }

    function loadNotesData() {
        if (_loading) return _loading;
        _loading = (async function () {
            try {
                var b = await localforage.getItem(_key(BOOKS_KEY));
                var e = await localforage.getItem(_key(ENTRIES_KEY));
                var s = await localforage.getItem(_key('csSpaceSettings'));
                _books = Array.isArray(b) ? b : [];
                _entries = Array.isArray(e) ? e : [];
                _settings = s || {};
                _normalize();
                _loaded = true;
            } catch (err) {
                console.warn('[Notes] load 失败', err);
            } finally {
                _loading = null;
            }
            return _loaded;
        })();
        return _loading;
    }

    async function saveNotesData() {
        if (!_loaded) {
            console.warn('[Notes] 数据尚未确认加载成功，跳过本次保存，避免覆盖历史');
            return;
        }
        try {
            await localforage.setItem(_key(BOOKS_KEY), _books);
            await localforage.setItem(_key(ENTRIES_KEY), _entries);
        } catch (e) {
            console.warn('[Notes] save 失败', e);
        }
    }

    /* ────────────────── 他的留言（复用字卡库 + 空间设置） ────────────────── */
    //
    // 跟动态评论同源：内容来自 customReplies 字卡库，等待时间来自 csSpaceSettings，
    // 「已读不回」「评论多句拼接」「表情混入」三个开关也沿用同一份设置。
    // 不复用 moments.js 的内部函数，是为了让本模块可以整块摘掉而不留残骸。

    function _shouldReply() {
        if (!_settings.allowReadNoReply) return true;
        var chance = Math.max(0, Math.min(1, Number(_settings.readNoReplyChance) || 0));
        return Math.random() >= chance;
    }

    function _pickReplyText() {
        var pool = window._customReplies || (typeof customReplies !== 'undefined' ? customReplies : []) || [];
        if (!pool.length) return null;
        var n = _settings.cmtCombineCards ? 1 + Math.floor(Math.random() * 3) : 1;
        var t = '';
        for (var i = 0; i < n; i++) {
            t += pool[Math.floor(Math.random() * pool.length)];
            if (i < n - 1) t += '。';
        }
        if (_settings.emojiMixEnabled) {
            var em = window.customEmojis || (typeof customEmojis !== 'undefined' ? customEmojis : []) || [];
            if (em.length && Math.random() < 0.2) {
                var e = em[Math.floor(Math.random() * em.length)];
                t = Math.random() < 0.5 ? e + ' ' + t : t + ' ' + e;
            }
        }
        return t || null;
    }

    function _scheduleReply(entry) {
        var minMs = (Number(_settings.dlyMin) || 5) * 60000;
        var maxMs = Math.max(minMs, (Number(_settings.dlyMax) || 20) * 60000);
        var delay = minMs + Math.random() * (maxMs - minMs);
        // 「已读不回」也在创建时掷一次并把结果固化：0 表示这次不回应，之后永不改写。
        // 若留到兑现时再掷，两端会各掷一次，同步覆盖后结果对不上。
        entry.replyAt = _shouldReply() ? Date.now() + delay : 0;
    }

    // 由 app.js 的 30 秒后台轮询调用；切进笔记 tab 时也会主动调一次，保证到期即兑现。
    window.checkNotesStatus = async function () {
        if (!_loaded) {
            var ok = await loadNotesData();
            if (!ok) return;
        }
        var now = Date.now(), changed = false;
        _entries.forEach(function (n) {
            if (!n.replyAt || n.replyAt > now) return;
            if (n.replies.length) return;             // 已经留过言，幂等，不重复推
            var text = _pickReplyText();
            if (!text) return;                       // 字卡库为空就不硬凑，下次轮询再试
            n.replies.push({ id: _uid('r'), text: text, createdAt: now, isNew: true });
            changed = true;
        });
        if (!changed) return;
        await saveNotesData();
        _updateUnreadDot();
        // 只重渲列表容器；编辑弹层在 body 层，不受影响，正在输入的内容不会丢
        _render();
    };

    /* ────────────────────────── 渲染 ────────────────────────── */

    function _render() {
        var root = document.getElementById('notes-view');
        if (root) root.innerHTML = _view === 'shelf' ? _shelfHtml() : _bookHtml();
    }

    function _shelfHtml() {
        var h = '<div class="nt-hd"><span class="nt-hd-title">读书笔记</span>'
            + '<button class="cs-icon-btn" onclick="window._notesNewBook()" title="新建一本书"><i class="fas fa-plus"></i></button></div>'
            + '<div class="nt-sub">' + _books.length + ' 本书 · ' + _entries.length + ' 条笔记</div>';

        var list = _books.slice().sort(function (a, b) { return _lastTs(b.id) - _lastTs(a.id); });
        h += '<div class="nt-shelf-grid">';
        list.forEach(function (b) {
            h += _bookCardHtml(b.id, b.title, b.author, false);
        });
        h += _bookCardHtml(MISC_ID, MISC_TITLE, '不属于任何书的随手记', true);
        h += '</div>';

        if (!_books.length && !_ofBook(MISC_ID).length) {
            h += '<div class="nt-empty"><i class="fas fa-book-open"></i>'
                + '<div>还没有书<br>先建一本，再往里记</div></div>';
        }
        h += '<button class="nt-add-btn" onclick="window._notesNewBook()">+ 新建一本书</button>';
        return h;
    }

    function _bookCardHtml(id, title, author, isMisc) {
        var count = _ofBook(id).length;
        var last = _lastTs(id);
        var h = '<div class="nt-book' + (isMisc ? ' nt-misc' : '') + '" onclick="window._notesOpenBook(\'' + id + '\')">'
            + '<div class="nt-book-main">'
            + '<div class="nt-book-title">' + _esc(title)
            + (_hasUnread(id) ? '<span class="nt-book-dot"></span>' : '') + '</div>'
            + '<div class="nt-book-meta">' + (author ? _esc(author) + ' · ' : '')
            + count + ' 条' + (last ? ' · ' + _fmtShort(last) : '') + '</div>'
            + '</div>';
        if (!isMisc) {
            h += '<button class="nt-book-edit" title="编辑" onclick="event.stopPropagation();window._notesEditBook(\'' + id + '\')"><i class="fas fa-pen"></i></button>';
        }
        h += '<i class="fas fa-chevron-right nt-book-arrow"></i></div>';
        return h;
    }

    function _bookHtml() {
        var isMisc = _currentBookId === MISC_ID;
        var book = isMisc ? null : _findBook(_currentBookId);
        var title = isMisc ? MISC_TITLE : (book ? book.title : '未命名');
        var author = book && book.author ? book.author : '';
        var list = _ofBook(_currentBookId).slice().sort(function (a, b) { return b.createdAt - a.createdAt; });

        var h = '<div class="nt-book-hd">'
            + '<button class="cs-icon-btn" onclick="window._notesBackToShelf()"><i class="fas fa-chevron-left"></i></button>'
            + '<div class="nt-book-hd-txt"><div class="nt-book-hd-title">' + _esc(title) + '</div>'
            + '<div class="nt-book-hd-meta">' + (author ? _esc(author) + ' · ' : '')
            + list.length + ' 条 · 按时间 ↓</div></div>'
            + (isMisc ? '' : '<button class="cs-icon-btn" title="编辑这本书" onclick="window._notesEditBook(\'' + _currentBookId + '\')"><i class="fas fa-pen"></i></button>')
            + '</div>';

        if (!list.length) {
            h += '<div class="nt-empty"><i class="fas fa-feather-alt"></i>'
                + '<div>这本书还没有笔记<br>读到哪里，就记到哪里</div></div>';
        }
        list.forEach(function (n) { h += _entryHtml(n); });
        h += '<button class="nt-add-btn" onclick="window._notesNewEntry()">+ 记一条</button>';
        return h;
    }

    function _entryHtml(n) {
        var h = '<div class="nt-entry">';
        if (n.location) h += '<div class="nt-loc">' + _esc(n.location) + '</div>';
        // 正文：_esc 保住尖括号，CSS 的 pre-wrap 保住换行和空行
        h += '<div class="nt-text">' + _esc(n.text) + '</div>';
        h += '<div class="nt-foot"><span>' + _fmt(n.createdAt)
            + (n.updatedAt - n.createdAt > 60000 ? ' · 已编辑' : '') + '</span>'
            + '<span class="nt-ops">'
            + '<button onclick="window._notesEditEntry(\'' + n.id + '\')">编辑</button>'
            + '<button data-notes-del="' + n.id + '" onclick="window._notesDeleteEntry(\'' + n.id + '\')">删除</button>'
            + '</span></div>';
        if (n.replies && n.replies.length) {
            h += '<div class="nt-replies">' + n.replies.map(function (r) {
                return '<div class="nt-reply"><span class="nt-reply-name">' + _esc(_partnerName())
                    + '</span><span class="nt-reply-text">' + _esc(r.text) + '</span></div>';
            }).join('') + '</div>';
        }
        if (n.replyAt && n.replyAt > Date.now() && !n.replies.length) {
            h += '<div class="nt-pending">等他读到这里…</div>';
        }
        h += '</div>';
        return h;
    }

    function _updateUnreadDot() {
        var dot = document.getElementById('notes-unread-dot');
        if (dot) dot.style.display = _anyUnread() ? 'block' : 'none';
    }

    function _markBookRead(bookId) {
        var changed = false;
        _ofBook(bookId).forEach(function (n) {
            (n.replies || []).forEach(function (r) {
                if (r.isNew) { r.isNew = false; changed = true; }
            });
        });
        if (changed) { saveNotesData(); _updateUnreadDot(); }
    }

    /* ────────────────────────── 编辑弹层 ────────────────────────── */

    function _ensureSheet() {
        if (_sheet) return _sheet;
        var el = document.createElement('div');
        el.id = 'notes-sheet';
        el.className = 'cs-sheet';
        el.innerHTML =
            '<div class="cs-sheet-handle-bar"></div>' +
            '<div class="cs-sheet-header">' +
                '<button type="button" data-notes-act="cancel">取消</button>' +
                '<span id="nt-sheet-title">记一条</span>' +
                '<button type="button" class="cs-submit-btn" data-notes-act="save">保存</button>' +
            '</div>' +
            '<div class="nt-sheet-body">' +
                '<input id="nt-f-title" class="nt-input" type="text" maxlength="60" placeholder="书名">' +
                '<input id="nt-f-author" class="nt-input" type="text" maxlength="40" placeholder="作者（可留空）">' +
                '<input id="nt-f-loc" class="nt-input" type="text" maxlength="80" placeholder="位置，如：卷三 · p.87（可留空）">' +
                '<textarea id="nt-f-text" class="cs-compose-ta nt-textarea" placeholder="写点什么…可以换行"></textarea>' +
                '<button type="button" id="nt-del-book" class="nt-del-link">删除这本书</button>' +
            '</div>';
        document.body.appendChild(el);
        el.querySelector('[data-notes-act="cancel"]').addEventListener('click', _closeSheet);
        el.querySelector('[data-notes-act="save"]').addEventListener('click', _saveFromSheet);
        el.querySelector('#nt-del-book').addEventListener('click', function () {
            if (!_edit || _edit.type !== 'book' || !_edit.id) return;
            _notesDeleteBook(_edit.id, this);
        });
        _sheet = el;
        return el;
    }

    function _row(el, sel, show) {
        var node = el.querySelector(sel);
        if (node) node.style.display = show ? '' : 'none';
    }

    function _openSheet(edit) {
        if (!_loaded) { console.warn('[Notes] 数据未就绪，稍后再试'); return; }
        _edit = edit;
        var el = _ensureSheet();
        var isBook = edit.type === 'book';
        el.querySelector('#nt-sheet-title').textContent = isBook
            ? (edit.id ? '编辑这本书' : '新建一本书')
            : (edit.id ? '编辑笔记' : '记一条');

        _row(el, '#nt-f-title', isBook);
        _row(el, '#nt-f-author', isBook);
        _row(el, '#nt-f-loc', !isBook);
        _row(el, '#nt-f-text', !isBook);
        _row(el, '#nt-del-book', isBook && !!edit.id);

        var b = isBook && edit.id ? _findBook(edit.id) : null;
        var n = !isBook && edit.id ? _findEntry(edit.id) : null;
        el.querySelector('#nt-f-title').value = b ? b.title : '';
        el.querySelector('#nt-f-author').value = b ? b.author : '';
        el.querySelector('#nt-f-loc').value = n ? n.location : '';
        el.querySelector('#nt-f-text').value = n ? n.text : '';
        var del = el.querySelector('#nt-del-book');
        del.dataset.armed = '';
        del.textContent = '删除这本书';

        el.classList.add('cs-sheet-open');
        var ov = document.getElementById('cs-overlay');
        if (ov) ov.classList.add('cs-overlay-on');
        setTimeout(function () {
            var first = el.querySelector(isBook ? '#nt-f-title' : '#nt-f-text');
            if (first) first.focus();
        }, 350);
    }

    function _closeSheet() {
        if (_sheet) _sheet.classList.remove('cs-sheet-open');
        var ov = document.getElementById('cs-overlay');
        if (ov && !document.querySelectorAll('.cs-sheet.cs-sheet-open').length) {
            ov.classList.remove('cs-overlay-on');
        }
        _edit = null;
    }

    function _saveFromSheet() {
        if (!_edit || !_sheet || !_loaded) return;
        var el = _sheet;
        if (_edit.type === 'book') {
            var title = el.querySelector('#nt-f-title').value.trim();
            if (!title) { el.querySelector('#nt-f-title').focus(); return; }
            var author = el.querySelector('#nt-f-author').value.trim();
            var b = _edit.id ? _findBook(_edit.id) : null;
            if (b) { b.title = title; b.author = author; }
            else _books.unshift({ id: _uid('b'), title: title, author: author, createdAt: Date.now() });
        } else {
            var text = el.querySelector('#nt-f-text').value.trim();
            if (!text) { el.querySelector('#nt-f-text').focus(); return; }
            var loc = el.querySelector('#nt-f-loc').value.trim();
            var n = _edit.id ? _findEntry(_edit.id) : null;
            if (n) {
                n.text = text; n.location = loc; n.updatedAt = Date.now();
            } else {
                var entry = {
                    id: _uid('n'),
                    bookId: _currentBookId || MISC_ID,
                    text: text, location: loc,
                    createdAt: Date.now(), updatedAt: Date.now(),
                    replies: []
                };
                _scheduleReply(entry);
                _entries.unshift(entry);
            }
        }
        saveNotesData();
        _closeSheet();
        _render();
        _updateUnreadDot();
    }

    // 两段式删除：第一次点变成「再点一次」，3 秒内没确认就复原，不用原生 confirm 打断输入
    function _arm(btn, armedLabel, normalLabel) {
        if (!btn) return false;
        if (btn.dataset.armed !== '1') {
            btn.dataset.armed = '1';
            btn.textContent = armedLabel;
            setTimeout(function () {
                if (!btn.isConnected) return;
                btn.dataset.armed = '';
                btn.textContent = normalLabel;
            }, 3000);
            return false;
        }
        return true;
    }

    function _notesDeleteBook(id, btn) {
        if (!_arm(btn, '再点一次，笔记会移到散记', '删除这本书')) return;
        _ofBook(id).forEach(function (n) { n.bookId = MISC_ID; });
        _books = _books.filter(function (b) { return b.id !== id; });
        saveNotesData();
        _closeSheet();
        _view = 'shelf'; _currentBookId = null;
        _render(); _updateUnreadDot();
    }

    /* ────────────────────────── 对外接口 ────────────────────────── */

    window._notesInit = async function () {
        if (!_loaded) await loadNotesData();
        await window.checkNotesStatus();
        _render();
        _updateUnreadDot();
    };

    window._notesOpenBook = async function (id) {
        if (!_loaded) await loadNotesData();
        _currentBookId = id;
        _view = 'book';
        _markBookRead(id);
        _render();
        _updateUnreadDot();
    };

    window._notesBackToShelf = function () {
        _view = 'shelf'; _currentBookId = null; _render();
    };

    window._notesNewBook = function () { _openSheet({ type: 'book', id: null }); };
    window._notesEditBook = function (id) { _openSheet({ type: 'book', id: id }); };
    window._notesNewEntry = function () { _openSheet({ type: 'entry', id: null }); };
    window._notesEditEntry = function (id) { _openSheet({ type: 'entry', id: id }); };

    window._notesDeleteEntry = function (id) {
        var btn = document.querySelector('[data-notes-del="' + id + '"]');
        if (!_arm(btn, '再点一次删除', '删除')) return;
        _entries = _entries.filter(function (n) { return n.id !== id; });
        saveNotesData();
        _render();
        _updateUnreadDot();
    };

    // 云端恢复后页面会 reload（cloud-sync-engine.js 末尾），这里仍留一个手动重载口子
    window.reloadNotesData = async function () {
        _loaded = false;
        await loadNotesData();
        _render();
        _updateUnreadDot();
    };

    /* ────────────────────────── 启动 ────────────────────────── */
    // 等 SESSION_ID 就绪再读数据，避免读到默认存储位置（anniversary.js 踩过这个坑）。
    // 后台兑现交给 app.js 的 30 秒轮询；这里只负责首屏把未读红点点亮。
    function _boot() {
        if (typeof localforage === 'undefined' || typeof SESSION_ID === 'undefined' || !SESSION_ID) {
            setTimeout(_boot, 500);
            return;
        }
        window.checkNotesStatus();
    }
    setTimeout(_boot, 1200);
})();
