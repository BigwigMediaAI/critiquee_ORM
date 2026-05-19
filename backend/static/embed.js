/* Critiquee Embeddable Reviews Widget v1
 * Usage:
 *   <div id="critiquee-reviews" data-branch="BRANCH_ID" data-api="https://your-host.com"></div>
 *   <script src="https://your-host.com/api/embed/script" async></script>
 *
 * Backwards compatible: existing snippets using id="handleey-reviews" still work.
 */
(function () {
  'use strict';

  var STYLE_ID = '__handleey_reviews_styles__';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.hl-rw-wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f172a;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px;overflow:hidden;position:relative}',
      '.hl-rw-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}',
      '.hl-rw-title{font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px}',
      '.hl-rw-google{display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;border-radius:50%;background:#fff;border:1px solid #e5e7eb;font-weight:700;color:#4285f4;font-size:12px}',
      '.hl-rw-rating{display:flex;align-items:center;gap:6px;font-size:13px;color:#475569}',
      '.hl-rw-stars{color:#facc15;letter-spacing:1px;font-size:14px}',
      '.hl-rw-track{display:flex;gap:14px;animation:hl-rw-scroll 60s linear infinite;width:max-content}',
      '.hl-rw-wrap:hover .hl-rw-track{animation-play-state:paused}',
      '@keyframes hl-rw-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}',
      '.hl-rw-card{flex:0 0 300px;border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#f8fafc;display:flex;flex-direction:column;gap:8px}',
      '.hl-rw-card-head{display:flex;align-items:center;gap:10px}',
      '.hl-rw-avatar{width:34px;height:34px;border-radius:50%;background:#e0e7ff;color:#4338ca;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;flex:0 0 34px}',
      '.hl-rw-author{font-weight:600;font-size:13px;color:#0f172a}',
      '.hl-rw-date{font-size:11px;color:#94a3b8}',
      '.hl-rw-text{font-size:13px;line-height:1.5;color:#334155;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}',
      '.hl-rw-empty{text-align:center;padding:30px;color:#64748b;font-size:13px}',
      '.hl-rw-foot{font-size:10px;color:#94a3b8;text-align:center;margin-top:10px}',
      '.hl-rw-foot a{color:#94a3b8;text-decoration:none}',
      '@media (prefers-color-scheme: dark){.hl-rw-wrap{background:#0f172a;border-color:#1e293b;color:#e2e8f0}.hl-rw-card{background:#1e293b;border-color:#334155}.hl-rw-author{color:#f1f5f9}.hl-rw-text{color:#cbd5e1}.hl-rw-rating{color:#94a3b8}.hl-rw-google{background:#1e293b;border-color:#334155}}',
    ].join('');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
  }

  function escapeHtml(t) {
    if (!t) return '';
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function starsRow(rating) {
    var full = Math.round(rating || 0);
    var s = '';
    for (var i = 0; i < 5; i++) s += i < full ? '\u2605' : '\u2606';
    return s;
  }

  function renderCard(r) {
    var initial = (r.reviewer_name || '?').charAt(0).toUpperCase();
    return (
      '<div class="hl-rw-card">' +
      '<div class="hl-rw-card-head">' +
      '<div class="hl-rw-avatar">' + escapeHtml(initial) + '</div>' +
      '<div>' +
      '<div class="hl-rw-author">' + escapeHtml(r.reviewer_name || 'Anonymous') + '</div>' +
      '<div class="hl-rw-stars" style="font-size:12px">' + starsRow(r.rating) + '</div>' +
      '</div>' +
      '<div style="margin-left:auto" class="hl-rw-date">' + escapeHtml(r.date || '') + '</div>' +
      '</div>' +
      '<div class="hl-rw-text">' + escapeHtml(r.text || '') + '</div>' +
      '</div>'
    );
  }

  function render(container, data) {
    var business = (data && data.business) || {};
    var stats = (data && data.stats) || {};
    var reviews = (data && data.reviews) || [];

    if (!reviews.length) {
      container.innerHTML =
        '<div class="hl-rw-wrap"><div class="hl-rw-empty">No reviews to display yet.</div></div>';
      return;
    }

    // Duplicate cards so the marquee loops seamlessly
    var cards = reviews.map(renderCard).join('');
    var doubled = cards + cards;

    container.innerHTML =
      '<div class="hl-rw-wrap" role="region" aria-label="Customer reviews">' +
      '<div class="hl-rw-head">' +
      '<div class="hl-rw-title">' +
      '<span class="hl-rw-google">G</span>' +
      escapeHtml(business.name || 'Customer Reviews') +
      '</div>' +
      '<div class="hl-rw-rating">' +
      '<span class="hl-rw-stars">' + starsRow(stats.average_rating) + '</span>' +
      '<span><strong>' + (stats.average_rating || 0) + '</strong> · ' + (stats.total_reviews || 0) + ' reviews</span>' +
      '</div>' +
      '</div>' +
      '<div class="hl-rw-track">' + doubled + '</div>' +
      '<div class="hl-rw-foot">Powered by Critiquee</div>' +
      '</div>';
  }

  function findScriptApi() {
    // Detect API host from the <script src=…> that loaded us
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      var m = src.match(/^(https?:\/\/[^/]+)\/api\/embed\/script/);
      if (m) return m[1];
    }
    return null;
  }

  function init() {
    // Try the new container ID first; fall back to the legacy one for snippets
    // that customers embedded before the brand rename.
    var container = document.getElementById('critiquee-reviews') || document.getElementById('handleey-reviews');
    if (!container) return;
    var branchId = container.getAttribute('data-branch');
    if (!branchId) {
      container.innerHTML =
        '<div class="hl-rw-wrap"><div class="hl-rw-empty">Missing data-branch attribute.</div></div>';
      return;
    }
    var api = container.getAttribute('data-api') || findScriptApi();
    if (!api) {
      container.innerHTML =
        '<div class="hl-rw-wrap"><div class="hl-rw-empty">Cannot determine API host. Add data-api="https://your-host" to the container.</div></div>';
      return;
    }

    injectStyles();
    container.innerHTML =
      '<div class="hl-rw-wrap"><div class="hl-rw-empty">Loading reviews…</div></div>';

    var url = api.replace(/\/$/, '') + '/api/embed/branch/' + encodeURIComponent(branchId) + '/reviews?limit=12';
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) { render(container, d); })
      .catch(function () {
        container.innerHTML =
          '<div class="hl-rw-wrap"><div class="hl-rw-empty">Unable to load reviews right now.</div></div>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
