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
        $.ajax({
            url:      url,
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
                '.short-story, .movie-item, .th-item, .film-item, [class*="short"]'
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
                if (!href) return;
                if (!href.startsWith('http')) href = source.base + '/' + href.replace(/^\/+/, '');
                if (!title || title.length < 2) return;
                results.push({ title: title.substring(0, 80), poster: img, url: href, source: source });
            });
        } catch (e) {}

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

    // ─── Компонент результатів ────────────────────────────────────────────────

    function FilmsComponent(object) {
        var _this = this;
        var movie = object.movie || {};
        var query = (movie.title || movie.original_title || '').trim();

        this.create = function () {
            try { _this.html = Lampa.Template.js('info', {}); }
            catch (e) { _this.html = $('<div class="uaf-page"></div>'); }
            _this.body().html('<div class="uaf-loading">🔍 Шукаємо: ' + query + '</div>');
            if (query) _this.doSearch();
            else _this.body().html('<div class="uaf-empty">Назва фільму не визначена</div>');
            return _this.html;
        };

        this.body = function () {
            var b = _this.html.find('.info__body');
            return b.length ? b : _this.html;
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
                container.html('<div class="uaf-empty">😕 Нічого не знайдено: ' + query + '</div>');
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
                    var url = extractPlayer(html);
                    if (url) {
                        Lampa.Player.play({ title: item.title, url: url });
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

    // ─── Стилі ────────────────────────────────────────────────────────────────

    function addStyles() {
        var css = [
            '.uaf-page,.uaf-loading,.uaf-empty{padding:1em;color:#aaa;text-align:center}',
            '.uaf-grid{display:flex;flex-wrap:wrap;gap:.8em;padding:.8em}',
            '.uaf-card{width:150px;border-radius:8px;overflow:hidden;background:#1a1a2e;',
            'border:2px solid transparent;transition:transform .15s,border-color .15s;flex-shrink:0;cursor:pointer}',
            '.uaf-card.focus,.uaf-card:hover{transform:scale(1.06);border-color:#e5a00d}',
            '.uaf-poster{width:100%;height:215px;object-fit:cover;display:block}',
            '.uaf-noposter{width:100%;height:215px;background:#2a2a4a;display:flex;align-items:center;justify-content:center;font-size:2em}',
            '.uaf-meta{padding:6px}',
            '.uaf-title{font-size:.75em;color:#fff;line-height:1.3;max-height:
