/* =========================================================
   import.js — 엑셀 업로드 화면 (import.html, F-04)

   흐름:  양식 받기 → 채우기 → 파일 올리기 → 미리보기 → 확인 → 등록
   읽자마자 등록하지 않는다. 실수로 두 번 올리는 걸 막기 위해서다.

   엑셀 라이브러리(SheetJS, 약 900KB)는 이 화면에서도 바로 받지 않는다.
   양식을 내려받거나 파일을 고를 때 그때 받는다.
   ========================================================= */
(function () {
  'use strict';

  var XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  var xlsxLoading = null;

  /** 엑셀 라이브러리를 필요할 때 불러온다 */
  function ensureXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLoading) return xlsxLoading;

    xlsxLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = XLSX_URL;
      s.onload = function () {
        if (window.XLSX) resolve(window.XLSX);
        else reject(new Error('엑셀 라이브러리를 불러오지 못했어요.'));
      };
      s.onerror = function () {
        xlsxLoading = null;   // 다음에 다시 시도할 수 있게
        reject(new Error('엑셀 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));
      };
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }

  var fileEl = document.getElementById('xls-file');
  if (!fileEl) return;   // 이 화면이 아니면 아무것도 하지 않는다

  var dropEl     = document.getElementById('xls-drop');
  var uploaderEl = document.getElementById('xls-uploader');
  var templateEl = document.getElementById('xls-template');
  var stepEl     = document.getElementById('step-template');
  var previewEl  = document.getElementById('xls-preview');
  var msgEl      = document.getElementById('xls-msg');

  renderSetupWarning(document.getElementById('setup-warning'));

  /** 한 번에 올릴 수 있는 최대 줄 수 */
  var MAX_ROWS = 500;

  /** 검사를 통과해 등록을 기다리는 줄들 */
  var pending = null;

  /* ---------- 헤더 이름 맞추기 ---------- */

  var HEADERS = {
    name:     ['물품이름', '물품명', '이름', '품명', 'name', 'item'],
    category: ['카테고리', '분류', 'category'],
    quantity: ['수량', '개수', 'quantity', 'qty'],
    owner:    ['등록자', '등록자닉네임', '닉네임', 'owner', 'nickname'],
    received: ['입고일', '입고날짜', '입고', 'date', 'receivedat'],
    target:   ['적정재고량', '적정재고', '적정', 'target', 'targetquantity']
  };

  /** 공백을 없애고 소문자로 바꿔서 비교한다 ('물품 이름' 과 '물품이름' 을 같게 본다) */
  function normalize(text) {
    return String(text == null ? '' : text).replace(/\s+/g, '').toLowerCase();
  }

  /**
   * 엑셀의 날짜 칸을 YYYY-MM-DD 로 바꾼다.
   * 엑셀에서 날짜 서식으로 넣으면 '1900-01-01 부터 며칠' 이라는 숫자로 들어온다.
   * 글자로 적었으면 그대로 쓴다.
   */
  function excelDate(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number' && window.XLSX && XLSX.SSF) {
      var d = XLSX.SSF.parse_date_code(value);
      if (d) {
        var pad = function (n) { return n < 10 ? '0' + n : String(n); };
        return d.y + '-' + pad(d.m) + '-' + pad(d.d);
      }
    }
    return String(value).trim().slice(0, 10);
  }

  /** 헤더 한 칸이 어떤 항목인지 찾는다. 모르는 헤더는 null. */
  function fieldOf(header) {
    var h = normalize(header);
    for (var key in HEADERS) {
      if (HEADERS[key].indexOf(h) !== -1) return key;
    }
    return null;
  }

  /* ---------- 안내 문구 ---------- */

  function showMsg(text, kind) {
    msgEl.innerHTML = text || '';
    msgEl.className = 'xls-msg ' + (kind || '');
  }

  function clearPreview() {
    previewEl.innerHTML = '';
    pending = null;
  }

  /* ---------- 1단계. 양식 내려받기 ---------- */

  function downloadTemplate() {
    showMsg('양식을 만드는 중…', '');
    ensureXLSX()
      .then(function (XLSX) {
        var aoa = [
          ['물품이름', '카테고리', '수량', '등록자', '입고일', '적정재고량'],
          ['볼펜',       '문구류',   24, '민서', todayISO(), 20],
          ['건전지 AA',  '전자기기',  3, '도윤', todayISO(), 10],
          ['물티슈',     '청소용품',  8, '하은', todayISO(), 10],
          ['구급상자',   '기타',      1, '예린', todayISO(),  1]
        ];
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 12 },
                       { wch: 12 }, { wch: 12 }];
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '물품목록');
        XLSX.writeFile(wb, '물품등록_양식.xlsx');
        showMsg('양식을 내려받았어요. 채운 다음 아래에 올려 주세요.', 'ok');
      })
      .catch(function (err) { showMsg(err.message, 'error'); });
  }

  templateEl.addEventListener('click', downloadTemplate);

  /** 1단계 칸을 잠깐 밝혀서 눈에 띄게 한다 */
  function highlightTemplateStep() {
    stepEl.classList.remove('is-flash');
    void stepEl.offsetWidth;          // 애니메이션을 다시 트는 방법
    stepEl.classList.add('is-flash');
  }

  // 왼쪽 메뉴의 '양식 내려받기' — 이미 이 화면에 있으면 옮겨 가지 않고 바로 받는다
  var navTemplate = document.getElementById('nav-template');
  if (navTemplate) {
    navTemplate.addEventListener('click', function (ev) {
      ev.preventDefault();
      highlightTemplateStep();
      downloadTemplate();
    });
  }

  // 다른 화면에서 '양식 내려받기' 로 넘어온 경우 (주소 끝이 #template)
  if (location.hash === '#template') {
    highlightTemplateStep();
    downloadTemplate();
  }

  /* ---------- 3단계. 파일 읽기 ---------- */

  fileEl.addEventListener('change', function () {
    var file = fileEl.files && fileEl.files[0];
    if (file) readFile(file);
  });

  /* 끌어다 놓기 */
  ['dragenter', 'dragover'].forEach(function (type) {
    dropEl.addEventListener(type, function (ev) {
      ev.preventDefault();
      dropEl.classList.add('is-over');
    });
  });
  ['dragleave', 'dragend', 'drop'].forEach(function (type) {
    dropEl.addEventListener(type, function () { dropEl.classList.remove('is-over'); });
  });
  dropEl.addEventListener('drop', function (ev) {
    ev.preventDefault();
    var file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (file) readFile(file);
  });

  // 칸 밖에 떨어뜨렸을 때 브라우저가 파일을 열어 버리는 걸 막는다
  window.addEventListener('dragover', function (ev) { ev.preventDefault(); });
  window.addEventListener('drop', function (ev) { ev.preventDefault(); });

  function readFile(file) {
    clearPreview();
    showMsg('파일을 읽는 중…', '');

    ensureXLSX()
      .then(function (XLSX) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onerror = function () { reject(new Error('파일을 읽지 못했어요.')); };
          reader.onload = function (ev) {
            try {
              var wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
              if (!wb.SheetNames.length) throw new Error('시트가 없습니다.');
              var sheet = wb.Sheets[wb.SheetNames[0]];   // 첫 번째 시트만 읽는다
              resolve(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false }));
            } catch (e) {
              reject(new Error('엑셀 파일로 읽지 못했어요. .xlsx 또는 .csv 인지 확인해 주세요.'));
            }
          };
          reader.readAsArrayBuffer(file);
        });
      })
      .then(function (matrix) { handleMatrix(matrix, file.name); })
      .catch(function (err) { showMsg(err.message, 'error'); });
  }

  /* ---------- 줄마다 검사하기 ---------- */

  function handleMatrix(matrix, fileName) {
    if (!matrix || matrix.length < 2) {
      showMsg('내용이 없어요. 첫 줄에 헤더, 둘째 줄부터 물품을 적어 주세요.', 'error');
      return;
    }

    // 첫 줄에서 어느 칸이 무엇인지 알아낸다
    var headerRow = matrix[0];
    var colOf = {};
    for (var c = 0; c < headerRow.length; c++) {
      var field = fieldOf(headerRow[c]);
      if (field && colOf[field] === undefined) colOf[field] = c;
    }

    var missing = [];
    if (colOf.name === undefined)     missing.push('물품이름');
    if (colOf.category === undefined) missing.push('카테고리');
    if (colOf.quantity === undefined) missing.push('수량');
    if (missing.length) {
      showMsg('첫 줄에서 ' + escapeHtml(missing.join(', ')) + ' 칸을 찾지 못했어요. ' +
              '양식을 내려받아 헤더를 맞춰 주세요.', 'error');
      return;
    }

    var fallbackOwner = uploaderEl.value.trim();
    var bodyRows = matrix.slice(1);

    if (bodyRows.length > MAX_ROWS) {
      showMsg('한 번에 ' + MAX_ROWS + '줄까지만 올릴 수 있어요. ' +
              '지금 파일은 ' + bodyRows.length + '줄이에요.', 'error');
      return;
    }

    var ok = [];
    var skipped = [];

    bodyRows.forEach(function (row, i) {
      var lineNo = i + 2;   // 엑셀에서 보이는 줄 번호 (헤더가 1줄)

      var raw = {
        name:     row[colOf.name],
        category: row[colOf.category],
        quantity: row[colOf.quantity],
        owner:    colOf.owner !== undefined ? row[colOf.owner] : '',
        received: colOf.received !== undefined ? row[colOf.received] : '',
        target:   colOf.target !== undefined ? row[colOf.target] : ''
      };

      // 완전히 빈 줄은 조용히 넘어간다
      if (normalize(raw.name) === '' && normalize(raw.category) === '' &&
          normalize(raw.quantity) === '') return;

      // 등록자 칸이 비었으면 위에 적은 닉네임으로 채운다
      var owner = String(raw.owner == null ? '' : raw.owner).trim();
      if (owner === '') owner = fallbackOwner;

      var checked = validateInput({
        name: raw.name,
        category: String(raw.category == null ? '' : raw.category).trim(),
        quantity: String(raw.quantity).trim() === '' ? NaN : raw.quantity,
        owner: owner,
        receivedAt: excelDate(raw.received),
        targetQuantity: raw.target
      });

      if (!checked.ok) {
        skipped.push({ line: lineNo, name: String(raw.name || '(이름 없음)'), reason: checked.message });
      } else {
        ok.push(checked.value);
      }
    });

    if (ok.length === 0) {
      showMsg(escapeHtml(fileName) + ' 에서 등록할 수 있는 줄이 없어요.', 'error');
      previewEl.innerHTML = skippedHtml(skipped);
      return;
    }

    showMsg(escapeHtml(fileName) + ' 을(를) 읽었어요. 아래 내용을 확인하고 등록해 주세요.', '');
    buildPreview(ok, skipped);
  }

  /* ---------- 미리보기 ---------- */

  /** 지금 목록과 견줘서 '신규' 인지 '합산' 인지 미리 표시한다 */
  function buildPreview(rows, skipped) {
    previewEl.innerHTML = '<p class="xls-loading">지금 목록과 견주는 중…</p>';

    fetchItems()
      .then(function (current) {
        var byName = {};
        current.forEach(function (it) { byName[normalize(it.name)] = it; });

        var marked = rows.map(function (r) {
          var hit = byName[normalize(r.name)];
          return {
            row: r,
            action: hit ? '합산' : '신규',
            before: hit ? hit.quantity : null,
            after: hit ? hit.quantity + r.quantity : r.quantity
          };
        });

        pending = rows;
        renderPreview(marked, skipped);
      })
      .catch(function (err) {
        previewEl.innerHTML = '';
        showMsg(escapeHtml(err.message), 'error');
      });
  }

  function renderPreview(marked, skipped) {
    var newCount = marked.filter(function (m) { return m.action === '신규'; }).length;
    var mergeCount = marked.length - newCount;

    var summary = '<p class="xls-summary">' +
      '<strong>' + marked.length + '건</strong>을 등록합니다 — ' +
      '새로 추가 ' + newCount + '건, 수량 합산 ' + mergeCount + '건' +
      (skipped.length ? ', <span class="xls-skip-count">건너뜀 ' + skipped.length + '건</span>' : '') +
      '</p>';

    var table =
      '<div class="xls-table-wrap"><table class="xls-table">' +
        '<thead><tr>' +
          '<th>상태</th><th>물품 이름</th><th>카테고리</th>' +
          '<th class="num">수량</th><th>등록자</th><th>입고일</th><th class="num">적정</th>' +
        '</tr></thead><tbody>' +
        marked.map(function (m) {
          var qty = m.action === '합산'
            ? m.before + ' + ' + m.row.quantity + ' = <strong>' + m.after + '</strong>'
            : String(m.row.quantity);
          return '<tr>' +
              '<td><span class="tag tag-' + (m.action === '신규' ? 'new' : 'merge') + '">' +
                m.action + '</span></td>' +
              '<td>' + escapeHtml(m.row.name) + '</td>' +
              '<td>' + escapeHtml(m.row.category) + '</td>' +
              '<td class="num">' + qty + '</td>' +
              '<td>' + escapeHtml(m.row.owner) + '</td>' +
              '<td>' + escapeHtml(m.row.received_at) + '</td>' +
              '<td class="num">' + m.row.target_quantity + '</td>' +
            '</tr>';
        }).join('') +
      '</tbody></table></div>';

    var actions =
      '<div class="xls-actions">' +
        '<button type="button" class="btn btn-primary" id="xls-confirm">' +
          marked.length + '건 등록하기</button>' +
        '<button type="button" class="btn" id="xls-cancel">취소</button>' +
      '</div>';

    previewEl.innerHTML = summary + table + skippedHtml(skipped) + actions;

    document.getElementById('xls-confirm').addEventListener('click', runImport);
    document.getElementById('xls-cancel').addEventListener('click', function () {
      fileEl.value = '';
      clearPreview();
      showMsg('취소했어요.', '');
    });
  }

  function skippedHtml(skipped) {
    if (!skipped.length) return '';
    return '<details class="xls-skipped"><summary>건너뛴 ' + skipped.length + '건 보기</summary><ul>' +
      skipped.map(function (s) {
        return '<li><strong>' + s.line + '행</strong> ' +
               escapeHtml(s.name) + ' — ' + escapeHtml(s.reason) + '</li>';
      }).join('') +
      '</ul></details>';
  }

  /* ---------- 실제로 등록하기 ---------- */

  function runImport() {
    if (!pending || !pending.length) return;

    var confirmBtn = document.getElementById('xls-confirm');
    var cancelBtn = document.getElementById('xls-cancel');
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmBtn.textContent = '등록하는 중…';

    importItems(pending)
      .then(function (results) {
        var made = results.filter(function (r) { return r.action === '신규'; }).length;
        var merged = results.length - made;

        fileEl.value = '';
        clearPreview();
        // 이 화면에는 목록이 없으므로 보러 갈 링크를 같이 준다
        showMsg('등록했어요 — 새로 추가 ' + made + '건, 수량 합산 ' + merged + '건. ' +
                '<a href="index.html">물품 목록에서 확인하기 →</a>', 'ok');
      })
      .catch(function (err) {
        showMsg(escapeHtml(err.message) + ' (아무것도 등록되지 않았어요)', 'error');
        confirmBtn.disabled = false;
        cancelBtn.disabled = false;
        confirmBtn.textContent = pending.length + '건 등록하기';
      });
  }
})();
