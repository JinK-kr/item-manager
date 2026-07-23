/* =========================================================
   parse-items — 사람 말을 물품 목록으로 바꿔 주는 함수

   왜 이게 서버에 있나:
     오픈라우터 키는 비밀이다. 브라우저 코드에 넣으면 F12 로 다 보인다.
     그래서 이 함수만 키를 알고, 브라우저는 이 함수에게만 말을 건다.
     키는 Supabase secrets 의 OPENROUTER_API_KEY 에서 꺼낸다.
     코드에도 깃허브에도 값은 없다.

   ★ 무료 모델만 쓴다 ★
     돈이 붙는 모델은 절대 부르지 않는다. 두 겹으로 막는다.
       1) id 가 ':free' 로 끝나야 한다
       2) 오픈라우터가 알려 주는 실제 가격이 전부 0 이어야 한다
     둘 중 하나라도 어긋나면 부르지 않고 거절한다.

   두 가지 일을 한다:
     { action: 'models' }
       → { models: [...] }  쓸 수 있는 무료 모델 목록

     { text, defaultOwner, model?, today? }
       → { items: [{ name, category, quantity, owner, received_at }], model }

   이 함수는 DB 를 건드리지 않는다. 후보만 만들어 준다.
   실제 저장은 브라우저가 사용자 확인을 받은 뒤 import_items() 로 한다.
   ========================================================= */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** 앱과 똑같은 네 가지. 이 밖의 값은 모델이 못 내놓게 막는다. */
const CATEGORIES = ['문구류', '전자기기', '청소용품', '기타'];

/**
 * 쓸 수 있는 모델은 이 셋뿐이다. 전부 무료(:free)다.
 * 앞에 있을수록 형식을 잘 지켜서, 고르지 않았거나 실패했을 때 이 순서로 시도한다.
 *   1) gemma-4-26b : JSON 스키마를 강제할 수 있다 (가장 안정적)
 *   2) gemma-4-31b : json_object 까지만 된다
 *   3) nemotron    : 형식 강제가 안 된다. 프롬프트로만 부탁한다.
 */
const ALLOWED_MODELS = [
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
];

const MAX_TEXT = 500;
const MAX_ITEMS = 20;

/* ---------------------------------------------------------
   무료 모델 목록 (오픈라우터에서 받아 와 잠깐 기억해 둔다)
   --------------------------------------------------------- */

type FreeModel = {
  id: string; name: string; context: number;
  structured: boolean;   // JSON 스키마를 강제할 수 있나
  jsonMode: boolean;     // json_object 라도 되나
};

let modelCache: { at: number; list: FreeModel[] } | null = null;
const CACHE_MS = 10 * 60 * 1000;   // 10분

/** 가격이 전부 0 인지 본다. 하나라도 0 이 아니면 유료로 친다. */
function isZeroCost(m: Record<string, unknown>): boolean {
  const p = (m.pricing ?? {}) as Record<string, string>;
  // 모르는 항목이 새로 생겨도 유료로 보게 값 전체를 훑는다
  for (const v of Object.values(p)) {
    const n = Number(v);
    if (!isFinite(n) || n > 0) return false;
  }
  return true;
}

async function loadFreeModels(): Promise<FreeModel[]> {
  const now = Date.now();
  if (modelCache && now - modelCache.at < CACHE_MS) return modelCache.list;

  const res = await fetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error(`모델 목록을 받지 못했어요 (${res.status}).`);
  const body = await res.json();

  const list: FreeModel[] = (body?.data ?? [])
    .filter((m: Record<string, unknown>) => {
      const id = String(m.id ?? '');
      // 세 겹으로 거른다: 정해 둔 목록 + :free + 실제 가격 0
      return ALLOWED_MODELS.includes(id) && id.endsWith(':free') && isZeroCost(m);
    })
    .map((m: Record<string, unknown>) => {
      const sp = (m.supported_parameters ?? []) as string[];
      return {
        id: String(m.id),
        name: String(m.name ?? m.id),
        context: Number(m.context_length ?? 0),
        structured: Array.isArray(sp) && sp.includes('structured_outputs'),
        jsonMode: Array.isArray(sp) && sp.includes('response_format'),
      };
    })
    // 정해 둔 순서를 지킨다 (앞이 형식을 더 잘 지키는 모델)
    .sort((a: FreeModel, b: FreeModel) =>
      ALLOWED_MODELS.indexOf(a.id) - ALLOWED_MODELS.indexOf(b.id));

  modelCache = { at: now, list };
  return list;
}

