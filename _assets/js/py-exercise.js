/* @author 雪里光（DSH 会话 session-fa9fbeb4），2026-10-29
 * 用途：给 PlaneArea 的 code 页提供「浏览器里直接跑 Python」的练习框。
 * 取代原来的 DataCamp Light（R），换成本地 Pyodide。
 *
 * 2026-10-29 修正：代码放 <script type="text/plain" class="py-source">（属性里的换行会撑断 HTML）
 * 2026-10-29 修正：界面文字全部英文
 * 2026-10-29 新增：支持 matplotlib 出图——跑完把图转成 <img> 贴在输出下面
 */
(function () {
  'use strict';

  var PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
  var pyodide = null;
  var loading = null;
  var moduleReady = null;

  var TEXT = {
    run: 'Run ▶',
    reset: 'Reset',
    starting: 'Starting Python…',
    loadingPlot: 'Loading matplotlib…',
    running: 'Running…',
    done: 'Done',
    error: 'Error',
    loadFail: 'Load failed',
    pyNotFound: 'Could not load Pyodide — check your connection.'
  };

  // 跑完之后把 matplotlib 的图取出来。
  // 原来的写法只看 matplotlib 有没有被挂进 sys.modules，图没画出来时也会悄悄跳过；
  // 现在只要 pyplot 里还有未关闭的 figure，就逐张转成 base64 PNG。
  var CAPTURE_PLOTS = [
    'import io as _io, base64 as _b64',
    '_plots = []',
    'try:',
    '    import matplotlib.pyplot as _plt',
    '    for _num in _plt.get_fignums():',
    '        _fig = _plt.figure(_num)',
    '        _buf = _io.BytesIO()',
    "        _fig.savefig(_buf, format='png', bbox_inches='tight', dpi=110)",
    "        _plots.append(_b64.b64encode(_buf.getvalue()).decode('ascii'))",
    '    _plt.close("all")',
    'except Exception:',
    '    pass',
    'len(_plots)'
  ].join('\n');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function setStatus(box, msg, kind) {
    var s = box.querySelector('.py-status');
    if (!s) return;
    s.textContent = msg || '';
    s.className = 'py-status' + (kind ? ' py-' + kind : '');
  }

  function loadPyodideOnce() {
    if (pyodide) return Promise.resolve(pyodide);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      if (window.loadPyodide) { resolve(); return; }
      var s = document.createElement('script');
      s.src = PYODIDE_CDN + 'pyodide.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error(TEXT.pyNotFound)); };
      document.head.appendChild(s);
    }).then(function () {
      return window.loadPyodide({ indexURL: PYODIDE_CDN });
    }).then(function (p) {
      pyodide = p;
      return p;
    });
    return loading;
  }

  function ensureModule(py) {
    if (moduleReady) return moduleReady;
    moduleReady = fetch('_assets/py/geometry_module.py')
      .then(function (r) {
        if (!r.ok) throw new Error('geometry_module.py: HTTP ' + r.status);
        return r.text();
      })
      .then(function (code) {
        py.FS.writeFile('/home/pyodide/geometry_module.py', code);
        return py.runPythonAsync(
          'import sys\n' +
          "if '/home/pyodide' not in sys.path:\n" +
          "    sys.path.insert(0, '/home/pyodide')\n"
        );
      });
    return moduleReady;
  }

  // 只有代码里出现 matplotlib 时才加载它（它是个大包，不该每页都下）
  function maybeLoadMatplotlib(py, code) {
    if (code.indexOf('matplotlib') === -1 && code.indexOf('plt.') === -1) {
      return Promise.resolve();
    }
    setStatus(box_status_target, TEXT.loadingPlot, 'busy');
    return py.loadPackage('matplotlib');
  }
  var box_status_target = null;

  function showPlots(box, py) {
    var host = box.querySelector('.py-plots');
    if (!host) {
      host = el('div', 'py-plots');
      box.appendChild(host);
    }
    host.innerHTML = '';
    return py.runPythonAsync(CAPTURE_PLOTS).then(function (count) {
      var n = typeof count === 'number' ? count : 0;
      if (!n) return 0;
      var arr = py.globals.get('_plots');
      for (var i = 0; i < n; i++) {
        var img = el('img', 'py-plot');
        img.src = 'data:image/png;base64,' + arr.get(i);
        host.appendChild(img);
      }
      try { arr.destroy(); } catch (e) { /* 忽略 */ }
      return n;
    });
  }

  function runCode(box) {
    var ta = box.querySelector('.py-code');
    var out = box.querySelector('.py-output');
    var host = box.querySelector('.py-plots');
    if (host) host.innerHTML = '';
    out.textContent = '';
    setStatus(box, TEXT.starting, 'busy');
    box_status_target = box;

    loadPyodideOnce()
      .then(function (py) { return ensureModule(py).then(function () { return py; }); })
      .then(function (py) {
        // 代码里有 matplotlib 就先装包
        if (ta.value.indexOf('matplotlib') !== -1 || ta.value.indexOf('plt.') !== -1) {
          setStatus(box, TEXT.loadingPlot, 'busy');
          return py.loadPackage('matplotlib').then(function () { return py; });
        }
        return py;
      })
      .then(function (py) {
        setStatus(box, TEXT.running, 'busy');
        py.setStdout({ batched: function (s) { out.textContent += s + '\n'; } });
        py.setStderr({ batched: function (s) { out.textContent += s + '\n'; } });
        return py.runPythonAsync(ta.value)
          .then(function () {
            // 成功路径：抓图，然后把状态标成完成
            return showPlots(box, py).then(function (n) {
              setStatus(box, n ? TEXT.done : TEXT.done, 'ok');
            });
          })
          .catch(function (err) {
            // 出错也要试着抓图 —— 画到一半失败时，前面画好的那张还有用
            out.textContent += (out.textContent ? '\n' : '') + String(err.message || err);
            return showPlots(box, py).then(function () {
              setStatus(box, TEXT.error, 'err');
            }).catch(function () {
              setStatus(box, TEXT.error, 'err');
            });
          });
      })
      .catch(function (err) {
        out.textContent = String(err.message || err);
        setStatus(box, TEXT.loadFail, 'err');
      });
  }

  // 源码写在 <script type="text/plain"> 里，为的是不让浏览器当 JS 执行。
  // 但写进 HTML 时 < > & 被转义过（&lt; &gt; &amp;），取出来必须还原，
  // 否则 f'{name:<10}' 会变成 f'{name:&lt;10}'，跑起来是语法错。
  function unescapeHtml(t) {
    return t
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, '\u00a0')
      .replace(/&amp;/g, '&');   // & 放最后，避免二次还原
  }

  function buildBox(box) {
    var src = box.querySelector('.py-source');
    var code = src
      ? unescapeHtml(src.textContent).replace(/^\n+/, '').replace(/\s+$/, '')
      : '';
    if (src) src.remove();

    var height = parseInt(box.getAttribute('data-height') || '200', 10);
    box.classList.add('py-exercise');

    var ta = el('textarea', 'py-code');
    ta.value = code;
    ta.style.height = height + 'px';
    ta.spellcheck = false;
    ta.wrap = 'off';

    var bar = el('div', 'py-bar');
    var run = el('button', 'py-run', TEXT.run);
    var reset = el('button', 'py-reset', TEXT.reset);
    var status = el('span', 'py-status', '');
    bar.appendChild(run);
    bar.appendChild(reset);
    bar.appendChild(status);

    var out = el('pre', 'py-output', '');

    box.innerHTML = '';
    box.appendChild(ta);
    box.appendChild(bar);
    box.appendChild(out);

    run.addEventListener('click', function () { runCode(box); });
    reset.addEventListener('click', function () {
      ta.value = code;
      out.textContent = '';
      var h = box.querySelector('.py-plots');
      if (h) h.innerHTML = '';
      setStatus(box, '');
    });
    ta.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
        ev.preventDefault();
        runCode(box);
      }
      if (ev.key === 'Tab') {
        ev.preventDefault();
        var s = ta.selectionStart, e = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(e);
        ta.selectionStart = ta.selectionEnd = s + 4;
      }
    });
  }

  function init() {
    var list = document.querySelectorAll('[data-py-exercise]');
    for (var i = 0; i < list.length; i++) buildBox(list[i]);
    if (list.length === 0) return;
    loadPyodideOnce().catch(function () { /* reported when the user clicks Run */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
