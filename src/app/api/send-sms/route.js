import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { phone, message } = await request.json();

    if (!phone || !message) {
      return NextResponse.json({ error: 'Phone and message are required' }, { status: 400 });
    }

    const apiKey = process.env.MESSAGEMEDIA_API_KEY;
    const apiSecret = process.env.MESSAGEMEDIA_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error('MessageMedia credentials missing from environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Generate Basic Authorization header
    const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

    // MessageMedia endpoint payload
    const payload = {
      messages: [
        {
          content: message,
          destination_number: phone,
          format: 'SMS'
        }
      ]
    };

    const mmResponse = await fetch('https://api.messagemedia.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`
      },
      body: JSON.stringify(payload)
    });

    const responseData = await mmResponse.json().catch(() => ({}));

    if (mmResponse.ok) {
      return NextResponse.json({ success: true, data: responseData });
    } else {
      console.error('MessageMedia Gateway Error:', responseData);
      return NextResponse.json({ error: 'Failed to send via MessageMedia', details: responseData }, { status: mmResponse.status });
    }

  } catch (error) {
    console.error('Server error dispatching SMS:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
