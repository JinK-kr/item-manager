/* =========================================================
   parse-items — 사람 말을 물품 목록으로 바꿔 주는 함수

   왜 이게 서버에 있나:
     오픈라우터 키는 비밀이다. 브라우저 코드에 넣으면 F12 로 다 보인다.
     그래서 이 함수만 키를 알고, 브라우저는 이 함수에게만 말을 건다.
     키는 Supabase secrets 의 OPENROUTER_API_KEY 에서 꺼낸다.
     코드에도 깃허브에도 값은 없다.

   하는 일:
     받는다  { text: "볼펜 20개 들어왔어", defaultOwner: "민서" }
     준다    { items: [{ name, category, quantity, owner }], model: "..." }

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

/** 주력이 막히면 예비로 한 번 더 시도한다 (발표 중 429 대비) */
const MODELS = [
  'google/gemma-4-26b-a4b-it:free',
  'openai/gpt-oss-20b:free',
];

const MAX_TEXT = 500;   // 너무 긴 입력은 자른다
const MAX_ITEMS = 20;   // 한 번에 만들 수 있는 줄 수

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name:     { type: 'string',  description: '물품 이름. 1~30자.' },
          category: { type: 'string',  enum: CATEGORIES },
          quantity: { type: 'integer', description: '0 이상의 정수' },
          owner:    { type: 'string',  description: '등록자 닉네임. 1~10자.' },
        },
        required: ['name', 'category', 'quantity', 'owner'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

function systemPrompt(defaultOwner: string) {
  return [
    '너는 창고 물품 등록을 돕는다. 사람이 한 말에서 등록할 물품을 뽑아 낸다.',
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
    '- 물품 이름은 사람이 말한 그대로 쓴다. 멋대로 바꾸거나 늘리지 않는다.',
    '- 물품이 하나도 없으면 빈 배열을 준다.',
    '- 지우기·빼기·줄이기 요청은 무시하고 빈 배열을 준다. 이 함수는 등록만 한다.',
  ].join('\n');
}

async function callModel(model: string, apiKey: string, text: string, owner: string) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Gildong Inventory',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt(owner) },
        { role: 'user', content: text },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'items', strict: true, schema: SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${model} 응답 실패 (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${model} 이 빈 답을 줬어요.`);

  // 모델이 ```json 으로 감싸는 경우가 있어 걷어낸다
  const cleaned = String(content).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

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
function tidy(items: unknown[], defaultOwner: string) {
  return items.slice(0, MAX_ITEMS).map((raw) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const name = String(it.name ?? '').trim().slice(0, 30);
    const category = CATEGORIES.includes(String(it.category))
      ? String(it.category)
      : '기타';                                  // 모르는 값이 오면 기타로 눕힌다
    let quantity = Math.floor(Number(it.quantity));
    if (!isFinite(quantity) || quantity < 0) quantity = 1;
    const owner = (String(it.owner ?? '').trim() || defaultOwner).slice(0, 10);
    return { name, category, quantity, owner };
  }).filter((it) => it.name.length > 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    return json({ error: 'OPENROUTER_API_KEY 를 찾지 못했어요. Supabase 시크릿을 확인해 주세요.' }, 500);
  }

  let text = '';
  let defaultOwner = '';
  try {
    const body = await req.json();
    text = String(body?.text ?? '').trim().slice(0, MAX_TEXT);
    defaultOwner = String(body?.defaultOwner ?? '').trim().slice(0, 10) || '미상';
  } catch {
    return json({ error: '요청을 읽지 못했어요.' }, 400);
  }

  if (!text) return json({ error: '무엇을 등록할지 적어 주세요.' }, 400);

  const problems: string[] = [];
  for (const model of MODELS) {
    try {
      const items = await callModel(model, apiKey, text, defaultOwner);
      return json({ items: tidy(items, defaultOwner), model });
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
      // 다음 모델로 넘어간다
    }
  }

  return json({
    error: '지금은 말을 알아듣지 못했어요. 잠시 뒤 다시 시도하거나 아래 폼으로 등록해 주세요.',
    detail: problems.join(' | ').slice(0, 400),
  }, 502);
});
