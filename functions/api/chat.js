/**
 * 럴러바이 - Gemini API 프록시 (Cloudflare Pages Functions)
 *
 * 파일 위치가 곧 URL 경로가 됨: functions/api/chat.js → https://내사이트/api/chat
 *
 * ---- 배포 방법 ----
 * 1. 이 파일을 저장소(jjab-zeta) 안에 정확히 이 경로로 추가:
 *      functions/api/chat.js
 *    (GitHub에서 "Create new file" 눌러서 파일명 칸에
 *     "functions/api/chat.js" 그대로 입력하면 폴더가 자동으로 잡혀요)
 *
 * 2. https://dash.cloudflare.com → Compute (Workers & Pages) → Create → Pages 탭
 *    → "Connect to Git" → jjab-zeta 저장소 선택
 *    → Build command, output directory는 비워두거나 기본값 그대로 → Save and Deploy
 *
 * 3. 배포 후: Pages 프로젝트 → Settings → Environment variables
 *    → GEMINI_API_KEY 추가, 값에 실제 Gemini API 키 입력 → 저장
 *    → Deployments 탭에서 재배포 한 번 (환경변수 반영)
 *
 * 4. index.html의 WORKER_URL은 이미 '/api/chat'으로 맞춰놨으니 수정 불필요
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

export async function onRequestOptions(){
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestPost(context){
  const { request, env } = context;

  let body;
  try{
    body = await request.json();
  }catch{
    return new Response(JSON.stringify({ error: '요청 형식이 올바르지 않아요' }), { status: 400, headers: corsHeaders() });
  }

  const { systemInstruction, contents } = body;
  if(!contents || !Array.isArray(contents)){
    return new Response(JSON.stringify({ error: 'contents가 필요해요' }), { status: 400, headers: corsHeaders() });
  }

  const apiKey = env.GEMINI_API_KEY;
  if(!apiKey){
    return new Response(JSON.stringify({ error: '서버에 GEMINI_API_KEY 환경변수가 설정되지 않았어요' }), { status: 500, headers: corsHeaders() });
  }

  try{
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction,
          contents,
          generationConfig: { temperature: 1.0, maxOutputTokens: 500 },
        }),
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
