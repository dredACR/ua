/**
 * Lampa Plugin – UA Sources
 * Джерела: uaserials.com | kinoukr.tv | uakino.best
 * Встановлення: вставте URL цього файлу в Lampa → Налаштування → Плагіни
 */

(function () {
    'use strict';

    // ─── Конфігурація джерел ───────────────────────────────────────────────────
    var SOURCES = [
        {
            id: 'uaserials',
            name: 'UA Serials',
            url: 'https://uaserials.com/',
            search_url: 'https://uaserials.com/?do=search&subaction=search&story={query}',
            color: '#e74c3c',
            type: 'parse'   // html-парсер
        },
        {
            id: 'kinoukr',
            name: 'KinoUkr',
            url: 'https://kinoukr.tv/filmss/',
            search_url: 'https://kinoukr.tv/?do=search&subaction=search&story={query}',
            color: '#3498db',
            type: 'parse'
        },
        {
            id: 'uakino',
            name: 'UA Kino',
            url: 'https://uakino.best/filmy/',
            search_url: 'https://uakino.best/?do=search&subaction=search&story={query}',
            color: '#2ecc71',
            type: 'parse'
        }
    ];

    // ─── Хелпери ───────────────────────────────────────────────────────────────
    function encodeQuery(str) {
        return encodeURIComponent(str);
    }

    function buildSearchUrl(source, query) {
        return source.search_url.replace('{query}', encodeQuery(query));
    }

    /**
     * Витягує посилання на відео-плеєр зі сторінки фільму.
     * Шукає типові iframe-патерни ukr-сайтів (moonwalk, ashdi, tortuga…).
     */
    function extractPlayerUrl(html) {
        var patterns = [
            /iframe[^>]+src=["']([^"']*(?:moonwalk|ashdi|tortuga|kodik|hdvb|videoframe|uaserials|streamguard)[^"']*)["']/i,
            /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /source\s+src=["']([^"']+\.mp4[^"']*)["']/i,
            /\bsrc=["']([^"']+(?:\.mp4|\.m3u8)[^"']*)["']/i
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = html.match(patterns[i]);
            if (m) return m[1];
        }
        return null;
    }

    /**
     * Парсить HTML-сторінку з результатами пошуку (DLE-движок).
     * Повертає масив { title, poster, url }
     */
    function parseDleResults(html, baseUrl) {
        var results = [];
        // Шукаємо блоки з посиланнями та постерами (DLE типовий паттерн)
        var re = /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*short[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi;
        var titleRe = /title=["']([^"']+)["']/i;
        var m;
        while ((m = re.exec(html)) !== null) {
            var href = m[1];
            var img  = m[2];
            var titleM = m[0].match(titleRe);
            var title = titleM ? titleM[1] : 'Без назви';
            if (!href.startsWith('http')) href = baseUrl + href.replace(/^\//, '');
            results.push({ title: title, poster: img, url: href });
        }
        // Fallback – простіший паттерн
        if (results.length === 0) {
            var re2 = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]{3,80})<\/a>/gi;
            while ((m = re2.exec(html)) !== null) {
                if (/film|serial|movie|watch/i.test(m[1])) {
                    results.push({ title: m[2].trim(), poster: '', url: m[1] });
                }
            }
        }
        return results.slice(0, 20);
    }

    // ─── Основний компонент плагіна ────────────────────────────────────────────
    function UaSourcesPlugin() {}

    UaSourcesPlugin.prototype = {

        /**
         * Пошук по всіх трьох джерелах паралельно.
         * Викликається Lampa при запиті через меню "Онлайн".
         */
        search: function (movie, callback) {
            var query = movie.title || movie.original_title || '';
            if (!query) { callback([]); return; }

            var total   = SOURCES.length;
            var done    = 0;
            var allResults = [];

            SOURCES.forEach(function (source) {
                var searchUrl = buildSearchUrl(source, query);

                Lampa.Api.sources.cors(
                    searchUrl,
                    function (response) {
                        var html = typeof response === 'string' ? response
                            : (response.text || response.data || '');
                        var items = parseDleResults(html, source.url);

                        items.forEach(function (item) {
                            item.source_id   = source.id;
                            item.source_name = source.name;
                            item.source_color = source.color;
                        });

                        allResults = allResults.concat(items);
                        done++;
                        if (done === total) callback(allResults);
                    },
                    function () {
                        // Помилка цього джерела – не зупиняємо решту
                        done++;
                        if (done === total) callback(allResults);
                    }
                );
            });
        },

        /**
         * Відкрити сторінку фільму, витягнути плеєр і запустити.
         */
        open: function (item, callback) {
            Lampa.Api.sources.cors(
                item.url,
                function (response) {
                    var html = typeof response === 'string' ? response
                        : (response.text || response.data || '');
                    var playerUrl = extractPlayerUrl(html);

                    if (playerUrl) {
                        callback({
                            title: item.title,
                            url:   playerUrl
                        });
                    } else {
                        Lampa.Noty.show('Не вдалося знайти відео на сторінці');
                        callback(null);
                    }
                },
                function () {
                    Lampa.Noty.show('Помилка завантаження сторінки');
                    callback(null);
                }
            );
        },

        /**
         * Рендер результатів у вигляді карток Lampa.
         */
        render: function (results) {
            var html = '<div class="ua-sources-results">';

            if (!results || results.length === 0) {
                html += '<div class="ua-sources-empty">Нічого не знайдено</div>';
            } else {
                results.forEach(function (item) {
                    var poster = item.poster
                        ? '<img class="ua-sources-poster" src="' + item.poster + '" />'
                        : '<div class="ua-sources-noposter"></div>';

                    html += '<div class="ua-sources-card selector" data-url="' + item.url + '">'
                          +   poster
                          +   '<div class="ua-sources-info">'
                          +     '<div class="ua-sources-title">' + item.title + '</div>'
                          +     '<div class="ua-sources-badge" style="background:' + (item.source_color || '#555') + '">'
                          +       item.source_name
                          +     '</div>'
                          +   '</div>'
                          + '</div>';
                });
            }
            html += '</div>';
            return html;
        }
    };

    // ─── CSS ───────────────────────────────────────────────────────────────────
    var style = document.createElement('style');
    style.textContent = [
        '.ua-sources-results{display:flex;flex-wrap:wrap;gap:1em;padding:1em;}',
        '.ua-sources-card{width:160px;cursor:pointer;border-radius:8px;overflow:hidden;',
            'background:#1a1a2e;transition:transform .2s;border:2px solid transparent;}',
        '.ua-sources-card:hover,.ua-sources-card.focus{transform:scale(1.05);border-color:#e5a00d;}',
        '.ua-sources-poster{width:100%;height:230px;object-fit:cover;display:block;}',
        '.ua-sources-noposter{width:100%;height:230px;background:#2a2a4a;}',
        '.ua-sources-info{padding:6px;}',
        '.ua-sources-title{font-size:.8em;color:#fff;margin-bottom:4px;',
            'overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
        '.ua-sources-badge{display:inline-block;font-size:.65em;padding:2px 6px;',
            'border-radius:4px;color:#fff;font-weight:bold;}',
        '.ua-sources-empty{color:#aaa;padding:2em;font-size:1.1em;}'
    ].join('');
    document.head.appendChild(style);

    // ─── Реєстрація в Lampa ────────────────────────────────────────────────────
    function initPlugin() {
        // Компонент "Онлайн-джерела"
        Lampa.Component.add('ua_sources_search', {
            create: function () {
                var _this  = this;
                var plugin = new UaSourcesPlugin();
                var movie  = Lampa.Activity.active().activity.movie || {};

                this.html = Lampa.Template.get('info') || document.createElement('div');
                this.html.innerHTML = '<div class="ua-sources-loading">Пошук у ' + SOURCES.length + ' джерелах…</div>';

                plugin.search(movie, function (results) {
                    _this.html.innerHTML = plugin.render(results);

                    // Обробка натискань
                    _this.html.querySelectorAll('.ua-sources-card').forEach(function (card) {
                        card.addEventListener('click', function () {
                            var fakeItem = {
                                title: card.querySelector('.ua-sources-title').textContent,
                                url:   card.dataset.url
                            };
                            plugin.open(fakeItem, function (data) {
                                if (!data) return;
                                Lampa.Player.play({
                                    title:   data.title,
                                    url:     data.url
                                });
                            });
                        });
                    });
                });

                return this.html;
            },
            pause:   function () {},
            resume:  function () {},
            destroy: function () {}
        });

        // Додаємо пункт меню до картки фільму
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                var btn = $('<div class="full-start__button selector">'
                    + '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">'
                    + '<path d="M8 5v14l11-7z"/></svg>'
                    + '<span>UA Джерела</span>'
                    + '</div>');

                btn.on('hover:enter', function () {
                    Lampa.Activity.push({
                        url:       '',
                        title:     'UA Джерела – ' + (e.data.movie.title || ''),
                        component: 'ua_sources_search',
                        movie:     e.data.movie,
                        page:      1
                    });
                });

                e.object.find('.full-start__buttons').append(btn);
            }
        });

        // Окремий елемент у головному меню
        Lampa.Listener.follow('menu', function (e) {
            if (e.type === 'build') {
                var item = $('<li class="menu__item selector">'
                    + '<div class="menu__ico">'
                    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
                    + '<rect x="2" y="7" width="20" height="15" rx="2"/>'
                    + '<polyline points="17 2 12 7 7 2"/>'
                    + '</svg>'
                    + '</div>'
                    + '<div class="menu__text">UA Онлайн</div>'
                    + '</li>');

                item.on('hover:enter', function () {
                    Lampa.Activity.push({
                        url:       '',
                        title:     'UA Онлайн',
                        component: 'ua_sources_search',
                        movie:     {},
                        page:      1
                    });
                });

                e.object.find('.menu__list').append(item);
            }
        });

        Lampa.Noty.show('✅ UA Sources плагін завантажено');
    }

    // Чекаємо готовності Lampa
    if (window.Lampa) {
        initPlugin();
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            var t = setInterval(function () {
                if (window.Lampa && Lampa.Component && Lampa.Listener) {
                    clearInterval(t);
                    initPlugin();
                }
            }, 300);
        });
    }

})();
