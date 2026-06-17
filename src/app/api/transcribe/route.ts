import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as Blob | null;
    const userId = formData.get('userId') as string | null;

    if (!audioFile || !userId) {
      return NextResponse.json({ error: 'Missing audio or userId' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // Convert blob to proper file for OpenAI
    const audioBuffer = await audioFile.arrayBuffer();
    const file = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });

    // Call OpenAI Whisper API
    const whisperForm = new FormData();
    whisperForm.append('file', file);
    whisperForm.append('model', 'whisper-1');
    whisperForm.append('response_format', 'verbose_json');
    whisperForm.append('language', 'th');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: whisperForm,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Whisper API error:', errorText);
      return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
    }

    const data = await response.json();

    // Log quota usage (handled client-side for simplicity)
    // In production: deduct quota via service role

    return NextResponse.json({
      segments: data.segments || [],
      text: data.text || '',
    });
  } catch (error: any) {
    console.error('Transcribe error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
