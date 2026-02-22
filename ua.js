/**
 * UA Sources – Lampa Plugin
 * Джерела: uaserials.com | kinoukr.tv | uakino.best
 *
 * Встановлення: Lampa → Налаштування → Плагіни → вставте URL цього файлу
 */

(function () {
    'use strict';

    var PLUGIN_NAME = 'ua_sources';

    // ─── Список джерел ────────────────────────────────────────────────────────
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
        // DLE-патерн: клас short-блоку + img + title
        var re = /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*short[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = re.exec(html)) !== null) {
            var block  = m[0];
            var href   = m[1];
            var imgM   = block.match(/<img[^>]+src=["']([^"']+)["']/i);
            var titleM = block.match(/title=["']([^"']+)["']/i)
                      || block.match(/<[^>]+class=["'][^"']*title[^"']*["'][^>]*>([^<]+)<\//i);

            var poster = imgM   ? imgM[1]         : '';
            var title  = titleM ? titleM[1].trim() : '';

            if (!title) {
                var plain = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                title = plain.substring(0, 60) || source.name;
            }

            if (href && !href.startsWith('http')) {
                href = source.base + '/' + href.replace(/^\/+/, '');
            }
            if (href && href.startsWith('http')) {
                results.push({ title: title, poster: poster, url: href, source: source });
            }
        }
        return results.slice(0, 15);
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

    // ─── Компонент сторінки пошуку ────────────────────────────────────────────

    function SearchComponent(object) {
        var _this = this;
        var movie = object.movie || {};
        var query = (movie.title || movie.original_title || '').trim();

        this.create = function () {
            // Lampa надає базовий шаблон; якщо немає – ліпимо свій div
            try {
                _this.html = Lampa.Template.js('info', {});
            } catch (e) {
                _this.html = $('<div class="ua-page"></div>');
            }

            _this.html.find('.info__body, .ua-page').html(
                '<div class="ua-loading">🔍 Пошук«' + (query || '…') + '»</div>'
            );

            if (query) {
                _this.doSearch();
            } else {
                _this.showPrompt();
            }

            return _this.html;
        };

        this.showPrompt = function () {
            var input = $('<div style="padding:1.5em;color:#aaa;">'
                + 'Відкрийте картку фільму і натисніть <b style="color:#e5a00d">UA Онлайн</b>.</div>');
            _this.html.find('.info__body, .ua-page').html(input);
        };

        this.doSearch = function () {
            var done = 0;
            var all  = [];
            SOURCES.forEach(function (src) {
                fetchHtml(
                    src.search + encodeURIComponent(query),
                    function (html) {
                        all = all.concat(parseItems(html, src));
                        done++;
                        if (done === SOURCES.length) _this.render(all);
                    },
                    function () {
                        done++;
                        if (done === SOURCES.length) _this.render(all);
                    }
                );
            });
        };

        this.render = function (results) {
            if (!_this.html) return;

            var container = _this.html.find('.info__body, .ua-page');
            container.html('');

            if (!results.length) {
                container.html('<div class="ua-empty">Нічого не знайдено</div>');
                return;
            }

            var wrap = $('<div class="ua-results"></div>');
            results.forEach(function (item) {
                var poster = item.poster
                    ? '<img class="ua-poster" src="' + item.poster + '" />'
                    : '<div class="ua-noposter"></div>';

                var card = $(
                    '<div class="ua-card selector">'
                    + poster
                    + '<div class="ua-info">'
                    +   '<div class="ua-title">' + (item.title || '') + '</div>'
                    +   '<div class="ua-badge" style="background:' + item.source.color + '">'
                    +     item.source.name
                    +   '</div>'
                    + '</div>'
                    + '</div>'
                );

                card.on('hover:enter click', function () {
                    _this.openItem(item);
                });

                wrap.append(card);
            });

            container.append(wrap);
            Lampa.Controller.enable('content');
        };

        this.openItem = function (item) {
            Lampa.Noty.show('Завантаження…');
            fetchHtml(
                item.url,
                function (html) {
                    var playerUrl = extractPlayer(html);
                    if (playerUrl) {
                        Lampa.Player.play({
                            title: item.title,
                            url:   playerUrl
                        });
                    } else {
                        Lampa.Noty.show('Плеєр не знайдено. Відкриваємо у браузері…');
                        try { window.open(item.url, '_blank'); } catch (e) {}
                    }
                },
                function () {
                    Lampa.Noty.show('Помилка завантаження сторінки');
                }
            );
        };

        this.pause   = function () {};
        this.resume  = function () {};
        this.back    = function () { Lampa.Activity.backward(); };
        this.destroy = function () { _this.html = null; };
    }

    // ─── CSS ─────────────────────────────────────────────────────────────────

    function addStyles() {
        var css = [
            '.ua-page{padding:.5em}',
            '.ua-loading,.ua-empty{color:#aaa;font-size:1em;padding:1.5em;text-align:center}',
            '.ua-results{display:flex;flex-wrap:wrap;gap:.7em;padding:.7em}',
            '.ua-card{width:148px;border-radius:8px;overflow:hidden;cursor:pointer;',
            '  background:#1c1c2e;border:2px solid transparent;',
            '  transition:transform .15s,border-color .15s;flex-shrink:0}',
            '.ua-card.focus,.ua-card:hover{transform:scale(1.05);border-color:#e5a00d}',
            '.ua-poster{width:100%;height:210px;object-fit:cover;display:block}',
            '.ua-noposter{width:100%;height:210px;background:#2a2a4a}',
            '.ua-info{padding:5px}',
            '.ua-title{font-size:.76em;color:#fff;line-height:1.3;',
            '  max-height:2.6em;overflow:hidden;margin-bottom:4px}',
            '.ua-badge{display:inline-block;font-size:.63em;',
            '  padding:2px 6px;border-radius:4px;color:#fff;font-weight:700}'
        ].join('');

        if (!document.getElementById('ua-sources-style')) {
            var el = document.createElement('style');
            el.id  = 'ua-sources-style';
            el.textContent = css;
            document.head.appendChild(el);
        }
    }

    // ─── Кнопка на картці фільму ─────────────────────────────────────────────

    function addFullButton() {
        // 'full' – подія Lampa; тип 'complite' (так, з однією 'i' — це оригінальний опечаток в Lampa)
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;

            var movie = e.data.movie;
            if (!movie) return;

            var btn = $('<div class="full-start__button selector">'
                + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"'
                + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
                + ' stroke-linejoin="round">'
                + '<polygon points="5 3 19 12 5 21 5 3"/>'
                + '</svg>'
                + '<span>UA Онлайн</span>'
                + '</div>');

            btn.on('hover:enter click', function () {
                Lampa.Activity.push({
                    url:       '',
                    title:     'UA Онлайн: ' + (movie.title || movie.original_title || ''),
                    component: PLUGIN_NAME,
                    movie:     movie,
                    page:      1
                });
            });

            // Знаходимо контейнер кнопок; пробуємо кілька варіантів
            var holder = e.object.find('.full-start__buttons');
            if (!holder.length) holder = e.object.find('.full-start');
            if (holder.length) holder.prepend(btn);
        });
    }

    // ─── Пункт у головному меню ──────────────────────────────────────────────

    function addMenuItem() {
        // Подія 'menu' з типом 'render'
        Lampa.Listener.follow('menu', function (e) {
            if (e.type !== 'render') return;

            var item = $('<li class="menu__item selector">'
                + '<div class="menu__ico">'
                + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"'
                + ' stroke="currentColor" stroke-width="2">'
                + '<rect x="2" y="7" width="20" height="15" rx="2"/>'
                + '<polyline points="17 2 12 7 7 2"/>'
                + '</svg>'
                + '</div>'
                + '<div class="menu__text">UA Онлайн</div>'
                + '</li>');

            item.on('hover:enter click', function () {
                Lampa.Activity.push({
                    url:       '',
                    title:     'UA Онлайн – пошук',
                    component: PLUGIN_NAME,
                    movie:     {},
                    page:      1
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
        Lampa.Component.add(PLUGIN_NAME, SearchComponent);
        addFullButton();
        addMenuItem();
        console.log('[UA Sources] ✅ плагін завантажено');
        setTimeout(function () {
            Lampa.Noty && Lampa.Noty.show('✅ UA Sources завантажено');
        }, 2000);
    }

    // Перевіряємо готовність Lampa (може завантажуватись після нас)
    var timer = setInterval(function () {
        if (window.Lampa && Lampa.Listener && Lampa.Component && Lampa.Activity) {
            clearInterval(timer);
            init();
        }
    }, 300);

    // Максимальний таймаут 30 сек
    setTimeout(function () { clearInterval(timer); }, 30000);

})();
