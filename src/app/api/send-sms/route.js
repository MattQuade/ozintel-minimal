import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { phone, message } = body;

    if (!phone || !message) {
      return NextResponse.json({ error: 'Phone and message are required' }, { status: 400 });
    }

    const apiKey = process.env.MESSAGEMEDIA_API_KEY;
    const apiSecret = process.env.MESSAGEMEDIA_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error('MessageMedia environment variables are missing on the server.');
      return NextResponse.json({ error: 'Server configuration error: Missing SMS credentials' }, { status: 500 });
    }

    // Generate Basic Authentication header
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

    // Direct outbound request to MessageMedia REST API
    const mmResponse = await fetch('https://api.messagemedia.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${credentials}`
      },
      body: JSON.stringify(payload)
    });

    const responseText = await mmResponse.text();
    let responseData;
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch {
      responseData = { raw: responseText };
    }

    if (mmResponse.ok) {
      return NextResponse.json({ success: true, data: responseData });
    } else {
      console.error('MessageMedia API rejected request:', mmResponse.status, responseData);
      return NextResponse.json({ 
        error: 'MessageMedia gateway rejection', 
        status: mmResponse.status, 
        details: responseData 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Critical server error in /api/send-sms:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
