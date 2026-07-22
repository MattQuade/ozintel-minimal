import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    console.log('[send-sms] Incoming request');

    let body;
    try {
      body = await request.json();
    } catch (err) {
      console.error('[send-sms] Failed to parse JSON body:', err);
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { phone, message } = body || {};
    console.log('[send-sms] Parsed body:', { phone, message });

    if (!phone || !message) {
      console.error('[send-sms] Missing phone or message');
      return NextResponse.json(
        { error: 'Phone and message are required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.MESSAGEMEDIA_API_KEY;
    const apiSecret = process.env.MESSAGEMEDIA_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error('[send-sms] Missing MessageMedia credentials in env');
      return NextResponse.json(
        { error: 'Server configuration error: Missing SMS credentials' },
        { status: 500 }
      );
    }

    const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

    const payload = {
      messages: [
        {
          content: message,
          destination_number: phone,
          format: 'SMS'
        }
      ]
    };

    console.log('[send-sms] Outbound payload:', payload);

    const mmResponse = await fetch('https://api.messagemedia.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${credentials}`
      },
      body: JSON.stringify(payload)
    });

    const status = mmResponse.status;
    const rawText = await mmResponse.text();

    console.log('[send-sms] MessageMedia status:', status);
    console.log('[send-sms] MessageMedia raw body:', rawText);

    let responseData;
    try {
      responseData = rawText ? JSON.parse(rawText) : {};
    } catch {
      responseData = { raw: rawText };
    }

    if (mmResponse.ok) {
      console.log('[send-sms] MessageMedia accepted:', responseData);
      return NextResponse.json({ success: true, data: responseData });
    } else {
      console.error('[send-sms] MessageMedia rejected:', status, responseData);
      return NextResponse.json(
        { error: 'MessageMedia gateway rejection', status, details: responseData },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('[send-sms] Critical server error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
