/* =========================================================
   dashboard.js — 현황 대시보드 (위젯 4개)
   Supabase 에서 물품을 한 번 읽어와 네 위젯을 모두 계산한다.
   ========================================================= */
(function () {
  'use strict';

  var totalEl  = document.getElementById('w-total');
  var lowEl    = document.getElementById('w-low');
  var donutEl  = document.getElementById('w-donut');
  var recentEl = document.getElementById('w-recent');
  var errorEl  = document.getElementById('load-error');

  var setupBroken = renderSetupWarning(document.getElementById('setup-warning'));

  /* =======================================================
     위젯 1. 총 품목 수
     ======================================================= */
  function renderTotal(items) {
    var total = countItems(items);
    var sum = items.reduce(function (s, it) { return s + it.quantity; }, 0);

    totalEl.innerHTML =
      '<div class="hero">' +
        '<span class="hero-num">' + total + '</span>' +
        '<span class="hero-unit">품목</span>' +
      '</div>' +
      '<p class="hero-note">' +
        (total === 0
          ? '아직 등록된 물품이 없어요.'
          : '수량을 모두 더하면 ' + sum + '개예요.') +
      '</p>';
  }

  /* =======================================================
     위젯 2. 재고 부족 목록 (수량 3개 이하, 적은 것부터)
     ======================================================= */
  function renderLowStock(items) {
    var low = lowStockItems(items);

    if (low.length === 0) {
      lowEl.innerHTML = '<p class="empty">' +
        (items.length === 0 ? '등록된 물품이 없어요.' : '부족한 물품이 없어요.') +
        '</p>';
      return;
    }

    lowEl.innerHTML = '<ul class="mini-list">' + low.map(function (it) {
      var badge = it.quantity === 0
        ? '<span class="badge badge-out">재고 없음</span>'
        : '<span class="badge badge-low">부족</span>';
      return '<li>' +
          '<span class="mini-name">' + escapeHtml(it.name) + '</span>' +
          '<span class="mini-qty">' + it.quantity + '개</span>' +
          badge +
        '</li>';
    }).join('') + '</ul>';
  }

  /* =======================================================
     위젯 3. 카테고리별 분포 — 도넛 차트
     ======================================================= */

  var DONUT_R = 15.9154943;   // 둘레가 딱 100 이 되는 반지름 (계산이 쉬워진다)
  var DONUT_GAP = 0.7;        // 조각 사이 틈. 선을 긋지 않고 여백으로 나눈다.

  function donutSvg(rows, percents, total) {
    var segments = [];
    var cumulative = 0;

    rows.forEach(function (row, i) {
      var len = row.count / total * 100;
      // 조각이 하나뿐이면 틈을 두지 않는다 (동그라미가 잘려 보인다)
      var dash = rows.length === 1 ? 100 : Math.max(len - DONUT_GAP, 0.6);

      segments.push(
        '<circle class="donut-seg" cx="21" cy="21" r="' + DONUT_R + '"' +
          ' fill="none" stroke="var(--series-' + row.slot + ')" stroke-width="4.6"' +
          ' stroke-dasharray="' + dash.toFixed(3) + ' ' + (100 - dash).toFixed(3) + '"' +
          ' stroke-dashoffset="' + (25 - cumulative).toFixed(3) + '">' +
          '<title>' + escapeHtml(row.name) + ' ' + row.count + '개 (' + percents[i] + '%)</title>' +
        '</circle>'
      );
      cumulative += len;
    });

    return '<svg class="donut" viewBox="0 0 42 42" role="img" ' +
             'aria-label="카테고리별 품목 수 도넛 차트. 자세한 값은 옆 표에 있어요.">' +
        segments.join('') +
        '<text x="21" y="19.8" text-anchor="middle" dominant-baseline="middle" ' +
          'class="donut-center-num">' + total + '</text>' +
        '<text x="21" y="25.6" text-anchor="middle" dominant-baseline="middle" ' +
          'class="donut-center-label">품목</text>' +
      '</svg>';
  }

  function renderDonut(items) {
    var rows = categoryBreakdown(items);   // 0개인 카테고리는 빠져서 온다

    if (rows.length === 0) {
      donutEl.innerHTML = '<p class="empty">등록된 물품이 없어요.</p>';
      return;
    }

    var counts = rows.map(function (r) { return r.count; });
    var percents = toPercents(counts);
    var total = counts.reduce(function (s, n) { return s + n; }, 0);

    // 범례에 숫자를 같이 적는다 — 색만으로 읽게 하지 않는다
    var legend = '<ul class="legend">' + rows.map(function (row, i) {
      return '<li>' +
          '<i class="dot dot-' + row.slot + '"></i>' +
          '<span class="legend-name">' + escapeHtml(row.name) + '</span>' +
          '<span class="legend-val">' + row.count + '개 · ' + percents[i] + '%</span>' +
        '</li>';
    }).join('') + '</ul>';

    donutEl.innerHTML = '<div class="donut-wrap">' + donutSvg(rows, percents, total) + legend + '</div>';
  }

  /* =======================================================
     위젯 4. 최근 변경 내역 (수정 시간 최신순 5건)
     ======================================================= */
  function renderRecent(items) {
    var recent = recentChanges(items, 5);

    if (recent.length === 0) {
      recentEl.innerHTML = '<p class="empty">아직 변경 내역이 없어요.</p>';
      return;
    }

    recentEl.innerHTML = '<ul class="mini-list">' + recent.map(function (it) {
      return '<li>' +
          '<span class="mini-name">' +
            escapeHtml(it.name) + ' <span class="mini-side">' + it.quantity + '개</span>' +
          '</span>' +
          '<span class="mini-side">' +
            escapeHtml(it.owner) + ' · ' + formatDateTime(it.updatedAt) +
          '</span>' +
        '</li>';
    }).join('') + '</ul>';
  }

  /* =======================================================
     읽어와서 네 위젯을 모두 그린다
     ======================================================= */

  /** 위젯 네 칸에 같은 문구를 채운다 (불러오는 중 / 실패) */
  function fillAll(html) {
    totalEl.innerHTML = html;
    lowEl.innerHTML = html;
    donutEl.innerHTML = html;
    recentEl.innerHTML = html;
  }

  function drawAll(items) {
    // 왼쪽 메뉴의 배지에 개수를 알려 준다 (sidebar.js)
    window.dispatchEvent(new CustomEvent('items-loaded', { detail: { count: items.length } }));

    renderTotal(items);
    renderLowStock(items);
    renderDonut(items);
    renderRecent(items);
  }

  function refresh() {
    if (setupBroken) {
      fillAll('<p class="empty">Supabase 설정을 마치면 현황이 보여요.</p>');
      return Promise.resolve();
    }

    errorEl.innerHTML = '';
    fillAll('<p class="empty">불러오는 중…</p>');

    return fetchItems()
      .then(drawAll)
      .catch(function (err) {
        errorEl.innerHTML =
          '<div class="banner banner-error" role="alert">' + escapeHtml(err.message) + '</div>';
        fillAll('<p class="empty state-error">불러오지 못했어요.</p>');
      });
  }

  /* ---------- 목록 화면에서 돌아왔을 때 다시 읽기 ---------- */
  window.addEventListener('pageshow', refresh);

  refresh();
})();
