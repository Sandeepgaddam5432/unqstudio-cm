/**
 * Script injected as the very first thing in every preview document. It is a plain string (not a bundled function)
 * so minifiers cannot rewrite it. It implements the iframe side of the postMessage bridge:
 *   iframe → host : console, error, resource-error, ready, inspect:select, screenshot
 *   host → iframe : inspect:enable, inspect:apply, theme, screenshot
 * NOTE: keep this free of backticks and dollar-brace sequences.
 */
export const BRIDGE_SCRIPT = String.raw`(function () {
  var P = window.parent;
  function send(m) { m.__unq = true; try { P.postMessage(m, '*'); } catch (e) {} }
  function str(v, d) {
    d = d || 0;
    try {
      if (v instanceof Error) return v.stack || String(v);
      if (typeof v === 'string') return v;
      if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
      if (v === undefined) return 'undefined';
      if (typeof Element !== 'undefined' && v instanceof Element) return '<' + v.tagName.toLowerCase() + '>';
      if (typeof v === 'object' && v !== null) {
        var seen = [];
        return JSON.stringify(v, function (k, x) {
          if (typeof x === 'object' && x !== null) { if (seen.indexOf(x) > -1) return '[Circular]'; seen.push(x); }
          if (typeof x === 'function') return '[Function]';
          return x;
        }, 2).slice(0, 2000);
      }
      return String(v);
    } catch (e) { return '[Unserializable]'; }
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var orig = console[level];
    console[level] = function () {
      send({ type: 'console', level: level, args: [].map.call(arguments, function (a) { return str(a); }), ts: Date.now() });
      return orig.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) { send({ type: 'resource-error', url: t.src || t.href }); return; }
    send({ type: 'error', message: e.message, file: e.filename, line: e.lineno, col: e.colno, stack: e.error && e.error.stack });
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    send({ type: 'error', message: 'Unhandled promise rejection: ' + str(e.reason), stack: e.reason && e.reason.stack });
  });
  // The preview runs in an opaque-origin sandbox: provide in-memory storage so apps using localStorage keep working.
  function shim(name) {
    try { window[name].getItem('__t'); return; } catch (e) {}
    var data = {};
    var s = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      clear: function () { data = {}; },
      key: function (i) { return Object.keys(data)[i] || null; },
      get length() { return Object.keys(data).length; }
    };
    try { Object.defineProperty(window, name, { value: s, configurable: true }); } catch (e) {}
  }
  shim('localStorage'); shim('sessionStorage');

  var inspecting = false, box = null, label = null;
  function cssPath(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body && parts.length < 8) {
      var tag = el.tagName.toLowerCase();
      if (el.id) { parts.unshift(tag + '#' + el.id); break; }
      var idx = 1, sib = el;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === el.tagName) idx++;
      parts.unshift(tag + ':nth-of-type(' + idx + ')');
      el = el.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  }
  function ensureBox() {
    if (box) return;
    box = document.createElement('div');
    box.setAttribute('data-unq-inspector', '1');
    box.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #ff6a3d;background:rgba(255,106,61,.10);border-radius:2px;transition:all .06s;display:none';
    label = document.createElement('div');
    label.style.cssText = 'position:absolute;left:-2px;top:-22px;background:#09090b;color:#fafafa;font:11px/1 ui-monospace,monospace;padding:4px 6px;border-radius:4px;white-space:nowrap;max-width:420px;overflow:hidden;text-overflow:ellipsis';
    box.appendChild(label);
    document.documentElement.appendChild(box);
  }
  function describe(el) {
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    var own = '';
    for (var i = 0; i < el.childNodes.length; i++) if (el.childNodes[i].nodeType === 3) own += el.childNodes[i].textContent;
    own = own.trim();
    var onlyText = el.children.length === 0 && own.length > 0;
    return {
      tag: el.tagName.toLowerCase(), id: el.id || '', classes: typeof el.className === 'string' ? el.className : '',
      text: onlyText ? own.slice(0, 300) : '', editableText: onlyText,
      html: el.outerHTML.slice(0, 1200), selector: cssPath(el),
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      styles: {
        color: cs.color, backgroundColor: cs.backgroundColor, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        paddingTop: cs.paddingTop, paddingRight: cs.paddingRight, paddingBottom: cs.paddingBottom, paddingLeft: cs.paddingLeft,
        marginTop: cs.marginTop, marginBottom: cs.marginBottom, borderRadius: cs.borderRadius
      }
    };
  }
  function onMove(e) {
    var el = e.target;
    if (!el || el === box || (box && box.contains(el)) || el === document.documentElement || el === document.body) { if (box) box.style.display = 'none'; return; }
    ensureBox();
    var r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
    var cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    label.textContent = el.tagName.toLowerCase() + cls + '  ' + Math.round(r.width) + '×' + Math.round(r.height);
    label.style.top = r.top < 24 ? (r.height + 4) + 'px' : '-22px';
  }
  function onClick(e) {
    var el = e.target;
    if (!el || (box && box.contains(el))) return;
    e.preventDefault(); e.stopPropagation();
    if (el === document.documentElement) return;
    send({ type: 'inspect:select', info: describe(el) });
  }
  function setInspect(on) {
    inspecting = !!on;
    if (inspecting) {
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.documentElement.style.cursor = 'crosshair';
    } else {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.documentElement.style.cursor = '';
      if (box) box.style.display = 'none';
    }
  }
  function shot(id) {
    try {
      var w = Math.max(document.documentElement.clientWidth, 1), h = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      var clone = document.documentElement.cloneNode(true);
      [].forEach.call(clone.querySelectorAll('script,[data-unq-inspector]'), function (n) { n.remove(); });
      var xml = new XMLSerializer().serializeToString(clone);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><foreignObject width="100%" height="100%">' + xml + '</foreignObject></svg>';
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
          var x = c.getContext('2d'); x.scale(2, 2);
          x.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff'; x.fillRect(0, 0, w, h);
          x.drawImage(img, 0, 0);
          send({ type: 'screenshot', id: id, dataUrl: c.toDataURL('image/png') });
        } catch (err) { send({ type: 'screenshot', id: id, error: String(err) }); }
      };
      img.onerror = function () { send({ type: 'screenshot', id: id, error: 'Could not rasterize the page' }); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } catch (err) { send({ type: 'screenshot', id: id, error: String(err) }); }
  }
  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.__unq !== true) return;
    if (m.type === 'inspect:enable') setInspect(m.on);
    else if (m.type === 'theme') document.documentElement.classList.toggle('dark', !!m.dark);
    else if (m.type === 'screenshot') shot(m.id);
    else if (m.type === 'inspect:apply') {
      var el = m.selector && document.querySelector(m.selector);
      if (!el) return;
      if (m.styles) for (var k in m.styles) el.style[k] = m.styles[k];
      if (typeof m.text === 'string' && el.children.length === 0) el.textContent = m.text;
      if (typeof m.classes === 'string') el.className = m.classes;
      send({ type: 'inspect:select', info: describe(el), silent: true });
    }
  });
  window.addEventListener('load', function () { send({ type: 'ready' }); });
})();`
