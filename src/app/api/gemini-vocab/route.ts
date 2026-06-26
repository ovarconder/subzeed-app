import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { subtitles, brandTerms, translationMode, targetLanguage, targetLanguageName } = await request.json();

    if (!subtitles || !Array.isArray(subtitles)) {
      return NextResponse.json({ error: 'Invalid subtitles' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    // ─── เลือก Prompt ตามโหมด ──────────────────────────
    let prompt: string;

    if (translationMode) {
      // โหมดแปลภาษา
      const langName = targetLanguageName || targetLanguage || 'อังกฤษ';
      const subtitleJson = JSON.stringify(
        subtitles.map((s: any) => ({ id: s.id, text: s.text }))
      );

      prompt = `
คุณคือนักแปลภาษามืออาชีพ
กรุณาแปลข้อความซับไตเติลภาษาไทยด้านล่างเป็นภาษา${langName}:

กฎการแปล:
- แปลให้เป็นภาษาธรรมชาติที่เข้าใจง่าย
- รักษาคำเฉพาะ/ชื่อเฉพาะ/ชื่อแบรนด์ไว้ (เช่น SubZeed, ชื่อคน, ชื่อบริษัท)
- รักษาความหมายเดิมให้ครบถ้วน
- ถ้าเป็นคำอุทานหรือเสียง ให้คงไว้หรือหา equivalent ที่เหมาะสม

ตอบกลับเป็น JSON array เท่านั้น (ห้ามมีข้อความอื่นนอกจาก JSON):
[
  { "id": "sub-xxx", "original": "ข้อความต้นทาง", "translated": "ข้อความที่แปลแล้ว" },
  ...
]

ข้อความซับไตเติล:
${subtitleJson}
`;
    } else {
      // โหมดตรวจคำศัพท์ (เดิม)
      const subtitleTexts = subtitles.map((s: any) => s.text).join('\n');
      const brandHint = brandTerms?.length
        ? `คำสำคัญที่ต้องคงไว้: ${brandTerms.join(', ')}`
        : '';

      prompt = `
คุณคือผู้ช่วยตรวจคำซับไตเติลภาษาไทย
กรุณาตรวจสอบข้อความด้านล่าง:
${brandHint ? `- รักษาคำแบรนด์/ชื่อ: ${brandTerms.join(', ')}` : ''}
- แก้คำที่สะกดผิดหรือน่าจะเป็นคำสแลงให้ถูกต้อง
- ถ้าข้อความสั้นหรือเป็นคำทั่วไป ให้คงไว้
- ตอบกลับเป็น JSON array ที่มีฟิลด์ "original", "corrected", "confidence"

ข้อความซับไตเติล:
${subtitleTexts}
`;
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: translationMode ? 0.3 : 0.2,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Gemini API error:', errText);
      return NextResponse.json({ error: 'AI processing failed' }, { status: 502 });
    }

    const data = await geminiResponse.json();
    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    // Try to extract JSON from response
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    const corrections = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    return NextResponse.json({ corrections });
  } catch (error: any) {
    console.error('Gemini vocab/translation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
