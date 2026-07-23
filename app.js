/* =========================================================
   app.js — 두 화면이 함께 쓰는 데이터 계층
   저장소: Supabase (PostgreSQL)

   items 표 한 줄 = { id, name, category, quantity, owner, updated_at }
   앱 안에서는 updatedAt 으로 이름만 바꿔 쓴다.

   표를 만드는 SQL 은 supabase/schema.sql 에 있다.
   ========================================================= */

/** 표 이름 */
var TABLE = 'items';

/** 재고 부족 기준: 이 값 이하면 '부족'으로 본다 (PRD 6.2) */
var LOW_STOCK = 3;

/** 물품 이름 / 닉네임 길이 제한 (PRD 4) — DB 쪽 check 제약과 같은 값 */
var NAME_MAX = 30;
var OWNER_MAX = 10;

/**
 * 카테고리 고정 목록 (PRD 4).
 * slot 은 도넛 차트와 목록 점 색깔을 정하는 번호다.
 * 색은 '카테고리'에 붙어 있고 순위에 따라 바뀌지 않는다.
 * 이 목록은 DB 의 category check 제약과 반드시 같아야 한다.
 */
var CATEGORIES = [
  { name: '문구류',   slot: 1 },
  { name: '전자기기', slot: 2 },
  { name: '청소용품', slot: 3 },
  { name: '기타',     slot: 4 }
];

/* ---------------------------------------------------------
   Supabase 연결
   --------------------------------------------------------- */

var _client = null;

/** 아직 설정을 안 채웠는지 검사 (기본 문구가 그대로 남아 있는지) */
function configLooksEmpty(cfg) {
  if (!cfg || !cfg.url || !cfg.publicKey) return true;
  return cfg.url.indexOf('여기에') !== -1 || cfg.publicKey.indexOf('여기에') !== -1;
}

/**
 * Supabase 클라이언트를 준비한다.
 * 준비가 안 됐으면 null 을 주고, 이유는 clientProblem() 으로 알 수 있다.
 */
function getClient() {
  if (_client) return _client;
  if (!window.supabase || !window.supabase.createClient) return null;
  if (configLooksEmpty(window.SUPABASE_CONFIG)) return null;

  _client = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.publicKey
  );
  return _client;
}

/** 연결이 안 될 때 사람이 읽을 수 있는 이유. 문제가 없으면 null. */
function clientProblem() {
  if (!window.supabase || !window.supabase.createClient) {
    return 'Supabase 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.';
  }
  if (configLooksEmpty(window.SUPABASE_CONFIG)) {
    return 'supabase-config.js 에 프로젝트 URL 과 publishable 키를 아직 넣지 않았어요.';
  }
  return null;
}

/** 서버가 준 오류를 사람이 읽을 수 있는 문장으로 바꾼다 */
function describeError(error) {
  if (!error) return '알 수 없는 오류가 났어요.';
  var code = error.code || '';
  var msg = String(error.message || '');

  if (code === '42P01' || code === 'PGRST205' || msg.indexOf('does not exist') !== -1) {
    return 'items 표를 찾을 수 없어요. supabase/schema.sql 을 SQL Editor 에서 먼저 실행해 주세요.';
  }
  if (code === '42501' || msg.indexOf('row-level security') !== -1) {
    return '접근이 거부됐어요. items 표의 RLS 정책을 확인해 주세요.';
  }
  if (code === 'PGRST301' || code === '401' || msg.indexOf('JWT') !== -1 || msg.indexOf('API key') !== -1) {
    return 'publishable 키가 맞지 않아요. supabase-config.js 를 확인해 주세요.';
  }
  if (code === '23514' || msg.indexOf('violates check constraint') !== -1) {
    return '값이 규칙에 맞지 않아요. 이름·카테고리·수량을 다시 확인해 주세요.';
  }
  if (msg.indexOf('Failed to fetch') !== -1 || msg.indexOf('NetworkError') !== -1) {
    return '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';
  }
  return msg || '알 수 없는 오류가 났어요.';
}

/** DB 한 줄을 앱에서 쓰는 모양으로 바꾼다 */
function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    owner: row.owner,
    updatedAt: row.updated_at
  };
}

/* ---------------------------------------------------------
   작은 도구들
   --------------------------------------------------------- */

/** 저장된 시각을 '2026-07-23 18:40' 모양으로 바꾼다 (PRD 4) */
function formatDateTime(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
         ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** 사용자가 적은 글자를 화면에 넣기 전에 안전하게 바꾼다 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 카테고리 이름으로 색 번호(slot)를 찾는다. 모르는 카테고리는 4번(기타). */
function categorySlot(name) {
  for (var i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].name === name) return CATEGORIES[i].slot;
  }
  return 4;
}

/** 고정 목록에 있는 카테고리인지 확인 */
function isKnownCategory(name) {
  for (var i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].name === name) return true;
  }
  return false;
}

