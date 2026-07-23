/* =========================================================
   items.js — 물품 목록 화면 (items.html)
   목록 보여 주기 · 검색 · 정렬 · 수량 조절(F-02) · 삭제(F-03)
   등록은 register.html 이 맡는다.
   ========================================================= */
(function () {
  'use strict';

  var listEl  = document.getElementById('item-list');
  var countEl = document.getElementById('item-count');
  var msgEl   = document.getElementById('list-msg');
  var qEl     = document.getElementById('q');
  var qClear  = document.getElementById('q-clear');
  var sortsEl = document.querySelector('.sorts');

  var setupBroken = renderSetupWarning(document.getElementById('setup-warning'));

  /** 서버에서 읽어 온 전체 목록. 검색·정렬은 이걸 가지고 화면에서만 한다. */
  var allItems = [];
  var msgTimer = null;

  /* ---------- 정렬 기준 ---------- */
  /* cmp 는 늘 '오름차순' 기준으로 비교한다. 내림차순은 부호만 뒤집는다. */
  var SORTS = {
    updated: {
      label: '최신순', dir: 'desc',
      cmp: function (a, b) { return new Date(a.updatedAt) - new Date(b.updatedAt); },
      say: { asc: '오래된 것부터', desc: '최근에 고친 것부터' }
    },
    name: {
      label: '이름순', dir: 'asc',
      cmp: function (a, b) { return a.name.localeCompare(b.name, 'ko'); },
      say: { asc: 'ㄱ 부터', desc: 'ㅎ 부터' }
    },
    qty: {
      label: '수량순', dir: 'asc',
      cmp: function (a, b) { return a.quantity - b.quantity; },
      say: { asc: '적은 것부터', desc: '많은 것부터' }
    }
  };

  var sortKey = 'updated';   // 처음엔 최근에 고친 것부터

  /* ---------- 안내 문구 ---------- */
  function showMsg(text, kind) {
    if (msgTimer) { clearTimeout(msgTimer); msgTimer = null; }
    msgEl.textContent = text;
    msgEl.className = 'form-msg ' + (kind || '');
    if (kind === 'ok') {
      msgTimer = setTimeout(function () {
        msgEl.textContent = '';
        msgEl.className = 'form-msg';
      }, 3000);
    }
  }

  /* ---------- 목록 그리기 ---------- */

  /** 수량에 따라 붙는 배지. 색만으로 알리지 않고 글자를 함께 쓴다. */
  function badgeHtml(quantity) {
    if (quantity === 0) return '<span class="badge badge-out">재고 없음</span>';
    if (quantity <= LOW_STOCK) return '<span class="badge badge-low">부족</span>';
    return '';
  }

  function itemHtml(item) {
    var slot = categorySlot(item.category);
    var safeName = escapeHtml(item.name);

    return '<li class="item" data-id="' + escapeHtml(item.id) + '">' +
        '<div class="item-main">' +
          '<span class="item-name">' + safeName + '</span>' +
          '<span class="cat"><i class="dot dot-' + slot + '"></i>' + escapeHtml(item.category) + '</span>' +
          badgeHtml(item.quantity) +
        '</div>' +
        '<div class="item-meta">' + escapeHtml(item.owner) + ' · ' + formatDateTime(item.updatedAt) + '</div>' +
        '<div class="qty">' +
          '<button type="button" class="qty-btn" data-act="dec" aria-label="' + safeName + ' 수량 줄이기"' +
            (item.quantity === 0 ? ' disabled' : '') + '>&minus;</button>' +
          '<span class="qty-num">' + item.quantity + '</span>' +
          '<button type="button" class="qty-btn" data-act="inc" aria-label="' + safeName + ' 수량 늘리기">+</button>' +
        '</div>' +
        '<button type="button" class="del-btn" data-act="del">삭제</button>' +
      '</li>';
  }

  /** 검색어에 걸리는지 — 이름·카테고리·등록자를 함께 본다 */
  function matches(item, q) {
    if (!q) return true;
    return (item.name + ' ' + item.category + ' ' + item.owner).toLowerCase().indexOf(q) !== -1;
  }

  /** 검색 + 정렬해서 지금 보여 줄 목록을 만든다 */
  function visibleItems() {
    var q = qEl.value.trim().toLowerCase();
    var rule = SORTS[sortKey];
    var sign = rule.dir === 'asc' ? 1 : -1;

    return allItems
      .filter(function (it) { return matches(it, q); })
      .sort(function (a, b) { return sign * rule.cmp(a, b); });
  }

  /** 정렬 버튼 모양 맞추기 */
  function paintSorts() {
    var btns = sortsEl.querySelectorAll('.sort-btn');
    for (var i = 0; i < btns.length; i++) {
      var key = btns[i].getAttribute('data-sort');
      var rule = SORTS[key];
      var on = key === sortKey;

      btns[i].classList.toggle('is-on', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      btns[i].innerHTML = rule.label +
        (on ? ' <span class="sort-dir" aria-hidden="true">' +
              (rule.dir === 'asc' ? '&uarr;' : '&darr;') + '</span>' : '');
      btns[i].title = on
        ? rule.say[rule.dir] + ' — 다시 누르면 반대로'
        : rule.label + '으로 보기';
    }
  }

  /** 검색·정렬을 적용해 화면을 다시 그린다 (서버를 다시 부르지 않는다) */
  function paintList() {
    var rows = visibleItems();
    var q = qEl.value.trim();

    qClear.hidden = (q === '');

    if (allItems.length === 0) {
      countEl.textContent = '';
      listEl.innerHTML = '<li class="empty">아직 등록된 물품이 없어요. ' +
        '<a href="register.html">물품 등록</a> 또는 ' +
        '<a href="import.html">엑셀 업로드</a>로 시작해 보세요.</li>';
      return;
    }

    countEl.textContent = q
      ? '전체 ' + allItems.length + '개 중 ' + rows.length + '개'
      : '전체 ' + allItems.length + '개';

    if (rows.length === 0) {
      // 조사(와/과)를 붙이면 어색해지는 말이 많아 아예 쓰지 않는다
      listEl.innerHTML = '<li class="empty">‘' + escapeHtml(q) + '’ 검색 결과가 없어요.</li>';
      return;
    }
    listEl.innerHTML = rows.map(itemHtml).join('');
  }

  /** 서버에서 다시 읽어 온다 */
  function refresh() {
    if (setupBroken) {
      countEl.textContent = '';
      listEl.innerHTML = '<li class="empty">Supabase 설정을 마치면 목록이 보여요.</li>';
      return Promise.resolve();
    }

    listEl.setAttribute('aria-busy', 'true');
    return fetchItems()
      .then(function (items) {
        allItems = items;
        window.dispatchEvent(new CustomEvent('items-loaded', { detail: { count: items.length } }));
        paintList();
      })
      .catch(function (err) {
        countEl.textContent = '';
        listEl.innerHTML = '<li class="empty state-error">' + escapeHtml(err.message) + '</li>';
      })
      .then(function () {
        listEl.removeAttribute('aria-busy');
      });
  }

  /**
   * 수량만 바뀌었을 때는 그 줄만 고친다.
   * 곧바로 다시 정렬하면 누르던 줄이 화면 위로 튀어 올라가 다음 클릭을 놓친다.
   * 정렬은 새로 읽을 때(삭제·새로고침) 다시 맞춰진다.
   */
  function updateRow(li, item) {
    li.querySelector('.qty-num').textContent = item.quantity;
    syncDecButton(li);
    li.querySelector('.item-meta').textContent =
      item.owner + ' · ' + formatDateTime(item.updatedAt);

    var main = li.querySelector('.item-main');
    var oldBadge = main.querySelector('.badge');
    if (oldBadge) main.removeChild(oldBadge);

    var html = badgeHtml(item.quantity);
    if (html) main.insertAdjacentHTML('beforeend', html);

    // 손에 들고 있는 목록도 같이 고쳐 둔다 (검색·정렬을 다시 할 때 쓰인다)
    for (var i = 0; i < allItems.length; i++) {
      if (allItems[i].id === item.id) { allItems[i] = item; break; }
    }
  }

  /**
   * '−' 버튼은 수량이 0일 때만 잠근다.
   * 잠금 상태를 판단하는 곳을 여기 한 군데로 모아 둔다.
   */
  function syncDecButton(li) {
    var qty = Number(li.querySelector('.qty-num').textContent);
    li.querySelector('[data-act="dec"]').disabled = (qty === 0);
  }

  /**
   * 한 줄의 버튼을 잠그거나 푼다 (서버 응답을 기다리는 동안).
   * 풀 때는 '누르기 전 상태' 로 되돌리면 안 된다.
   * 그 사이에 수량이 바뀌었을 수 있어서, 지금 수량을 보고 다시 판단한다.
   */
  function lockRow(li, locked) {
    var btns = li.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = !!locked;
    if (!locked) syncDecButton(li);
    li.classList.toggle('is-busy', !!locked);
  }

  /* ---------- 검색 ---------- */
  qEl.addEventListener('input', paintList);
  qClear.addEventListener('click', function () {
    qEl.value = '';
    paintList();
    qEl.focus();
  });
  qEl.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && qEl.value !== '') {
      ev.stopPropagation();          // 사이드바가 닫히지 않게
      qEl.value = '';
      paintList();
    }
  });

  /* ---------- 정렬 ---------- */
  sortsEl.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.sort-btn');
    if (!btn) return;

    var key = btn.getAttribute('data-sort');
    // 이미 켜진 버튼을 다시 누르면 방향만 뒤집는다
    if (key === sortKey) {
      SORTS[key].dir = (SORTS[key].dir === 'asc') ? 'desc' : 'asc';
    } else {
      sortKey = key;
    }
    paintSorts();
    paintList();
  });

  /* ---------- F-02 수량 조절 · F-03 삭제 ---------- */
  listEl.addEventListener('click', function (ev) {
    var btn = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!btn) return;

    var li = btn.closest('.item');
    if (!li) return;

    var id  = li.getAttribute('data-id');
    var act = btn.getAttribute('data-act');

    if (act === 'inc' || act === 'dec') {
      lockRow(li, true);
      changeQuantity(id, act === 'inc' ? 1 : -1)
        .then(function (changed) {
          if (changed) updateRow(li, changed);
          else showMsg('그 물품을 찾을 수 없어요. 목록을 다시 읽을게요.', 'error');
        })
        .catch(function (err) {
          showMsg(err.message, 'error');
          return refresh();     // 서버와 어긋났을 수 있으니 다시 읽는다
        })
        .then(function () {
          if (li.isConnected) lockRow(li, false);
        });
      return;
    }

    if (act === 'del') {
      var name = li.querySelector('.item-name').textContent;
      var ask = name + objectParticle(name) + ' 삭제할까요?\n삭제하면 되돌릴 수 없어요.';
      if (!window.confirm(ask)) return;         // 취소하면 아무 일도 없다

      lockRow(li, true);
      deleteItem(id)
        .then(function () {
          showMsg(name + objectParticle(name) + ' 삭제했어요.', 'ok');
          return refresh();
        })
        .catch(function (err) {
          showMsg(err.message, 'error');
          if (li.isConnected) lockRow(li, false);
        });
    }
  });

  /* ---------- 다른 화면에서 돌아왔을 때 다시 읽기 ---------- */
  window.addEventListener('pageshow', refresh);

  paintSorts();
  refresh();
})();
