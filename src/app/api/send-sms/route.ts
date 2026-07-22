import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone, message, location } = body;

    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required.' },
        { status: 400 }
      );
    }

    // Get current time formatted cleanly
    const currentTime = new Date().toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
      timeStyle: 'medium',
    });

    // Build the enhanced message containing time, location, and distance metrics
    let finalMessage = message || 'Safe Arrival Alert Triggered.';
    finalMessage += `\nTime: ${currentTime}`;

    if (location && location.latitude && location.longitude) {
      const mapsLink = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
      finalMessage += `\nHigh-Accuracy Location: ${mapsLink}`;

      // Optional straight-line distance calculation if a destination/home coordinate is provided
      if (location.destLat && location.destLon) {
        const distanceKm = calculateDistance(
          location.latitude,
          location.longitude,
          location.destLat,
          location.destLon
        );
        finalMessage += `\nStraight-line Distance to Destination: ${distanceKm.toFixed(2)} km`;
      }
    }

    // MessageMedia REST API Endpoint
    const url = 'https://api.messagemedia.com/v1/messages';

    const payload = {
      messages: [
        {
          content: finalMessage,
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

// Helper function to calculate straight-line distance using the Haversine formula (in kilometers)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}
