import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { phone, message } = await request.json();

    if (!phone || !message) {
      return NextResponse.json(
        { success: false, error: 'Phone and message are required.' },
        { status: 400 }
      );
    }

    // MessageMedia REST API Endpoint
    const url = 'https://api.messagemedia.com/v1/messages';

    // Format the payload according to MessageMedia API specs
    const payload = {
      messages: [
        {
          content: message,
          destination_number: phone,
          format: 'SMS',
        },
      ],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic dGtieXJBQnJ6NldaT3N5bmdJdG86dmphSWRnUGpjOVZzbmRYRUxRSE9DTWlURUhQWTY3',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('MessageMedia Gateway Error:', data);
      return NextResponse.json(
        { success: false, error: data.message || 'Failed to send via MessageMedia' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error handling SMS request:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process SMS request' },
      { status: 500 }
    );
  }
}
