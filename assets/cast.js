/**
 * CastTemplateEngine Client Runtime (cast.js)
 * Lightweight, zero-dependency event delegation & reactive DOM updates.
 */
(function (root) {
  'use strict';

  var Cast = {
    /**
     * Delegated event listener on document.
     * @param {string} event Event type (e.g. 'click', 'change', 'input')
     * @param {string} selector CSS selector for target element
     * @param {function(Event, HTMLElement): void} handler Callback receiving event and matched element
     */
    on: function (event, selector, handler) {
      document.addEventListener(event, function (e) {
        var el = e.target && e.target.closest ? e.target.closest(selector) : null;
        if (el) {
          handler.call(el, e, el);
        }
      });
    },

    /**
     * In-place reactive data update (e.g. updating <select> options from JSON data).
     * @param {string|HTMLElement} target Selector or element
     * @param {Array<{value: string, label: string}>|string} data List of options or HTML/text
     */
    update: function (target, data) {
      var el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return;

      if (el.tagName === 'SELECT' && Array.isArray(data)) {
        var frag = document.createDocumentFragment();
        data.forEach(function (opt) {
          var option = document.createElement('option');
          option.value = opt.value !== undefined ? opt.value : opt;
          option.textContent = opt.label !== undefined ? opt.label : opt;
          if (opt.selected) option.selected = true;
          frag.appendChild(option);
        });
        el.innerHTML = '';
        el.appendChild(frag);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (typeof data === 'string') {
        el.innerHTML = data;
      }
    },

    /**
     * Fragment refresh: fetches updated component HTML and swaps in DOM.
     * @param {string|HTMLElement} target Selector or element to replace
     * @param {string} endpoint URL to fetch fragment from
     * @param {object} [options] Fetch options (method, headers, body)
     */
    refresh: function (target, endpoint, options) {
      var el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return Promise.reject(new Error('Target not found'));

      options = options || {};
      options.headers = options.headers || {};
      options.headers['X-Cast-Refresh'] = '1';

      return fetch(endpoint, options)
        .then(function (res) {
          if (!res.ok) throw new Error('Refresh request failed: ' + res.status);
          return res.text();
        })
        .then(function (html) {
          var temp = document.createElement('div');
          temp.innerHTML = html.trim();
          var newEl = temp.firstElementChild;
          if (newEl && el.parentNode) {
            el.parentNode.replaceChild(newEl, el);
            Cast.triggerLoad(newEl);
          }
          return newEl;
        });
    },

    _loadCallbacks: [],

    /**
     * Register a callback to execute on initial DOM load or after element refresh.
     * @param {function(HTMLElement): void} callback
     */
    onLoad: function (callback) {
      Cast._loadCallbacks.push(callback);
    },

    /**
     * Trigger load callbacks for a root container.
     * @param {HTMLElement} [container]
     */
    triggerLoad: function (container) {
      var rootEl = container || document;
      Cast._loadCallbacks.forEach(function (cb) {
        try { cb(rootEl); } catch (err) { console.error(err); }
      });
      document.dispatchEvent(new CustomEvent('cast:load', { detail: { container: rootEl } }));
    }
  };

  // Global handleEvent shortcut
  root.handleEvent = function (event, selector, handler) {
    Cast.on(event, selector, handler);
  };

  // merge onto an existing window.Cast rather than replace it: this runtime is re-emitted inline by @scripts on
  // every page (and, for the SPA client, on every in-app navigation too - see Assets::getScripts()/renderScripts()
  // and cast.module.js's own injectComponentScript()), *after* cast.module.js has already set window.Cast to its
  // own {load, http, page, configure, ...} API - overwriting it here would silently delete that API the moment
  // this runtime next runs (confirmed live: window.Cast.load stops existing right after @scripts' output executes)
  root.Cast = root.Cast ? Object.assign(root.Cast, Cast) : Cast;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { Cast.triggerLoad(document); });
  } else {
    Cast.triggerLoad(document);
  }
})(typeof window !== 'undefined' ? window : this);
