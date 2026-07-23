/* =========================================================
   app.js — 두 화면이 함께 쓰는 데이터 계층
   저장소: 브라우저 localStorage
   물품 하나 = { id, name, category, quantity, owner, updatedAt }
   ========================================================= */

/** localStorage 키 */
var STORAGE_KEY = 'classInventory.items.v1';
/** 테스트로 넣은 물품의 id 목록 (테스트 물품만 골라 지우기 위해 따로 보관) */
var SEED_KEY = 'classInventory.seedIds.v1';

/** 재고 부족 기준: 이 값 이하면 '부족'으로 본다 (PRD 6.2) */
var LOW_STOCK = 3;

/** 물품 이름 / 닉네임 길이 제한 (PRD 4) */
var NAME_MAX = 30;
var OWNER_MAX = 10;

/**
 * 카테고리 고정 목록 (PRD 4).
 * slot 은 도넛 차트와 목록 점 색깔을 정하는 번호다.
 * 색은 '카테고리'에 붙어 있고 순위에 따라 바뀌지 않는다.
 */
var CATEGORIES = [
  { name: '문구류',   slot: 1 },
  { name: '전자기기', slot: 2 },
  { name: '청소용품', slot: 3 },
  { name: '기타',     slot: 4 }
];

/* ---------------------------------------------------------
   저장소 읽고 쓰기
   --------------------------------------------------------- */

/** localStorage 를 쓸 수 있는 상태인지 확인한다 (사생활 보호 모드 등에서 막힐 수 있다) */
function storageAvailable() {
  try {
    var probe = '__probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch (e) {
    return false;
  }
}

/** 물품 하나가 쓸 만한 모양인지 검사한다 (저장된 값이 깨졌을 때 걸러내려고) */
function isValidItem(item) {
  return item
    && typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.owner === 'string'
    && typeof item.category === 'string'
    && typeof item.updatedAt === 'string'
    && typeof item.quantity === 'number'
    && isFinite(item.quantity)
    && item.quantity >= 0;
}

/** 저장된 물품 전체를 배열로 읽는다. 값이 없거나 깨졌으면 빈 배열을 준다. */
function loadItems() {
  if (!storageAvailable()) return [];
  try {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidItem);
  } catch (e) {
    return [];
  }
}

/** 물품 전체를 저장한다. 성공하면 true. */
function saveItems(items) {
  if (!storageAvailable()) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch (e) {
    return false;
  }
}

/** 테스트로 넣은 물품 id 목록을 읽는다 */
function loadSeedIds() {
  if (!storageAvailable()) return [];
  try {
    var raw = window.localStorage.getItem(SEED_KEY);
    var parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/** 테스트로 넣은 물품 id 목록을 저장한다 */
function saveSeedIds(ids) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(SEED_KEY, JSON.stringify(ids));
  } catch (e) { /* 저장 못 해도 앱은 계속 돈다 */ }
}

/* ---------------------------------------------------------
   작은 도구들
   --------------------------------------------------------- */

/** 겹치지 않는 id 를 만든다 */
function createId() {
  return 'it-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/** 지금 시각을 저장용 문자열로 */
function nowISO() {
  return new Date().toISOString();
}

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
   기능 세 가지 (PRD 5)
   --------------------------------------------------------- */

/**
 * F-01 물품 등록.
 * 검사에 걸리면 { ok:false, field, message } 를 준다.
 * 같은 이름이 이미 있어도 그대로 등록한다 (PRD 5 F-01).
 */
function addItem(input) {
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
  if (categorySlotExists(category) === false) {
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

  var item = {
    id: createId(),
    name: name,
    category: category,
    quantity: quantity,
    owner: owner,
    updatedAt: nowISO()
  };

  var items = loadItems();
  items.push(item);
  if (!saveItems(items)) {
    return { ok: false, field: null, message: '저장에 실패했어요. 브라우저 저장 공간을 확인해 주세요.' };
  }
  return { ok: true, item: item };
}

/** 고정 목록에 있는 카테고리인지 확인 */
function categorySlotExists(name) {
  for (var i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].name === name) return true;
  }
  return false;
}

/**
 * F-02 수량 늘리기 / 줄이기.
 * delta 는 +1 또는 -1. 0 아래로는 내려가지 않는다 (PRD 5 F-02).
 * 바뀐 물품을 돌려준다. 바뀐 게 없으면 null.
 */
function changeQuantity(id, delta) {
  var items = loadItems();
  var changed = null;

  for (var i = 0; i < items.length; i++) {
    if (items[i].id !== id) continue;

    var next = items[i].quantity + delta;
    if (next < 0) return null;        // 0 미만은 막는다
    if (next === items[i].quantity) return null;

    items[i].quantity = next;
    items[i].updatedAt = nowISO();    // 수량이 바뀌면 수정 시간도 갱신
    changed = items[i];
    break;
  }

  if (changed) saveItems(items);
  return changed;
}

/**
 * F-03 물품 삭제. 되돌릴 수 없다 (PRD 5 F-03).
 * 지운 물품을 돌려준다. 없으면 null.
 */
function deleteItem(id) {
  var items = loadItems();
  var removed = null;
  var rest = [];

  for (var i = 0; i < items.length; i++) {
    if (items[i].id === id && !removed) removed = items[i];
    else rest.push(items[i]);
  }

  if (!removed) return null;
  saveItems(rest);

  // 테스트 물품이었다면 표시도 같이 지운다
  var seedIds = loadSeedIds();
  var idx = seedIds.indexOf(id);
  if (idx !== -1) {
    seedIds.splice(idx, 1);
    saveSeedIds(seedIds);
  }
  return removed;
}

/* ---------------------------------------------------------
   대시보드 계산 (PRD 6.2)
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
   저장소를 못 쓸 때 알리는 배너
   --------------------------------------------------------- */
function renderStorageWarning(container) {
  if (!container || storageAvailable()) return;
  container.innerHTML =
    '<div class="banner banner-warn" role="alert">' +
    '이 브라우저에서 저장 기능(localStorage)을 쓸 수 없어요. ' +
    '입력한 내용이 새로고침하면 사라집니다. 사생활 보호 모드를 끄고 다시 열어 보세요.' +
    '</div>';
}
