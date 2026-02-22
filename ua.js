(function () {
    'use strict';

    var PLUGIN_NAME = 'ua_films';

    var SOURCES = [
        {
            id:     'uaserials',
            name:   'UA Serials',
            color:  '#e74c3c',
            base:   'https://uaserials.com',
            search: 'https://uaserials.com/?do=search&subaction=search&story=',
            browse: 'https://uaserials.com/'
        },
        {
            id:     'kinoukr',
            name:   'KinoUkr',
            color:  '#3498db',
            base:   'https://kinoukr.tv',
            search: 'https://kinoukr.tv/?do=search&subaction=search&story=',
            browse: 'https://kinoukr.tv/filmss/'
        },
        {
            id:     'uakino',
            name:   'UA Kino',
            color:  '#27ae60',
            base:   'https://uakino.best',
            search: 'https://uakino.best/?do=search&subaction=search&story=',
            browse: 'https://uakino.best/filmy/'
        }
    ];

    // ─── Хелпери ──────────────────────────────────────────────────────────────

    function corsUrl(url) {
        if (Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.corsUrl) {
            return Lampa.Api.sources.corsUrl(url);
        }
        return url;
    }

    function fetchHtml(url, success, fail) {
        $.ajax({
            url:      corsUrl(url),
            dataType: 'text',
            timeout:  15000,
            success:  success,
            error:    fail || function () {}
        });
    }

    function parseItems(html, source) {
        var results = [];
        var parser  = new DOMParser();
        var doc     = parser.parseFromString(html, 'text/html');

        var cards = doc.querySelectorAll(
            '.short-story, .movie-item, .th-item, .item, article.card, .film-item, [class*="short"]'
        );

        cards.forEach(function (el) {
            var linkEl  = el.querySelector('a[href]');
            var imgEl   = el.querySelector('img');
            var titleEl = el.querySelector('.title, .th-title, h2, h3, [class*="title"]');

            if (!linkEl) return;

            var href  = linkEl.getAttribute('href') || '';
            var img   = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '') : '';
            var title = titleEl ? titleEl.textContent.trim()
                                : (linkEl.getAttribute('title') || linkEl.textContent.trim());

            if (!href || !href.startsWith('http') && !href.startsWith('/')) return;
            if (!href.startsWith('http')) href = source.base + '/' + href.replace(/^\/+/, '');
            if (href === source.base + '/' || href === source.base) return;
            if (!title || title.length < 2) return;

            results.push({ title: title.substring(0, 80), poster: img, url: href, source: source });
        });

        if (!results.length) {
            var re = /<a[^>]+href=["']([^"']*(?:\/\d{4,}\/|\/film|\/serial|\/movie)[^"']*)["'][^>]*title=["']([^"']+)["'][^>]*>/gi;
            var m;
            while ((m = re.exec(html)) !== null) {
                var h = m[1];
                if (!h.startsWith('http')) h = source.base + '/' + h.replace(/^\/+/, '');
                results.push({ title: m[2].trim(), poster: '', url: h, source: source });
            }
        }

        return results.slice(0, 20);
    }

    function extractPlayer(html) {
        var patterns = [
            /iframe[^>]+src=["']([^"']*(?:moonwalk|ashdi|tortuga|kodik|hdvb|streamguard|videoscdn|cdnvideo|player)[^"']*)["']/i,
            /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /(?:file|url|src)\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
            /<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i,
            /playerjs[^;]*file\s*:\s*["']([^"']+)["']/i
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = html.match(patterns[i]);
            if (m && m[1]) return m[1];
        }
        return null;
    }

    // ─── Компонент ────────────────────────────────────────────────────────────

    function FilmsComponent(object) {
        var _this  = this;
        var movie  = object.movie  || {};
        var mode   = object.mode   || 'search';
        var source = object.source || null;
        var query  = (movie.title || movie.original_title || '').trim();

        this.create = function () {
            try { _this.html = Lampa.Template.js('info', {}); }
            catch (e) { _this.html = $('<div class="uaf-page"></div>'); }

            _this.body().html('<div class="uaf-loading">⏳ Завантаження…</div>');

            if (mode === 'browse' && source) {
                _this.doBrowse(source);
            } else if (query) {
                _this.doSearch();
            } else {
                _this.showSourceMenu();
            }

            return _this.html;
        };

        this.body = function () {
            var b = _this.html.find('.info__body');
            return b.length ? b : _this.html;
        };

        this.showSourceMenu = function () {
            var wrap = $('<div class="uaf-sourcemenu"></div>');
            wrap.append('<div class="uaf-sourcetitle">Оберіть джерело:</div>');
            SOURCES.forEach(function (src) {
                var btn = $('<div class="uaf-srcbtn selector" style="border-color:' + src.color + '">'
                    + '<span style="color:' + src.color + '">' + src.name + '</span>'
                    + '<small>' + src.browse + '</small></div>');
                btn.on('hover:enter click', function () {
                    Lampa.Activity.push({
                        url: '', title: src.name + ' – фільми',
                        component: PLUGIN_NAME, movie: {},
                        mode: 'browse', source: src, page: 1
                    });
                });
                wrap.append(btn);
            });
            _this.body().html(wrap);
            Lampa.Controller.enable('content');
        };

        this.doBrowse = function (src) {
            fetchHtml(src.browse,
                function (html) { _this.render(parseItems(html, src)); },
                function ()     { _this.render([]); }
            );
        };

        this.doSearch = function () {
            var done = 0, all = [];
            SOURCES.forEach(function (src) {
                fetchHtml(src.search + encodeURIComponent(query),
                    function (html) {
                        all = all.concat(parseItems(html, src));
                        if (++done === SOURCES.length) _this.render(all);
                    },
                    function () { if (++done === SOURCES.length) _this.render(all); }
                );
            });
        };

        this.render = function (results) {
            if (!_this.html) return;
            var container = _this.body();
            container.html('');

            if (!results.length) {
                container.html('<div class="uaf-empty">😕 Нічого не знайдено</div>');
                return;
            }

            var wrap = $('<div class="uaf-grid"></div>');
            results.forEach(function (item) {
                var poster = item.poster
                    ? '<img class="uaf-poster" src="' + item.poster + '" loading="lazy" />'
                    : '<div class="uaf-noposter">🎬</div>';
                var card = $('<div class="uaf-card selector">'
                    + poster
                    + '<div class="uaf-meta">'
                    + '<div class="uaf-title">' + item.title + '</div>'
                    + '<span class="uaf-badge" style="background:' + item.source.color + '">' + item.source.name + '</span>'
                    + '</div></div>');
                card.on('hover:enter click', function () { _this.openItem(item); });
                wrap.append(card);
            });

            container.append(wrap);
            Lampa.Controller.enable('content');
        };

        this.openItem = function (item) {
            Lampa.Noty.show('⏳ Завантаження…');
            fetchHtml(item.url,
                function (html) {
                    var playerUrl = extractPlayer(html);
                    if (playerUrl) {
                        Lampa.Player.play({ title: item.title, url: playerUrl });
                    } else {
                        Lampa.Noty.show('⚠️ Плеєр не знайдено');
                        try { window.open(item.url, '_blank'); } catch (e) {}
                    }
                },
                function () { Lampa.Noty.show('❌ Помилка завантаження'); }
            );
        };

        this.pause   = function () {};
        this.resume  = function () {};
        this.back    = function () { Lampa.Activity.backward(); };
        this.destroy = function () { _this.html = null; };
    }

    // ─── Стилі ────────────────────────────────────────────────────────────────

    function addStyles() {
        var css = [
            '.uaf-page{padding:.6em}',
            '.uaf-loading,.uaf-empty{color:#aaa;font-size:1em;padding:2em;text-align:center}',
            '.uaf-sourcemenu{display:flex;flex-direction:column;gap:.8em;padding:1.2em;max-width:480px}',
            '.uaf-sourcetitle{color:#aaa;font-size:.9em;margin-bottom:.3em}',
            '.uaf-srcbtn{padding:.9em 1.2em;border-radius:10px;border:2px solid;background:#1a1a2e;cursor:pointer;transition:transform .15s}',
            '.uaf-srcbtn span{display:block;font-size:1em;font-weight:700;margin-bottom:.2em}',
            '.uaf-srcbtn small{display:block;font-size:.72em;color:#888}',
            '.uaf-srcbtn.focus,.uaf-srcbtn:hover{background:#252545;transform:scale(1.02)}',
            '.uaf-grid{display:flex;flex-wrap:wrap;gap:.8em;padding:.8em}',
            '.uaf-card{width:150px;border-radius:8px;overflow:hidden;cursor:pointer;background:#1a1a2e;border:2px solid transparent;transition:transform .15s,border-color .15s;flex-shrink:0}',
            '.uaf-card.focus,.uaf-card:hover{transform:scale(1.06);border-color:#e5a00d}',
            '.uaf-poster{width:100%;height:215px;object-fit:cover;display:block}',
            '.uaf-noposter{width:100%;height:215px;background:#2a2a4a;display:flex;align-items:center;justify-content:center;font-size:2em}',
            '.uaf-meta{padding:6px}',
            '.uaf-title{font-size:.75em;color:#fff;line-height:1.3;max-height:2.6em;overflow:hidden;margin-bottom:5px}',
            '.uaf-badge{display:inline-block;font-size:.62em;padding:2px 7px;border-radius:4px;color:#fff;font-weight:700}'
        ].join('');

        if (!document.getElementById('uaf-style')) {
            var el = document.createElement('style');
            el.id = 'uaf-style';
            el.textContent = css;
            document.head.appendChild(el);
        }
    }

    // ─── Кнопка на картці фільму ─────────────────────────────────────────────
    // Слухаємо ВСІ можливі варіанти події

    function createBtn(movie) {
        var btn = $('<div class="full-start__button selector">'
            + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"'
            + ' stroke="currentColor" stroke-width="2" stroke-linecap="round">'
            + '<polygon points="5 3 19 12 5 21 5 3"/>'
            + '</svg>'
            + '<span>UA Фільми</span>'
            + '</div>');

        btn.on('hover:enter click', function () {
            Lampa.Activity.push({
                url:       '',
                title:     'UA Фільми: ' + (movie.title || movie.original_title || ''),
                component: PLUGIN_NAME,
                movie:     movie,
                mode:      'search',
                page:      1
            });
        });

        return btn;
    }

    function tryInject(object, movie) {
        // Чекаємо поки DOM картки реально з'явиться
        var attempts = 0;
        var interval = setInterval(function () {
            attempts++;

            var holder = object.find('.full-start__buttons, .full-start__footer, .full-start');

            // Не додаємо двічі
            if (holder.find('.ua-films-btn').length) {
                clearInterval(interval);
                return;
            }

            if (holder.length) {
                var btn = createBtn(movie);
                btn.addClass('ua-films-btn');
                holder.first().prepend(btn);
                clearInterval(interval);
                console.log('[UA Films] ✅ кнопка додана');
            }

            if (attempts > 30) clearInterval(interval); // ~3 секунди максимум
        }, 100);
    }

    function addFullButton() {
        // Варіант 1: стандартна подія full → complite
        Lampa.Listener.follow('full', function (e) {
            console.log('[UA Films] full event:', e.type, e);

            var movie  = (e.data && e.data.movie) || (e.movie) || null;
            var object = e.object || (e.data && e.data.object) || null;

            if (!movie || !object) return;

            // Спрацьовуємо на будь-який тип події (complite / create / render)
            if (e.type === 'complite' || e.type === 'complete' || e.type === 'create' || e.type === 'render') {
                tryInject($(object), movie);
            }
        });

        // Варіант 2: подія card (деякі версії Lampa)
        Lampa.Listener.follow('card', function (e) {
            if (e.type !== 'complite' && e.type !== 'complete') return;
            var movie  = (e.data && e.data.movie) || e.movie || null;
            var object = e.object || (e.data && e.data.object) || null;
            if (!movie || !object) return;
            tryInject($(object), movie);
        });

        // Варіант 3: MutationObserver – чекаємо появи .full-start__buttons у DOM
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mut) {
                mut.addedNodes.forEach(function (node) {
                    if (!node.querySelectorAll) return;

                    var holders = node.querySelectorAll('.full-start__buttons, .full-start__footer');
                    if (!holders.length && node.classList &&
                        (node.classList.contains('full-start__buttons') ||
                         node.classList.contains('full-start__footer'))) {
                        holders = [node];
                    }

                    holders.forEach(function (holder) {
                        var jHolder = $(holder);
                        if (jHolder.find('.ua-films-btn').length) return;

                        // Витягуємо movie з Lampa.Activity
                        var activity = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
                        var movie = activity && (activity.movie || activity.data);
                        if (!movie) return;

                        var btn = createBtn(movie);
                        btn.addClass('ua-films-btn');
                        jHolder.prepend(btn);
                        console.log('[UA Films] ✅ кнопка додана через MutationObserver');
                    });
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ─── Пункт у головному меню ──────────────────────────────────────────────

    function addMenuItem() {
        Lampa.Listener.follow('menu', function (e) {
            if (e.type !== 'render') return;

            var item = $('<li class="menu__item selector">'
                + '<div class="menu__ico">'
                + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
                + '<rect x="2" y="7" width="20" height="15" rx="2"/>'
                + '<polyline points="17 2 12 7 7 2"/>'
                + '</svg></div>'
                + '<div class="menu__text">UA Фільми</div>'
                + '</li>');

            item.on('hover:enter click', function () {
                Lampa.Activity.push({
                    url: '', title: 'UA Фільми',
                    component: PLUGIN_NAME,
                    movie: {}, mode: 'menu', page: 1
                });
                Lampa.Controller.toggle('content');
            });

            var list = $(e.body).find('.menu__list');
            if (list.length) list.append(item);
        });
    }

    // ─── Ініціалізація ───────────────────────────────────────────────────────

    function init() {
        addStyles();
        Lampa.Component.add(PLUGIN_NAME, FilmsComponent);
        addFullButton();
        addMenuItem();
        console.log('[UA Films] ✅ плагін завантажено');
        setTimeout(function () {
            Lampa.Noty && Lampa.Noty.show('✅ UA Films завантажено');
        }, 2000);
    }

    var timer = setInterval(function () {
        if (window.Lampa && Lampa.Listener && Lampa.Component && Lampa.Activity) {
            clearInterval(timer);
            init();
        }
    }, 300);

    setTimeout(function () { clearInterval(timer); }, 30000);

})();
