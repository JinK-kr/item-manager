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

  /* =======================================================
     F-05 말로 등록

     흐름:  문장 → Edge Function → 후보 → 미리보기 → 확인 → 저장
     읽자마자 저장하지 않는다. 카테고리는 모델이 '추측한' 값이라
     미리보기에서 고칠 수 있게 한다.
     ======================================================= */

  var chatOwner   = document.getElementById('chat-owner');
  var chatText    = document.getElementById('chat-text');
  var chatGo      = document.getElementById('chat-go');
  var chatMsg     = document.getElementById('chat-msg');
  var chatPreview = document.getElementById('chat-preview');

  /** 미리보기에서 확인을 기다리는 줄들 */
  var chatPending = null;

  // 닉네임 칸은 둘이지만 값은 하나로 맞춰 둔다 (어느 쪽에 적든 통한다)
  chatOwner.addEventListener('input', function () { ownerEl.value = chatOwner.value; });
  ownerEl.addEventListener('input', function () { chatOwner.value = ownerEl.value; });

  function showChatMsg(html, kind) {
    chatMsg.innerHTML = html || '';
    chatMsg.className = 'xls-msg ' + (kind || '');
  }

  function clearChatPreview() {
    chatPreview.innerHTML = '';
    chatPending = null;
  }

  function setChatBusy(busy, label) {
    chatGo.disabled = busy;
    chatText.disabled = busy;
    chatGo.textContent = label || '읽어보기';
  }

  /** 문장을 읽어 후보를 만든다 */
  function readSentence() {
    var text = chatText.value.trim();
    clearChatPreview();

    if (!text) {
      showChatMsg('무엇을 등록할지 적어 주세요.', 'error');
      chatText.focus();
      return;
    }

    var owner = chatOwner.value.trim();
    if (!owner) {
      showChatMsg('등록자 닉네임을 먼저 적어 주세요.', 'error');
      chatOwner.focus();
      return;
    }

    setChatBusy(true, '읽는 중…');
    showChatMsg('문장을 읽고 있어요…', '');

    parseItemsFromText(text, owner)
      .then(function (candidates) {
        if (!candidates.length) {
          showChatMsg('등록할 물품을 찾지 못했어요. ' +
                      '<strong>볼펜 20개</strong> 처럼 이름과 개수를 적어 주세요.', 'error');
          return;
        }

        // 앱의 검증 규칙을 그대로 통과시킨다 (엑셀 업로드와 같은 잣대)
        var ok = [], skipped = [];
        candidates.forEach(function (c) {
          var checked = validateInput(c);
          if (checked.ok) ok.push(checked.value);
          else skipped.push({ name: c.name || '(이름 없음)', reason: checked.message });
        });

        if (!ok.length) {
          showChatMsg('찾은 물품이 규칙에 맞지 않아요. 다시 적어 주세요.', 'error');
          return;
        }
        return buildChatPreview(ok, skipped);
      })
      .catch(function (err) {
        showChatMsg(escapeHtml(err.message), 'error');
      })
      .then(function () {
        setChatBusy(false);
      });
  }

  chatGo.addEventListener('click', readSentence);

  // 엔터로 보내고, 줄바꿈은 Shift+Enter
  chatText.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      readSentence();
    }
  });

  /** 지금 목록과 견줘 '신규' 인지 '합산' 인지 표시한다 */
  function buildChatPreview(rows, skipped) {
    chatPreview.innerHTML = '<p class="xls-loading">지금 목록과 견주는 중…</p>';

    return fetchItems()
      .then(function (current) {
        var byName = {};
        current.forEach(function (it) {
          byName[it.name.replace(/\s+/g, '').toLowerCase()] = it;
        });

        chatPending = rows.map(function (r) {
          var hit = byName[r.name.replace(/\s+/g, '').toLowerCase()];
          return {
            row: r,
            action: hit ? '합산' : '신규',
            before: hit ? hit.quantity : null,
            after: hit ? hit.quantity + r.quantity : r.quantity
          };
        });
        renderChatPreview(skipped);
      })
      .catch(function (err) {
        chatPreview.innerHTML = '';
        showChatMsg(escapeHtml(err.message), 'error');
      });
  }

  function renderChatPreview(skipped) {
    var newCount = chatPending.filter(function (m) { return m.action === '신규'; }).length;
    var mergeCount = chatPending.length - newCount;

    var options = CATEGORIES.map(function (c) { return c.name; });

    var rowsHtml = chatPending.map(function (m, i) {
      var qty = m.action === '합산'
        ? m.before + ' + ' + m.row.quantity + ' = <strong>' + m.after + '</strong>'
        : String(m.row.quantity);

      var select = '<select class="cat-select" data-i="' + i + '" aria-label="카테고리 고치기">' +
        options.map(function (name) {
          return '<option value="' + escapeHtml(name) + '"' +
                 (name === m.row.category ? ' selected' : '') + '>' +
                 escapeHtml(name) + '</option>';
        }).join('') + '</select>';

      return '<tr>' +
          '<td><span class="tag tag-' + (m.action === '신규' ? 'new' : 'merge') + '">' +
            m.action + '</span></td>' +
          '<td>' + escapeHtml(m.row.name) + '</td>' +
          '<td>' + select + '</td>' +
          '<td class="num">' + qty + '</td>' +
          '<td>' + escapeHtml(m.row.owner) + '</td>' +
        '</tr>';
    }).join('');

    var skippedHtml = skipped.length
      ? '<details class="xls-skipped"><summary>건너뛴 ' + skipped.length + '건 보기</summary><ul>' +
        skipped.map(function (s) {
          return '<li>' + escapeHtml(s.name) + ' — ' + escapeHtml(s.reason) + '</li>';
        }).join('') + '</ul></details>'
      : '';

    chatPreview.innerHTML =
      '<p class="xls-summary"><strong>' + chatPending.length + '건</strong>을 등록합니다 — ' +
        '새로 추가 ' + newCount + '건, 수량 합산 ' + mergeCount + '건' +
        (skipped.length ? ', <span class="xls-skip-count">건너뜀 ' + skipped.length + '건</span>' : '') +
      '</p>' +
      '<p class="cat-note">카테고리는 <strong>모델이 추측한 값</strong>이에요. 틀렸으면 바꿔 주세요.</p>' +
      '<div class="xls-table-wrap"><table class="xls-table">' +
        '<thead><tr><th>상태</th><th>물품 이름</th><th>카테고리</th>' +
        '<th class="num">수량</th><th>등록자</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>' +
      skippedHtml +
      '<div class="xls-actions">' +
        '<button type="button" class="btn btn-primary" id="chat-confirm">' +
          chatPending.length + '건 등록하기</button>' +
        '<button type="button" class="btn" id="chat-cancel">취소</button>' +
      '</div>';

    // 카테고리를 고치면 저장할 값도 같이 바뀐다
    chatPreview.addEventListener('change', function (ev) {
      var sel = ev.target.closest ? ev.target.closest('.cat-select') : null;
      if (!sel) return;
      chatPending[Number(sel.getAttribute('data-i'))].row.category = sel.value;
    });

    document.getElementById('chat-confirm').addEventListener('click', runChatImport);
    document.getElementById('chat-cancel').addEventListener('click', function () {
      clearChatPreview();
      showChatMsg('취소했어요.', '');
      chatText.focus();
    });
  }

  function runChatImport() {
    if (!chatPending || !chatPending.length) return;

    var confirmBtn = document.getElementById('chat-confirm');
    var cancelBtn = document.getElementById('chat-cancel');
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmBtn.textContent = '등록하는 중…';

    var rows = chatPending.map(function (m) { return m.row; });

    // 저장은 엑셀 업로드와 같은 길을 쓴다 (같은 이름이면 수량을 더한다)
    importItems(rows)
      .then(function (results) {
        var made = results.filter(function (r) { return r.action === '신규'; }).length;
        var merged = results.length - made;

        chatText.value = '';
        clearChatPreview();
        showChatMsg('등록했어요 — 새로 추가 ' + made + '건, 수량 합산 ' + merged + '건.', 'ok');

        // 아래 '방금 등록한 물품' 에도 쌓아 준다
        results.forEach(function (r) {
          justAdded.unshift({
            name: r.name,
            category: (rows.filter(function (x) { return x.name === r.name; })[0] || {}).category || '기타',
            quantity: r.quantity,
            owner: chatOwner.value.trim(),
            updatedAt: new Date().toISOString()
          });
        });
        paintRecent();
        chatText.focus();
      })
      .catch(function (err) {
        showChatMsg(escapeHtml(err.message) + ' (아무것도 등록되지 않았어요)', 'error');
        confirmBtn.disabled = false;
        cancelBtn.disabled = false;
        confirmBtn.textContent = chatPending.length + '건 등록하기';
      });
  }

  chatOwner.focus();
})();
