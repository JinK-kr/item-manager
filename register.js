/* =========================================================
   register.js — 물품 등록 화면 (register.html, F-01)

   이 화면에는 전체 목록이 없다.
   대신 방금 등록한 것들을 아래에 쌓아 보여 줘서
   "제대로 들어갔나?" 를 바로 확인할 수 있게 한다.
   ========================================================= */
(function () {
  'use strict';

  var formEl   = document.getElementById('add-form');
  var msgEl    = document.getElementById('form-msg');
  var nameEl   = document.getElementById('f-name');
  var catEl    = document.getElementById('f-category');
  var qtyEl    = document.getElementById('f-qty');
  var ownerEl  = document.getElementById('f-owner');
  var submitEl = formEl.querySelector('button[type="submit"]');

  var recentCard = document.getElementById('recent-card');
  var recentList = document.getElementById('recent-list');

  var FIELDS = { name: nameEl, category: catEl, quantity: qtyEl, owner: ownerEl };
  var msgTimer = null;

  /** 이 화면에서 방금 등록한 것들 (새로고침하면 사라진다) */
  var justAdded = [];

  renderSetupWarning(document.getElementById('setup-warning'));

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

  /* ---------- 방금 등록한 목록 ---------- */
  function paintRecent() {
    if (justAdded.length === 0) { recentCard.hidden = true; return; }

    recentCard.hidden = false;
    recentList.innerHTML = justAdded.map(function (it) {
      return '<li>' +
          '<span class="mini-name">' +
            '<i class="dot dot-' + categorySlot(it.category) + '"></i> ' +
            escapeHtml(it.name) +
          '</span>' +
          '<span class="mini-qty">' + it.quantity + '개</span>' +
          '<span class="mini-side">' + formatDateTime(it.updatedAt) + '</span>' +
        '</li>';
    }).join('');
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

        justAdded.unshift(result.item);
        paintRecent();

        showMsg(result.item.name + objectParticle(result.item.name) + ' 등록했어요.', 'ok');
        nameEl.focus();
      })
      .catch(function (err) {
        showMsg(err.message, 'error');
      })
      .then(function () {
        submitEl.disabled = false;
      });
  });

  nameEl.focus();
})();
