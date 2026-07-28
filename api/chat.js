/**
 * 럴러바이 - Gemini API 프록시 (Vercel Serverless Function)
 *
 * 파일 위치가 곧 URL 경로: api/chat.js → https://내사이트/api/chat
 * 별도 설정 파일(wrangler.jsonc 같은 것) 필요 없음 — Vercel이 api/ 폴더를 자동 인식함.
 *
 * ---- 배포 방법 ----
 * 1. 이 파일을 저장소(jjab-zeta) 안에 정확히 이 경로로 추가: api/chat.js
 *    (GitHub "Create new file"에서 파일명 칸에 "api/chat.js" 그대로 입력)
 * 2. index.html은 그대로 두면 됨 (WORKER_URL이 이미 '/api/chat'으로 맞춰져 있음, 수정 불필요)
 * 3. vercel.com 대시보드 → 이미 만들어둔 프로젝트/도메인에 연결
 *    → "Import Git Repository" → jjab-zeta 선택 (Framework Preset: Other로 두면 됨)
 *    → Deploy
 * 4. 배포 후 → 프로젝트 → Settings → Environment Variables
 *    → GEMINI_API_KEY 추가, 값에 실제 Gemini 키 입력 → Save
 * 5. Deployments 탭에서 재배포 한 번 (환경변수 반영)
 */

const MODEL = 'gemini-3.5-flash-lite';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-visitor-id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원해요' });
    return;
  }

  const { systemInstruction, contents } = req.body || {};
  if (!contents || !Array.isArray(contents)) {
    res.status(400).json({ error: 'contents가 필요해요' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: '서버에 GEMINI_API_KEY 환경변수가 설정되지 않았어요' });
    return;
  }

  try {
    // systemInstruction이 문자열로 와도 Gemini API 규격(객체)에 맞게 자동 변환
    let formattedSystemInstruction;
    if (systemInstruction) {
      formattedSystemInstruction = (typeof systemInstruction === 'string')
        ? { parts: [{ text: systemInstruction }] }
        : systemInstruction;
    }

    const payload = { contents, generationConfig: { temperature: 1.0, maxOutputTokens: 500 } };
    if (formattedSystemInstruction) payload.systemInstruction = formattedSystemInstruction;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      res.status(geminiRes.status).json({ error: 'Gemini 호출 실패', detail: errText });
      return;
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: '서버 오류: ' + e.message });
  }
};
