/* =========================================================
   index.js — 물품 등록과 목록 화면
   데이터는 Supabase 에서 읽고 쓴다. 그래서 모두 비동기다.
   ========================================================= */
(function () {
  'use strict';

  var listEl   = document.getElementById('item-list');
  var countEl  = document.getElementById('item-count');
  var formEl   = document.getElementById('add-form');
  var msgEl    = document.getElementById('form-msg');
  var nameEl   = document.getElementById('f-name');
  var catEl    = document.getElementById('f-category');
  var qtyEl    = document.getElementById('f-qty');
  var ownerEl  = document.getElementById('f-owner');
  var submitEl = formEl.querySelector('button[type="submit"]');

  var FIELDS = { name: nameEl, category: catEl, quantity: qtyEl, owner: ownerEl };
  var msgTimer = null;

  var setupBroken = renderSetupWarning(document.getElementById('setup-warning'));

  /* ---------- 카테고리 드롭다운 채우기 (PRD 4 고정 목록) ---------- */
  CATEGORIES.forEach(function (cat) {
    var opt = document.createElement('option');
    opt.value = cat.name;
    opt.textContent = cat.name;
    catEl.appendChild(opt);
  });

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

  function clearInvalid() {
    Object.keys(FIELDS).forEach(function (key) {
      FIELDS[key].removeAttribute('aria-invalid');
    });
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

  function drawList(items) {
    countEl.textContent = '(' + items.length + '개)';

    if (items.length === 0) {
      listEl.innerHTML = '<li class="empty">아직 등록된 물품이 없어요. 위에서 첫 물품을 등록해 보세요.</li>';
      return;
    }
    listEl.innerHTML = items.map(itemHtml).join('');
  }

  /** 서버에서 다시 읽어 목록을 그린다 */
  function refresh() {
    if (setupBroken) {
      countEl.textContent = '';
      listEl.innerHTML = '<li class="empty">Supabase 설정을 마치면 목록이 보여요.</li>';
      return Promise.resolve();
    }

    listEl.setAttribute('aria-busy', 'true');
    return fetchItems()
      .then(function (items) {
        drawList(items);              // 서버가 이미 최신순으로 정렬해 준다
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
   * 정렬은 새로 읽을 때(등록·삭제·새로고침) 다시 맞춰진다.
   */
  function updateRow(li, item) {
    li.querySelector('.qty-num').textContent = item.quantity;
    li.querySelector('[data-act="dec"]').disabled = (item.quantity === 0);
    li.querySelector('.item-meta').textContent =
      item.owner + ' · ' + formatDateTime(item.updatedAt);

    var main = li.querySelector('.item-main');
    var oldBadge = main.querySelector('.badge');
    if (oldBadge) main.removeChild(oldBadge);

    var html = badgeHtml(item.quantity);
    if (html) main.insertAdjacentHTML('beforeend', html);
  }

  /** 한 줄의 버튼을 잠그거나 푼다 (서버 응답을 기다리는 동안) */
  function lockRow(li, locked) {
    var btns = li.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      if (locked) {
        btns[i].dataset.wasDisabled = btns[i].disabled ? '1' : '';
        btns[i].disabled = true;
      } else {
        btns[i].disabled = (btns[i].dataset.wasDisabled === '1');
      }
    }
    li.classList.toggle('is-busy', !!locked);
  }

  /* ---------- F-01 등록 ---------- */
  formEl.addEventListener('submit', function (ev) {
    ev.preventDefault();
    clearInvalid();

    var rawQty = qtyEl.value.trim();
    submitEl.disabled = true;
    showMsg('등록하는 중…', '');

    addItem({
      name: nameEl.value,
      category: catEl.value,
      quantity: rawQty === '' ? NaN : rawQty,   // 빈 칸을 0 으로 보지 않는다
      owner: ownerEl.value
    })
      .then(function (result) {
        if (!result.ok) {
          showMsg(result.message, 'error');
          var field = FIELDS[result.field];
          if (field) {
            field.setAttribute('aria-invalid', 'true');
            field.focus();
          }
          return;
        }

        // 폼을 비우되 닉네임은 남긴다 — 같은 사람이 연달아 여러 개를 등록하는 일이 많다 (PRD 5 F-01)
        nameEl.value = '';
        qtyEl.value = '1';
        catEl.selectedIndex = 0;

        showMsg(result.item.name + objectParticle(result.item.name) + ' 등록했어요.', 'ok');
        nameEl.focus();
        return refresh();
      })
      .catch(function (err) {
        showMsg(err.message, 'error');
      })
      .then(function () {
        submitEl.disabled = false;
      });
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

  /* ---------- 대시보드에서 돌아왔을 때 다시 읽기 ---------- */
  window.addEventListener('pageshow', refresh);

  refresh();
})();
