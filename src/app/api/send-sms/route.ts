import { NextResponse } from 'next/server';

declare global {
  var alertHistoryStore: Record<string, { lat: number; lon: number; timestamp: string }> | undefined;
}

const alertHistory = global.alertHistoryStore || (global.alertHistoryStore = {});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone, message, location, userName, alertType } = body;

    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required.' },
        { status: 400 }
      );
    }

    // ========== SPECIAL CASE: SIGNUP REQUEST ==========
    if (alertType === "SIGNUP_REQUEST") {
      // Just send the message the frontend already prepared
      const payload = {
        messages: [
          {
            content: message || "New user signup request",
            destination_number: phone,
            format: 'SMS',
          },
        ],
      };

      const response = await fetch('https://api.messagemedia.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic dGtieXJBQnJ6NldaT3N5bmdJdG86dmphSWRnUGpjOVZzbmRYRUxRSE9DTWlURUhQWTY3',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        return NextResponse.json({ success: false, error: data.message || 'Failed' }, { status: response.status });
      }
      return NextResponse.json({ success: true, data });
    }

    // ========== NORMAL ALERTS (SAFE ARRIVAL / EMERGENCY) ==========
    const now = new Date();
    const currentTimeStr = now.toLocaleTimeString('en-AU', {
      timeZone: 'Australia/Sydney',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    const currentDateStr = now.toLocaleDateString('en-AU', {
      timeZone: 'Australia/Sydney',
    });

    const currentDateTimeFull = now.toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
      timeStyle: 'medium',
    });

    const typeLabel = alertType || (message?.toLowerCase().includes('emergency') ? 'EMERGENCY' : 'SAFE ARRIVAL');
    const tickIcon = typeLabel === 'EMERGENCY' ? '🚨' : '✅';
    const senderName = userName || 'User';

    const historyKey = `${phone}_${typeLabel}_${currentDateStr}`;
    let timeDiffDisplay = '0h 0m (First alert today)';
    let distanceDisplay = 'N/A (First alert today)';

    if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
      const lastRecord = alertHistory[historyKey];

      if (lastRecord) {
        const distKm = calculateDistance(
          lastRecord.lat,
          lastRecord.lon,
          location.latitude,
          location.longitude
        );
        distanceDisplay = `${distKm.toFixed(2)} km`;

        const [lastH, lastM] = lastRecord.timestamp.split(':').map(Number);
        const [currH, currM] = currentTimeStr.split(':').map(Number);
        const diffMinutesTotal = (currH * 60 + currM) - (lastH * 60 + lastM);

        if (diffMinutesTotal > 0) {
          const diffHours = Math.floor(diffMinutesTotal / 60);
          const diffMins = diffMinutesTotal % 60;
          timeDiffDisplay = `${diffHours}h ${diffMins}m`;
        } else {
          timeDiffDisplay = `0h 0m`;
        }
      }

      alertHistory[historyKey] = {
        lat: location.latitude,
        lon: location.longitude,
        timestamp: currentTimeStr,
      };
    }

    // Build the message
    let finalMessage = `${tickIcon} ${typeLabel} - ${senderName}\n`;
    finalMessage += `Time: ${currentDateTimeFull}\n`;
    finalMessage += `Time since last ${typeLabel}: ${timeDiffDisplay}\n`;

    if (location && location.latitude && location.longitude) {
      const mapsLink = `https://maps.google.com/?q=${location.latitude},${location.longitude}&z=18`;
      finalMessage += `Location: ${mapsLink}\n`;
      finalMessage += `Distance from previous alert: ${distanceDisplay}`;
    } else if (message && message.includes('maps.google.com')) {
      // Fallback: if frontend already put the link in the message
      finalMessage += message;
    }

    const payload = {
      messages: [
        {
          content: finalMessage,
          destination_number: phone,
          format: 'SMS',
        },
      ],
    };

    const response = await fetch('https://api.messagemedia.com/v1/messages', {
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

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
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
