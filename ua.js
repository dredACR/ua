(function () {
    'use strict';

    // ─── ДІАГНОСТИЧНИЙ ПЛАГІН ─────────────────────────────────────────────────
    // Встанови його РАЗОМ з основним плагіном.
    // Відкрий картку будь-якого фільму і побачиш спливаючі повідомлення
    // з назвами подій — скажи мені які саме прийшли.

    function waitLampa(cb) {
        var t = setInterval(function () {
            if (window.Lampa && Lampa.Listener && Lampa.Noty) {
                clearInterval(t);
                cb();
            }
        }, 300);
        setTimeout(function () { clearInterval(t); }, 30000);
    }

    function show(msg) {
        try { Lampa.Noty.show(msg); } catch(e) {}
        console.log('[DIAG]', msg);
    }

    waitLampa(function () {
        show('✅ Діагностика запущена');

        // Слухаємо ВСІ події і виводимо їх тип
        var events = ['full', 'online', 'card', 'menu', 'info', 'render', 'start'];

        events.forEach(function (evName) {
            Lampa.Listener.follow(evName, function (e) {
                var objKeys = e.object ? Object.keys(e.object).slice(0,3).join(',') : 'null';
                var dataKeys = e.data ? Object.keys(e.data).slice(0,3).join(',') : 'null';
                show('📡 ' + evName + ':' + e.type + ' obj=' + objKeys + ' data=' + dataKeys);
            });
        });
    });

})();
