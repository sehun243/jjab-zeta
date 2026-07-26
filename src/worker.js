/**
 * 럴러바이 - Cloudflare Worker (정적 파일 서빙 + /api/chat Gemini 프록시)
 *
 * wrangler.jsonc의 "assets" 설정으로 index.html 등 정적 파일은 자동으로 서빙되고,
 * /api/chat 경로로 오는 요청만 이 스크립트가 직접 처리해서 Gemini API를 대신 호출함.
 *
 * ---- 필요한 설정 ----
 * Cloudflare 대시보드 → 이 프로젝트 → Settings → Variables and secrets
 * → GEMINI_API_KEY 추가, 값에 실제 Gemini API 키 입력 → 저장 (재배포 필요할 수 있음)
 */

const MODEL = 'gemini-3.5-flash-lite';

function corsHeaders(){
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-visitor-id',
    'Content-Type': 'application/json',
  };
}

async function handleChat(request, env){
  if(request.method === 'OPTIONS'){
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if(request.method !== 'POST'){
    return new Response(JSON.stringify({ error: 'POST만 지원해요' }), { status: 405, headers: corsHeaders() });
  }

  let body;
  try{ body = await request.json(); }
  catch{ return new Response(JSON.stringify({ error: '요청 형식이 올바르지 않아요' }), { status: 400, headers: corsHeaders() }); }

  const { systemInstruction, contents } = body;
  if(!contents || !Array.isArray(contents)){
    return new Response(JSON.stringify({ error: 'contents가 필요해요' }), { status: 400, headers: corsHeaders() });
  }

  const apiKey = env.GEMINI_API_KEY;
  if(!apiKey){
    return new Response(JSON.stringify({ error: '서버에 GEMINI_API_KEY가 설정되지 않았어요' }), { status: 500, headers: corsHeaders() });
  }

  try{
    // systemInstruction이 문자열로 와도 Gemini API 규격(객체)에 맞게 자동 변환
    let formattedSystemInstruction;
    if(systemInstruction){
      formattedSystemInstruction = (typeof systemInstruction === 'string')
        ? { parts: [{ text: systemInstruction }] }
        : systemInstruction;
    }

    const payload = { contents, generationConfig: { temperature: 1.0, maxOutputTokens: 500 } };
    if(formattedSystemInstruction) payload.systemInstruction = formattedSystemInstruction;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
      }
    );

    if(!geminiRes.ok){
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({ error: 'Gemini 호출 실패', detail: errText }), { status: geminiRes.status, headers: corsHeaders() });
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    return new Response(JSON.stringify({ text }), { status: 200, headers: corsHeaders() });
  }catch(e){
    return new Response(JSON.stringify({ error: '서버 오류: ' + e.message }), { status: 500, headers: corsHeaders() });
  }
}

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    if(url.pathname === '/api/chat'){
      return handleChat(request, env);
    }
    // 그 외 모든 요청은 정적 파일(index.html 등)로 그대로 서빙
    return env.ASSETS.fetch(request);
  }
};
