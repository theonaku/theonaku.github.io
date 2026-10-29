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

  // 跑完之后把 matplotlib 的图取出来
  var CAPTURE_PLOTS = [
    'import io as _io, base64 as _b64, sys as _sys',
    '_plots = []',
    "if 'matplotlib' in _sys.modules:",
    '    import matplotlib.pyplot as _plt',
    '    for _num in _plt.get_fignums():',
    '        _fig = _plt.figure(_num)',
    '        _buf = _io.BytesIO()',
    "        _fig.savefig(_buf, format='png', bbox_inches='tight', dpi=110)",
    "        _plots.append(_b64.b64encode(_buf.getvalue()).decode('ascii'))",
    '    _plt.close("all")'
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
    return py.runPythonAsync(CAPTURE_PLOTS).then(function () {
      var arr = py.globals.get('_plots');
      var n = arr.length;
      for (var i = 0; i < n; i++) {
        var img = el('img', 'py-plot');
        img.src = 'data:image/png;base64,' + arr.get(i);
        host.appendChild(img);
      }
      try { arr.destroy(); } catch (e) { /* 忽略 */ }
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
          .then(function () { return showPlots(box, py); })
          .then(function () {
            setStatus(box, TEXT.done, 'ok');
          })
          .catch(function (err) {
            out.textContent += (out.textContent ? '\n' : '') + String(err.message || err);
            setStatus(box, TEXT.error, 'err');
          });
      })
      .catch(function (err) {
        out.textContent = String(err.message || err);
        setStatus(box, TEXT.loadFail, 'err');
      });
  }

  function buildBox(box) {
    var src = box.querySelector('.py-source');
    var code = src ? src.textContent.replace(/^\n+/, '').replace(/\s+$/, '') : '';
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
