/* =========================================================
   dashboard.js — 현황 대시보드 (위젯 4개)
   ========================================================= */
(function () {
  'use strict';

  var totalEl  = document.getElementById('w-total');
  var lowEl    = document.getElementById('w-low');
  var donutEl  = document.getElementById('w-donut');
  var recentEl = document.getElementById('w-recent');
  var toolsMsg = document.getElementById('tools-msg');
  var seedBtn  = document.getElementById('btn-seed');
  var unseedBtn = document.getElementById('btn-unseed');

  renderStorageWarning(document.getElementById('storage-warning'));

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
     전체 다시 그리기
     ======================================================= */
  function renderAll() {
    var items = loadItems();
    renderTotal(items);
    renderLowStock(items);
    renderDonut(items);
    renderRecent(items);
    unseedBtn.disabled = (loadSeedIds().length === 0);
  }

  /* =======================================================
     테스트 도구 — 위젯을 미리 확인하려고 만든 것
     ======================================================= */

  /* 카테고리 4개가 모두 나오고, 재고 부족과 재고 0 도 섞이도록 짠 자료다. */
  var SEED_ITEMS = [
    { name: '볼펜',       category: '문구류',   quantity: 24, owner: '민서', minutesAgo: 8 },
    { name: 'A4 용지',    category: '문구류',   quantity: 12, owner: '지훈', minutesAgo: 25 },
    { name: '포스트잇',   category: '문구류',   quantity: 2,  owner: '민서', minutesAgo: 47 },
    { name: '가위',       category: '문구류',   quantity: 5,  owner: '예린', minutesAgo: 70 },
    { name: '건전지 AA',  category: '전자기기', quantity: 3,  owner: '도윤', minutesAgo: 95 },
    { name: '멀티탭',     category: '전자기기', quantity: 4,  owner: '지훈', minutesAgo: 130 },
    { name: 'USB 케이블', category: '전자기기', quantity: 1,  owner: '예린', minutesAgo: 160 },
    { name: '물티슈',     category: '청소용품', quantity: 8,  owner: '하은', minutesAgo: 200 },
    { name: '쓰레기봉투', category: '청소용품', quantity: 0,  owner: '도윤', minutesAgo: 260 },
    { name: '구급상자',   category: '기타',     quantity: 1,  owner: '하은', minutesAgo: 320 }
  ];

  function showToolsMsg(text) {
    toolsMsg.textContent = text;
  }

  seedBtn.addEventListener('click', function () {
    var ask = '테스트용 물품 ' + SEED_ITEMS.length + '개를 넣을까요?\n' +
              '지금 있는 물품은 그대로 두고 ' + SEED_ITEMS.length + '개를 더합니다.';
    if (!window.confirm(ask)) return;

    var items = loadItems();
    var seedIds = loadSeedIds();
    var now = Date.now();

    SEED_ITEMS.forEach(function (seed) {
      var item = {
        id: createId(),
        name: seed.name,
        category: seed.category,
        quantity: seed.quantity,
        owner: seed.owner,
        updatedAt: new Date(now - seed.minutesAgo * 60000).toISOString()
      };
      items.push(item);
      seedIds.push(item.id);
    });

    if (!saveItems(items)) {
      showToolsMsg('저장에 실패했어요. 브라우저 저장 공간을 확인해 주세요.');
      return;
    }
    saveSeedIds(seedIds);
    renderAll();
    showToolsMsg('테스트 물품 ' + SEED_ITEMS.length + '개를 넣었어요.');
  });

  unseedBtn.addEventListener('click', function () {
    var seedIds = loadSeedIds();
    if (seedIds.length === 0) {
      showToolsMsg('지울 테스트 물품이 없어요.');
      return;
    }

    var ask = '테스트로 넣은 물품 ' + seedIds.length + '개를 지울까요?\n' +
              '직접 등록한 물품은 그대로 둡니다.';
    if (!window.confirm(ask)) return;

    var kept = loadItems().filter(function (it) {
      return seedIds.indexOf(it.id) === -1;
    });

    saveItems(kept);
    saveSeedIds([]);
    renderAll();
    showToolsMsg('테스트 물품 ' + seedIds.length + '개를 지웠어요.');
  });

  /* ---------- 다른 탭에서 바꾸거나, 목록 화면에서 돌아왔을 때 ---------- */
  window.addEventListener('storage', function (ev) {
    if (ev.key === STORAGE_KEY || ev.key === SEED_KEY || ev.key === null) renderAll();
  });
  window.addEventListener('pageshow', renderAll);

  renderAll();
})();
