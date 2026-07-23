/* =========================================================
   sidebar.js — 네 화면이 함께 쓰는 왼쪽 메뉴

   메뉴 HTML 을 여기서 한 번만 만든다.
   여러 페이지에 같은 내용을 적어 두면 한쪽만 고치는 실수가 생긴다.

   쓰는 법:  <body data-page="dashboard | items | register | import">
             <div id="sidebar-slot"></div>
   ========================================================= */
(function () {
  'use strict';

  var slot = document.getElementById('sidebar-slot');
  if (!slot) return;

  var page = document.body.getAttribute('data-page') || '';

  /* ---------- 아이콘 (외부 파일 없이 직접 그린다) ---------- */
  var ICON = {
    chart:
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<circle cx="8" cy="8" r="5.6"/><path d="M8 2.4 A5.6 5.6 0 0 1 13.6 8 L8 8 Z" fill="currentColor" stroke="none"/>' +
        '</svg>',
    list:
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<circle cx="3" cy="4" r="1.1"/><circle cx="3" cy="8" r="1.1"/><circle cx="3" cy="12" r="1.1"/>' +
        '<line x1="6.5" y1="4" x2="14" y2="4"/><line x1="6.5" y1="8" x2="14" y2="8"/>' +
        '<line x1="6.5" y1="12" x2="14" y2="12"/></svg>',
    plus:
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>',
    upload:
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<path d="M8 10.5 V2.6"/><path d="M4.8 5.6 L8 2.4 L11.2 5.6"/>' +
        '<path d="M2.6 10.5 v2.2 a0.8 0.8 0 0 0 0.8 0.8 h9.2 a0.8 0.8 0 0 0 0.8-0.8 v-2.2"/></svg>',
    download:
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<path d="M8 2.4 V10.3"/><path d="M4.8 7.1 L8 10.3 L11.2 7.1"/>' +
        '<path d="M2.6 10.5 v2.2 a0.8 0.8 0 0 0 0.8 0.8 h9.2 a0.8 0.8 0 0 0 0.8-0.8 v-2.2"/></svg>'
  };

  /* ---------- 메뉴 만들기 ---------- */
  function itemHtml(opts) {
    var active = opts.page === page;
    var cls = 'nav-item' + (active ? ' is-active' : '');
    var badge = opts.badgeId ? '<span class="nav-badge" id="' + opts.badgeId + '"></span>' : '';
    var inner = ICON[opts.icon] + '<span class="nav-label">' + opts.label + '</span>' + badge;

    return '<a class="' + cls + '" href="' + opts.href + '"' +
           (opts.id ? ' id="' + opts.id + '"' : '') +
           (active ? ' aria-current="page"' : '') + '>' + inner + '</a>';
  }

  slot.innerHTML =
    '<button type="button" class="nav-toggle" id="nav-toggle" ' +
      'aria-label="메뉴 열기" aria-expanded="false" aria-controls="sidebar">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/>' +
        '<line x1="2" y1="12" x2="14" y2="12"/></svg>' +
    '</button>' +

    '<div class="scrim" id="nav-scrim" hidden></div>' +

    '<aside class="sidebar" id="sidebar">' +
      '<a class="brand" href="index.html">' +
        '<span class="brand-mark">길동</span>' +
        '<span class="brand-name">(주)길동물산<br><small>물품 관리</small></span>' +
      '</a>' +

      '<nav class="nav" aria-label="주요 메뉴">' +
        '<p class="nav-group">관리</p>' +
        itemHtml({ label: '현황 대시보드', icon: 'chart', href: 'index.html',
                   page: 'dashboard' }) +
        itemHtml({ label: '물품 목록', icon: 'list', href: 'items.html',
                   page: 'items', badgeId: 'nav-count' }) +
        itemHtml({ label: '물품 등록', icon: 'plus', href: 'register.html',
                   page: 'register' }) +

        '<p class="nav-group">데이터</p>' +
        itemHtml({ label: '엑셀 업로드', icon: 'upload', href: 'import.html',
                   page: 'import' }) +
        itemHtml({ label: '양식 내려받기', icon: 'download', href: 'import.html#template',
                   id: 'nav-template' }) +
      '</nav>' +

      '<div class="theme-box">' +
        '<p class="nav-group">화면</p>' +
        '<div class="theme-row" role="group" aria-label="화면 밝기">' +
          '<button type="button" class="theme-btn" data-theme-set="system">시스템</button>' +
          '<button type="button" class="theme-btn" data-theme-set="light">밝게</button>' +
          '<button type="button" class="theme-btn" data-theme-set="dark">어둡게</button>' +
        '</div>' +
      '</div>' +

      '<p class="nav-foot">여러 사람이 함께 씁니다.<br>바뀐 내용은 새로고침하면 보여요.</p>' +
    '</aside>';

  /* ---------- 좁은 화면에서 서랍 열고 닫기 ---------- */
  var sidebar = document.getElementById('sidebar');
  var toggle  = document.getElementById('nav-toggle');
  var scrim   = document.getElementById('nav-scrim');

  function setOpen(open) {
    sidebar.classList.toggle('is-open', open);
    scrim.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  }

  toggle.addEventListener('click', function () {
    setOpen(!sidebar.classList.contains('is-open'));
  });
  scrim.addEventListener('click', function () { setOpen(false); });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') setOpen(false);
  });

  // 메뉴에서 어디로든 이동하면 서랍을 닫는다 (밝기 버튼은 빼고)
  sidebar.addEventListener('click', function (ev) {
    if (ev.target.closest('.nav-item')) setOpen(false);
  });

  /* ---------- 물품 개수 배지 ---------- */
  // 목록을 읽은 화면이 개수를 알려 준다
  window.addEventListener('items-loaded', function (ev) {
    var badge = document.getElementById('nav-count');
    if (!badge) return;
    var n = ev.detail && ev.detail.count;
    badge.textContent = (typeof n === 'number') ? n : '';
  });

  /* ---------- 화면 밝기 ---------- */
  // 처음 적용은 각 HTML 의 <head> 안 짧은 스크립트가 한다.
  // 화면이 한 번 번쩍였다가 바뀌는 걸 막으려면 그림 그리기 전에 정해야 하기 때문이다.
  var THEME_KEY = 'classInventory.theme';

  function readTheme() {
    try {
      var t = localStorage.getItem(THEME_KEY);
      return (t === 'light' || t === 'dark') ? t : 'system';
    } catch (e) { return 'system'; }
  }

  function applyTheme(t) {
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);

    try {
      if (t === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, t);
    } catch (e) { /* 저장 못 해도 이번 방문에는 적용된다 */ }

    var btns = sidebar.querySelectorAll('.theme-btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-theme-set') === t;
      btns[i].classList.toggle('is-on', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  sidebar.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.theme-btn');
    if (btn) applyTheme(btn.getAttribute('data-theme-set'));
  });

  applyTheme(readTheme());
})();
