(function () {
    'use strict';

    var PLUGIN_NAME = 'ua_films';

    var SOURCES = [
        {
            id:     'uaserials',
            name:   'UA Serials',
            color:  '#e74c3c',
            base:   'https://uaserials.com',
            search: 'https://uaserials.com/?do=search&subaction=search&story='
        },
        {
            id:     'kinoukr',
            name:   'KinoUkr',
            color:  '#3498db',
            base:   'https://kinoukr.tv',
            search: 'https://kinoukr.tv/?do=search&subaction=search&story='
        },
        {
            id:     'uakino',
            name:   'UA Kino',
            color:  '#27ae60',
            base:   'https://uakino.best',
            search: 'https://uakino.best/?do=search&subaction=search&story='
        }
    ];

    // ─── Хелпери ──────────────────────────────────────────────────────────────

    function fetchHtml(url, success, fail) {
        var proxy = Lampa.Utils
            ? (Lampa.Utils.corsUrl ? Lampa.Utils.corsUrl(url) : url)
            : url;

        $.ajax({
            url:      proxy,
            dataType: 'text',
            timeout:  15000,
            success:  success,
            error:    fail || function () {}
        });
    }

    function parseItems(html, source) {
        var results = [];

        try {
            var parser = new DOMParser();
            var doc    = parser.parseFromString(html, 'text/html');
            var cards  = doc.querySelectorAll(
                '.short-story, .movie-item, .th-item, .item, .film-item, [class*="short"]'
            );

            cards.forEach(function (el) {
                var linkEl  = el.querySelector('a[href]');
                var imgEl   = el.querySelector('img');
                var titleEl = el.querySelector('.title, .th-title, h2, h3, [class*="title"]');
                if (!linkEl) return;

                var href  = linkEl.getAttribute('href') || '';
                var img   = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '') : '';
                var title = titleEl
                    ? titleEl.textContent.trim()
                    : (linkEl.getAttribute('title') || linkEl.textContent.trim());

                if (!href) return;
                if (!href.startsWith('http')) href = source.base + '/' + href.replace(/^\/+/, '');
                if (href === source.base + '/' || href === source.base) return;
                if (!title || title.length < 2) return;

                results.push({ title: title.substring(0, 80), poster: img, url: href, source: source });
            });
        } catch (e) {}

        // Fallback regex
        if (!results.length) {
            var re = /<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']{2,80})["'][^>]*>/gi;
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
            /<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = html.match(patterns[i]);
            if (m && m[1]) return m[1];
        }
        return null;
    }

    // ─── Компонент перегляду результатів ─────────────────────────────────────

    function FilmsComponent(object) {
        var _this = this;
        var movie = object.movie || {};
        var query = (movie.title || movie.original_title || '').trim();

        this.create = function () {
            try { _this.html = Lampa.Template.js('info', {}); }
            catch (e) { _this.html = $('<div class="uaf-page"></div>'); }

            _this.body().html('<div class="uaf-loading">🔍 Шукаємо: ' + query + '</div>');

            if (query) {
                _this.doSearch();
            } else {
                _this.body().html('<div class="uaf-empty">Назва фільму не визначена</div>');
            }

            return _this.html;
        };

        this.body = function () {
            var b = _this.html.find('.info__body');
            return b.length ? b : _this.html;
        };

        this.doSearch = function () {
            var done = 0, all = [];
            SOURCES.forEach(function (src) {
                fetchHtml(
                    src.search + encodeURIComponent(query),
                    function (html) {
                        all = all.concat(parseItems(html, src));
                        if (++done === SOURCES.length) _this.render(all);
                    },
                    function () {
                        if (++done === SOURCES.length) _this.render(all);
                    }
                );
            });
        };

        this.render = function (results) {
            if (!_this.html) return;
            var container = _this.body();
            container.html('');

            if (!results.length) {
                container.html('<div class="uaf-empty">😕 Нічого не знайдено по запиту: ' + query + '</div>');
                return;
            }

            var wrap = $('<div class="uaf-grid"></div>');
            results.forEach(function (item) {
                var poster = item.poster
                    ? '<img class="uaf-poster" src="' + item.poster + '" />'
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
                        Lampa.Noty.show('⚠️ Плеєр не знайдено на цій сторінці');
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

    // ─── Реєстрація як SOURCE (це і є кнопка на картці!) ─────────────────────
    // Lampa показує всі зареєстровані source у списку на картці фільму

    function registerSource() {
        // Lampa.InteractionStorage.add — стандартний спосіб додати пункт у меню картки
        if (Lampa.InteractionStorage && Lampa.InteractionStorage.add) {
            Lampa.InteractionStorage.add({
                name: 'ua_films_watch',

                // Текст кнопки
                title: function () { return 'UA Фільми'; },

                // Показувати завжди
                check: function () { return true; },

                // Дія при натисканні
                activate: function (movie) {
                    Lampa.Activity.push({
                        url:       '',
                        title:     'UA Фільми: ' + (movie.title || movie.original_title || ''),
                        component: PLUGIN_NAME,
                        movie:     movie,
                        page:      1
                    });
                }
            });

            console.log('[UA Films] ✅ InteractionStorage зареєстровано');
            return;
        }

        // Старіший API — Lampa.Storage / Lampa.Action
        if (Lampa.Action && Lampa.Action.add) {
            Lampa.Action.add({
                id:    'ua_films_watch',
                title: 'UA Фільми',
                icon:  'play',
                check: function (movie) { return !!(movie && (movie.title || movie.original_title)); },
                call:  function (movie) {
                    Lampa.Activity.push({
                        url:       '',
                        title:     'UA Фільми: ' + (movie.title || movie.original_title || ''),
                        component: PLUGIN_NAME,
                        movie:     movie,
                        page:      1
                    });
                }
            });

            console.log('[UA Films] ✅ Action.add зареєстровано');
            return;
        }

        // Якщо нічого з вищого не спрацювало — слухаємо подію 'full'
        // і чекаємо DOM через MutationObserver
        console.log('[UA Films] ⚠️ Використовуємо MutationObserver fallback');
        useMutationObserver();
    }

    function useMutationObserver() {
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mut) {
                mut.addedNodes.forEach(function (node) {
                    if (!node.querySelectorAll) return;

                    // Шукаємо контейнер кнопок картки
                    var targets = [];

                    ['.full-start__buttons', '.full-start__footer', '.card-more__buttons'].forEach(function (sel) {
                        node.querySelectorAll(sel).forEach(function (el) { targets.push(el); });
                        if (node.matches && node.matches(sel)) targets.push(node);
                    });

                    targets.forEach(function (holder) {
                        if (holder.querySelector('.ua-films-btn')) return;

                        var activity = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
                        var movie    = activity ? (activity.movie || activity.data) : null;
                        if (!movie) return;

                        var btn = document.createElement('div');
                        btn.className = 'full-start__button selector ua-films-btn';
                        btn.innerHTML = '<span>UA Фільми</span>';

                        btn.addEventListener('click', function () {
                            Lampa.Activity.push({
                                url:       '',
                                title:     'UA Фільми: ' + (movie.title || movie.original_title || ''),
                                component: PLUGIN_NAME,
                                movie:     movie,
                                page:      1
                            });
                        });

                        // Lampa TV навігація
                        $(btn).on('hover:enter', function () {
                            Lampa.Activity.push({
                                url:       '',
                                title:     'UA Фільми: ' + (movie.title || movie.original_title || ''),
                                component: PLUGIN_NAME,
                                movie:     movie,
                                page:      1
                            });
                        });

                        holder.insertBefore(btn, holder.firstChild);
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
                    url:       '',
                    title:     'UA Фільми – пошук',
                    component: PLUGIN_NAME,
                    movie:     { title: '' },
                    page:      1
                });
                Lampa.Controller.toggle('content');
            });

            var list = $(e.body).find('.menu__list');
            if (list.length) list.append(item);
        });
    }

    // ─── Стилі ────────────────────────────────────────────────────────────────

    function addStyles() {
        var css = [
            '.uaf-page{padding:.6em}',
            '.uaf-loading,.uaf-empty{color:#aaa;padding:2em;text-align:center;font-size:1em}',
            '.uaf-grid{display:flex;flex-wrap:wrap;gap:.8em;padding:.8em}',
            '.uaf-card{width:150px;border-radius:8px;overflow:hidden;background:#1a1a2e;',
            'border:2px solid transparent;transition:transform .15s,border-color .15s;flex-shrink:0;cursor:pointer}',
            '.uaf-card.focus,.uaf-card:hover{transform:scale(1.06);border-color:#e5a00d}',
            '.uaf-poster{width:100%;height:215px;object-fit:cover;display:block}',
            '.uaf-noposter{width:100%;height:215px;background:#2a2a4a;',
            'display:flex;align-items:center;justify-content:center;font-size:2em}',
            '.uaf-meta{padding:6px}',
            '.uaf-title{font-size:.75em;color:#fff;line-height:1.3;max-height:2.6em;overflow:hidden;margin-bottom:5px}',
            '.uaf-badge{display:inline-block;font-size:.62em;padding:2px 7px;border-radius:4px;color:#fff;font-weight:700}'
        ].join('');

        if (!document.getElementById('uaf-style')) {
            var el = document.createElement('style');
            el.id  = 'uaf-style';
            el.textContent = css;
            document.head.appendChild(el);
        }
    }

    // ─── Ініціалізація ───────────────────────────────────────────────────────

    function init() {
        addStyles();
        Lampa.Component.add(PLUGIN_NAME, FilmsComponent);
        registerSource();   // ← головне виправлення
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