/** 수정 시간 최신순으로 정렬한 새 배열을 준다 (PRD 6.1) */
function sortByUpdatedDesc(items) {
  return items.slice().sort(function (a, b) {
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

/** 이름에 붙는 한국어 조사를 고른다. 예) 볼펜을 / 가위를 */
function objectParticle(word) {
  var last = String(word).trim().slice(-1);
  var code = last.charCodeAt(0);
  // 한글이 아니면 '을(를)' 로 안전하게 처리
  if (isNaN(code) || code < 0xAC00 || code > 0xD7A3) return '을(를)';
  return (code - 0xAC00) % 28 === 0 ? '를' : '을';
}

/* ---------------------------------------------------------
   읽기
   --------------------------------------------------------- */

/**
 * 물품 전체를 수정 시간 최신순으로 읽는다.
 * 실패하면 예외를 던진다.
 */
function fetchItems() {
  var problem = clientProblem();
  if (problem) return Promise.reject(new Error(problem));

  return getClient()
    .from(TABLE)
    .select('*')
    .order('updated_at', { ascending: false })
    .then(function (res) {
      if (res.error) throw new Error(describeError(res.error));
      return (res.data || []).map(fromRow);
    });
}

/* ---------------------------------------------------------
   기능 세 가지 (PRD 5)
   --------------------------------------------------------- */

/** 등록 전에 입력값을 검사한다. DB 의 check 제약과 같은 규칙. */
function validateInput(input) {
  var name = String(input.name == null ? '' : input.name).trim();
  var owner = String(input.owner == null ? '' : input.owner).trim();
  var category = String(input.category == null ? '' : input.category);
  var quantity = Number(input.quantity);

  if (name.length === 0) {
    return { ok: false, field: 'name', message: '물품 이름을 입력해 주세요.' };
  }
  if (name.length > NAME_MAX) {
    return { ok: false, field: 'name', message: '물품 이름은 ' + NAME_MAX + '자까지 쓸 수 있어요.' };
  }
  if (!isKnownCategory(category)) {
    return { ok: false, field: 'category', message: '카테고리를 골라 주세요.' };
  }
  if (!isFinite(quantity) || Math.floor(quantity) !== quantity || quantity < 0) {
    return { ok: false, field: 'quantity', message: '수량은 0 이상의 정수로 입력해 주세요.' };
  }
  if (owner.length === 0) {
    return { ok: false, field: 'owner', message: '닉네임을 입력해 주세요.' };
  }
  if (owner.length > OWNER_MAX) {
    return { ok: false, field: 'owner', message: '닉네임은 ' + OWNER_MAX + '자까지 쓸 수 있어요.' };
  }

  return {
    ok: true,
    value: { name: name, category: category, quantity: quantity, owner: owner }
  };
}

/**
 * F-01 물품 등록.
 * 검사에 걸리면 { ok:false, field, message } 를 준다.
 * 같은 이름이 이미 있어도 그대로 등록한다 (PRD 5 F-01).
 */
function addItem(input) {
  var checked = validateInput(input);
  if (!checked.ok) return Promise.resolve(checked);

  var problem = clientProblem();
  if (problem) return Promise.resolve({ ok: false, field: null, message: problem });

  return getClient()
    .from(TABLE)
    .insert(checked.value)
    .select()
    .single()
    .then(function (res) {
      if (res.error) return { ok: false, field: null, message: describeError(res.error) };
      return { ok: true, item: fromRow(res.data) };
    });
}

/**
 * F-02 수량 늘리기 / 줄이기. delta 는 +1 또는 -1.
 *
 * DB 함수 change_quantity 를 부른다.
 * 여기서 읽고-더하고-쓰기를 하면 두 사람이 동시에 누를 때 한 번이 사라진다.
 * 0 미만으로 내려가지 않게 막는 것도 DB 안에서 한다 (PRD 5 F-02).
 */
function changeQuantity(id, delta) {
  var problem = clientProblem();
  if (problem) return Promise.reject(new Error(problem));

  return getClient()
    .rpc('change_quantity', { item_id: id, delta: delta })
    .then(function (res) {
      if (res.error) throw new Error(describeError(res.error));
      var row = Array.isArray(res.data) ? res.data[0] : res.data;
      return row ? fromRow(row) : null;
    });
}

/**
 * F-05 말로 등록 — 사람이 쓴 문장을 물품 후보로 바꾼다.
 *
 * 오픈라우터 키는 브라우저에 두면 안 되므로, Supabase Edge Function
 * (parse-items) 이 대신 부른다. 여기서는 그 함수에게만 말을 건다.
 *
 * 이 함수는 '후보' 만 받아 온다. 저장은 사용자가 확인한 뒤에 한다.
 */
function parseItemsFromText(text, defaultOwner) {
  var problem = clientProblem();
  if (problem) return Promise.reject(new Error(problem));

  return getClient()
    .functions.invoke('parse-items', {
      body: { text: text, defaultOwner: defaultOwner }
    })
    .then(function (res) {
      if (res.error) {
        // 함수가 400/500 을 주면 본문에 사람이 읽을 이유가 들어 있다
        var ctx = res.error.context;
        if (ctx && typeof ctx.json === 'function') {
          return ctx.json().then(
            function (body) { throw new Error((body && body.error) || res.error.message); },
            function ()     { throw new Error(res.error.message || '함수를 부르지 못했어요.'); }
          );
        }
        throw new Error(res.error.message || '함수를 부르지 못했어요.');
      }
      if (res.data && res.data.error) throw new Error(res.data.error);
      return (res.data && res.data.items) || [];
    });
}

/**
 * F-04 엑셀 일괄 등록.
 *
 * rows 는 이미 검사를 마친 배열이어야 한다.
 *   [{ name, category, quantity, owner }, ...]
 *
 * 같은 이름이 이미 있으면 수량을 더하고, 없으면 새로 넣는다.
 * DB 함수 안에서 한 번의 트랜잭션으로 처리하므로,
 * 중간에 실패하면 앞의 것까지 전부 취소된다 (반쯤 등록되는 일이 없다).
 *
 * 합산될 때 기존 카테고리와 등록자는 그대로 두고 수량만 바꾼다.
 * +/− 버튼과 같은 방식이다.
 */
function importItems(rows) {
  var problem = clientProblem();
  if (problem) return Promise.reject(new Error(problem));

  return getClient()
    .rpc('import_items', { rows: rows })
    .then(function (res) {
      if (res.error) throw new Error(describeError(res.error));
      return (res.data || []).map(function (r) {
        return { action: r.result_action, name: r.result_name, quantity: r.result_quantity };
      });
    });
}

/**
 * F-03 물품 삭제. 되돌릴 수 없다 (PRD 5 F-03).
 */
function deleteItem(id) {
  var problem = clientProblem();
  if (problem) return Promise.reject(new Error(problem));

  return getClient()
    .from(TABLE)
    .delete()
    .eq('id', id)
    .then(function (res) {
      if (res.error) throw new Error(describeError(res.error));
      return true;
    });
}

/* ---------------------------------------------------------
   대시보드 계산 (PRD 6.2)
   읽어 온 배열만 가지고 계산한다 — 서버를 다시 부르지 않는다
   --------------------------------------------------------- */

/** 위젯 1. 총 품목 수 = 물품 '종류' 개수. 수량 합계가 아니다. */
function countItems(items) {
  return items.length;
}

/** 위젯 2. 재고 부족 목록 = 수량 3 이하, 적은 것부터 */
function lowStockItems(items) {
  return items
    .filter(function (it) { return it.quantity <= LOW_STOCK; })
    .sort(function (a, b) {
      if (a.quantity !== b.quantity) return a.quantity - b.quantity;
      return a.name.localeCompare(b.name, 'ko');
    });
}

/** 위젯 3. 카테고리별 품목 수. 0개인 카테고리는 빼고 준다. */
function categoryBreakdown(items) {
  return CATEGORIES.map(function (cat) {
    var count = items.filter(function (it) { return it.category === cat.name; }).length;
    return { name: cat.name, slot: cat.slot, count: count };
  }).filter(function (row) {
    return row.count > 0;
  });
}

/** 위젯 4. 최근 변경 내역 = 수정 시간 최신순 5건 */
function recentChanges(items, limit) {
  return sortByUpdatedDesc(items).slice(0, limit || 5);
}

/**
 * 비율을 정수 퍼센트로 바꾸되 합이 정확히 100 이 되게 맞춘다.
 * (그냥 반올림하면 99% 나 101% 가 나올 수 있다)
 */
function toPercents(counts) {
  var total = counts.reduce(function (s, n) { return s + n; }, 0);
  if (total === 0) return counts.map(function () { return 0; });

  var exact = counts.map(function (n) { return n / total * 100; });
  var floors = exact.map(function (v) { return Math.floor(v); });
  var remain = 100 - floors.reduce(function (s, n) { return s + n; }, 0);

  // 소수점이 큰 순서대로 남은 1%씩 나눠 준다
  var order = exact
    .map(function (v, i) { return { i: i, frac: v - Math.floor(v) }; })
    .sort(function (a, b) { return b.frac - a.frac; });

  for (var k = 0; k < remain; k++) floors[order[k % order.length].i] += 1;
  return floors;
}

/* ---------------------------------------------------------
   설정이 안 됐을 때 알리는 배너
   --------------------------------------------------------- */
function renderSetupWarning(container) {
  if (!container) return false;
  var problem = clientProblem();
  if (!problem) { container.innerHTML = ''; return false; }

  container.innerHTML =
    '<div class="banner banner-warn" role="alert">' +
      '<strong>Supabase 설정이 아직 안 끝났어요.</strong><br>' +
      escapeHtml(problem) +
    '</div>';
  return true;
}