/* ---------------------------------------------------------
   모델에게 시킬 일
   --------------------------------------------------------- */

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name:        { type: 'string',  description: '물품 이름. 1~30자.' },
          category:    { type: 'string',  enum: CATEGORIES },
          quantity:    { type: 'integer', description: '0 이상의 정수' },
          owner:       { type: 'string',  description: '등록자 닉네임. 1~10자.' },
          received_at: { type: 'string',  description: '입고일. YYYY-MM-DD 형식.' },
        },
        required: ['name', 'category', 'quantity', 'owner', 'received_at'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

function systemPrompt(defaultOwner: string, today: string) {
  return [
    '너는 창고 물품 등록을 돕는다. 사람이 한 말에서 등록할 물품을 뽑아 낸다.',
    '',
    '오늘 날짜는 ' + today + ' 이다.',
    '',
    '규칙:',
    '- 한 문장에 여러 물품이 있으면 각각 따로 뽑는다.',
    '- 수량을 말하지 않았으면 1로 한다.',
    '- 카테고리는 반드시 다음 넷 중 하나다: ' + CATEGORIES.join(', '),
    '  · 문구류: 볼펜, 종이, 가위, 테이프처럼 사무·필기에 쓰는 것',
    '  · 전자기기: 건전지, 케이블, 멀티탭처럼 전기가 통하는 것',
    '  · 청소용품: 물티슈, 걸레, 세제, 쓰레기봉투',
    '  · 기타: 위 셋에 확실히 안 들어가는 것',
    '  애매하면 기타로 한다. 지어내지 말고 넷 중에서만 고른다.',
    '- 등록자를 말했으면 그 이름을 쓰고, 말하지 않았으면 "' + defaultOwner + '" 를 쓴다.',
    '- received_at 은 입고일이다. YYYY-MM-DD 로만 적는다.',
    '  · "어제" 면 오늘에서 하루 뺀 날, "그저께" 면 이틀 뺀 날로 계산한다.',
    '  · "3월 2일" 처럼 말하면 올해로 본다.',
    '  · 날짜를 말하지 않았으면 오늘(' + today + ') 로 한다.',
    '  · 미래 날짜는 쓰지 않는다.',
    '- 물품 이름은 사람이 말한 그대로 쓴다. 멋대로 바꾸거나 늘리지 않는다.',
    '- 물품이 하나도 없으면 빈 배열을 준다.',
    '- 지우기·빼기·줄이기 요청은 무시하고 빈 배열을 준다. 이 함수는 등록만 한다.',
    '',
    // 형식을 강제할 수 없는 모델도 있어서, 모양을 말로도 알려 준다
    '아래 모양의 JSON 만 답한다. 설명도 인사도 코드블록도 붙이지 않는다.',
    '{"items":[{"name":"볼펜","category":"문구류","quantity":20,' +
      '"owner":"' + defaultOwner + '","received_at":"' + today + '"}]}',
  ].join('\n');
}

/**
 * 모델이 붙이는 군더더기를 걷어내고 JSON 부분만 꺼낸다.
 * 추론 모델은 <think> 블록을, 어떤 모델은 코드블록이나 인사말을 붙인다.
 */
function extractJson(raw: string): string {
  let s = String(raw);
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a !== -1 && b > a) s = s.slice(a, b + 1);
  return s.trim();
}

async function callModel(
  m: FreeModel, apiKey: string, text: string, owner: string, today: string,
) {
  const model = m.id;

  // 모델이 할 수 있는 만큼만 형식을 강제한다.
  // 스키마 > json_object > (아무것도 못 하면) 프롬프트로만 부탁
  const payload: Record<string, unknown> = {
    model,
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt(owner, today) },
      { role: 'user', content: text },
    ],
  };
  if (m.structured) {
    payload.response_format = {
      type: 'json_schema',
      json_schema: { name: 'items', strict: true, schema: SCHEMA },
    };
  } else if (m.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Gildong Inventory',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${model} 응답 실패 (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${model} 이 빈 답을 줬어요.`);

  const cleaned = extractJson(content);

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`${model} 이 JSON 형식을 지키지 않았어요.`);
  }
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error(`${model} 응답에 items 배열이 없어요.`);
  }
  return parsed.items;
}

