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
      return NextResponse.json({ error: 'MessageMedia credentials not configured on server' }, { status: 500 });
    }

    // Basic Auth header for MessageMedia
    const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

    // MessageMedia REST API payload structure
    const payload = {
      messages: [
        {
          content: message,
          destination_number: phone,
          format: 'SMS'
        }
      ]
    };

    const response = await httpsRequest('https://api.messagemedia.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`
      },
      body: JSON.stringify(payload)
    });

    if (response.status >= 200 && response.status < 300) {
      return NextResponse.json({ success: true });
    } else {
      console.error('MessageMedia API Error:', response.data);
      return NextResponse.json({ error: 'Failed to send via MessageMedia', details: response.data }, { status: 500 });
    }

  } catch (error) {
    console.error('Server error handling SMS dispatch:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper for native fetch to MessageMedia endpoint
async function httpsRequest(url, options) {
  const res = await fetch(url, options);
  let data;
  try {
    data = await res.json();
  } catch {
    data = await res.text();
  }
  return { status: res.status, data };
}
