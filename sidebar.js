/* =========================================================
   sidebar.js — 두 화면이 함께 쓰는 왼쪽 메뉴

   메뉴 HTML 을 여기서 한 번만 만든다.
   두 페이지에 같은 내용을 두 번 적어 두면 한쪽만 고치는 실수가 생긴다.

   쓰는 법:  <body data-page="list">  또는  <body data-page="dashboard">
             <div id="sidebar-slot"></div>
   ========================================================= */
(function () {
  'use strict';

  var slot = document.getElementById('sidebar-slot');
  if (!slot) return;

  var page = document.body.getAttribute('data-page') || '';

  /* ---------- 아이콘 (외부 파일 없이 직접 그린다) ---------- */
  var ICON = {
    list:
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<circle cx="3" cy="4" r="1.1"/><circle cx="3" cy="8" r="1.1"/><circle cx="3" cy="12" r="1.1"/>' +
        '<line x1="6.5" y1="4" x2="14" y2="4"/><line x1="6.5" y1="8" x2="14" y2="8"/>' +
        '<line x1="6.5" y1="12" x2="14" y2="12"/></svg>',
    chart:
      '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<circle cx="8" cy="8" r="5.6"/><path d="M8 2.4 A5.6 5.6 0 0 1 13.6 8 L8 8 Z" fill="currentColor" stroke="none"/>' +
        '</svg>',
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
    var badge = opts.badgeId
      ? '<span class="nav-badge" id="' + opts.badgeId + '"></span>'
      : '';
    var inner = ICON[opts.icon] + '<span class="nav-label">' + opts.label + '</span>' + badge;

    if (opts.action) {
      return '<button type="button" class="' + cls + '" id="' + opts.action + '">' + inner + '</button>';
    }
    return '<a class="' + cls + '" href="' + opts.href + '"' +
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
        '<span class="brand-mark">물품</span>' +
        '<span class="brand-name">우리 반<br>물품 관리</span>' +
      '</a>' +

      '<nav class="nav" aria-label="주요 메뉴">' +
        '<p class="nav-group">관리</p>' +
        itemHtml({ label: '물품 목록', icon: 'list',  href: 'index.html',
                   page: 'list', badgeId: 'nav-count' }) +
        itemHtml({ label: '현황 대시보드', icon: 'chart', href: 'dashboard.html',
                   page: 'dashboard' }) +

        '<p class="nav-group">데이터</p>' +
        itemHtml({ label: '엑셀 업로드', icon: 'upload', href: 'index.html#import' }) +
        itemHtml({ label: '양식 내려받기', icon: 'download', action: 'nav-template' }) +
      '</nav>' +

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

  // 메뉴에서 어디로든 이동하면 서랍을 닫는다
  sidebar.addEventListener('click', function (ev) {
    if (ev.target.closest('.nav-item')) setOpen(false);
  });

  /* ---------- 물품 개수 배지 ---------- */
  // 목록을 읽은 화면이 개수를 알려 준다 (index.js · dashboard.js)
  window.addEventListener('items-loaded', function (ev) {
    var badge = document.getElementById('nav-count');
    if (!badge) return;
    var n = ev.detail && ev.detail.count;
    badge.textContent = (typeof n === 'number') ? n : '';
  });
})();