/** 모델이 뭘 주든 앱이 쓸 수 있는 모양으로 다듬는다 */
function tidy(items: unknown[], defaultOwner: string, today: string) {
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

  return items.slice(0, MAX_ITEMS).map((raw) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const name = String(it.name ?? '').trim().slice(0, 30);
    const category = CATEGORIES.includes(String(it.category))
      ? String(it.category)
      : '기타';                                  // 모르는 값이 오면 기타로 눕힌다
    let quantity = Math.floor(Number(it.quantity));
    if (!isFinite(quantity) || quantity < 0) quantity = 1;
    const owner = (String(it.owner ?? '').trim() || defaultOwner).slice(0, 10);

    let received = String(it.received_at ?? '').trim();
    if (!isDate(received) || received > today) received = today;   // 이상하거나 미래면 오늘

    return { name, category, quantity, owner, received_at: received };
  }).filter((it) => it.name.length > 0);
}

/* ---------------------------------------------------------
   요청 처리
   --------------------------------------------------------- */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: '요청을 읽지 못했어요.' }, 400);
  }

  /* --- 쓸 수 있는 무료 모델 목록 --- */
  if (body?.action === 'models') {
    try {
      return json({ models: await loadFreeModels() });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  }

  /* --- 말 → 물품 후보 --- */
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    return json({ error: 'OPENROUTER_API_KEY 를 찾지 못했어요. Supabase 시크릿을 확인해 주세요.' }, 500);
  }

  const text = String(body?.text ?? '').trim().slice(0, MAX_TEXT);
  const defaultOwner = String(body?.defaultOwner ?? '').trim().slice(0, 10) || '미상';
  const wanted = String(body?.model ?? '').trim();

  // 브라우저가 알려 준 오늘 날짜를 쓴다 (서버는 UTC 라 한국에서 하루 어긋날 수 있다)
  const rawToday = String(body?.today ?? '').trim();
  const today = /^\d{4}-\d{2}-\d{2}$/.test(rawToday)
    ? rawToday
    : new Date().toISOString().slice(0, 10);

  if (!text) return json({ error: '무엇을 등록할지 적어 주세요.' }, 400);

  // ★ 무료 확인 — 여기를 통과하지 못하면 아무 모델도 부르지 않는다
  let freeList: FreeModel[];
  try {
    freeList = await loadFreeModels();
  } catch (e) {
    return json({ error: '무료 모델 목록을 확인하지 못해 중단했어요. ' +
                         (e instanceof Error ? e.message : '') }, 502);
  }
  const freeIds = new Set(freeList.map((m) => m.id));

  if (wanted && !freeIds.has(wanted)) {
    return json({
      error: `'${wanted}' 는 무료 모델이 아니거나 지금 쓸 수 없어요. 무료 모델만 부릅니다.`,
    }, 400);
  }

  // 고른 모델 → 기본 모델 → 남은 무료 모델 순서로 시도. 전부 무료로 걸러진 것만 남는다.
  // 고른 모델을 맨 앞에, 나머지는 정해진 순서대로 예비로 둔다
  const queue: FreeModel[] = [];
  if (wanted) {
    const hit = freeList.find((m) => m.id === wanted);
    if (hit) queue.push(hit);
  }
  freeList.forEach((m) => { if (!queue.some((q) => q.id === m.id)) queue.push(m); });

  if (!queue.length) {
    return json({ error: '지금 쓸 수 있는 무료 모델이 없어요.' }, 502);
  }

  const problems: string[] = [];
  for (const model of queue) {
    try {
      const items = await callModel(model, apiKey, text, defaultOwner, today);
      return json({ items: tidy(items, defaultOwner, today), model: model.id });
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
  }

  return json({
    error: '지금은 말을 알아듣지 못했어요. 다른 모델을 골라 보거나 아래 폼으로 등록해 주세요.',
    detail: problems.join(' | ').slice(0, 400),
  }, 502);
});
