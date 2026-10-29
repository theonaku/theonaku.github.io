/* @author 雪里光（DSH 会话 session-fa9fbeb4），2026-10-29
 * 用途：给代码块加语法高亮。
 *      不引第三方 CSS（配色在 modern.css 里自己写，深色浅色各一套），
 *      只引 highlight.js 的核心 + Python 语言包，体积小得多。
 */
(function () {
  'use strict';

  var BASE = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('load failed: ' + src)); };
      document.head.appendChild(s);
    });
  }

  function highlightAll() {
    if (!window.hljs) return;
    var blocks = document.querySelectorAll('pre code');
    for (var i = 0; i < blocks.length; i++) {
      var el = blocks[i];
      // 已经高亮过就跳过
      if (el.dataset.highlighted === 'yes') continue;
      // 猜语言：class 里带 language-xxx 就用，否则自动检测
      var cls = el.className || '';
      var m = cls.match(/language-(\w+)/);
      try {
        if (m) {
          window.hljs.highlightElement(el);
        } else {
          var res = window.hljs.highlightAuto(el.textContent);
          el.innerHTML = res.value;
          el.classList.add('hljs');
        }
        el.dataset.highlighted = 'yes';
      } catch (e) {
        // 高亮失败不影响阅读，保持原样
      }
    }
  }

  function init() {
    if (!document.querySelector('pre code')) return;
    loadScript(BASE + 'highlight.min.js')
      .then(function () { return loadScript(BASE + 'languages/python.min.js'); })
      .then(function () { return loadScript(BASE + 'languages/r.min.js'); })
      .then(function () { return loadScript(BASE + 'languages/javascript.min.js'); })
      .then(highlightAll)
      .catch(function () {
        // 网络不通就保持纯文本，不阻塞页面
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
