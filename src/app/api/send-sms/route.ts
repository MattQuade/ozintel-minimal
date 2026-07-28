import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

// ---------- helpers ----------
function readUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeUsers(users: any[]) {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatTimeDiff(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0 && minutes === 0) return '0h 0m (just now)';
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      phone,
      message: frontendMessage,
      userName = 'Unknown User',
      userEmail = '',
      alertType = 'ALERT',
      lat = null,
      lng = null
    } = body;

    if (!phone) {
      return NextResponse.json({ success: false, error: 'Phone required' }, { status: 400 });
    }

    // Special case – signup notifications stay untouched
    if (alertType === 'SIGNUP_REQUEST') {
      const auth = Buffer.from('YOUR_MESSAGEMEDIA_API_KEY:YOUR_MESSAGEMEDIA_API_SECRET').toString('base64');
      const res = await fetch('https://api.messagemedia.com/v1/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{
            content: frontendMessage,
            destination_number: phone,
            format: 'SMS'
          }]
        })
      });
      return NextResponse.json({ success: res.ok });
    }

    // ---------- normal alerts ----------
    let users = readUsers();
    let user = null;

    // Prefer email lookup (most reliable)
    if (userEmail) {
      user = users.find((u: any) => u.email?.toLowerCase() === userEmail.toLowerCase());
    }
    // Fallback to name
    if (!user && userName && userName !== 'Unknown User') {
      user = users.find((u: any) => u.name === userName);
    }

    let richExtra = '';
    const now = Date.now();
    const hasCoords = typeof lat === 'number' && typeof lng === 'number';

    if (user && user.lastAlert && hasCoords) {
      const prev = user.lastAlert;
      const timeDiffMs = now - prev.timestamp;
      const timeStr = formatTimeDiff(timeDiffMs);
      const distKm = haversineKm(prev.lat, prev.lng, lat, lng);
      const distStr = distKm < 1
        ? `${Math.round(distKm * 1000)} m`
        : `${distKm.toFixed(2)} km`;

      richExtra = `\n⏱ ${timeStr} since last alert\n📏 ${distStr} from previous location`;
    } else if (user) {
      richExtra = `\n⏱ First alert today`;
    }

    // Maps link
    let mapsLink = '';
    if (hasCoords) {
      mapsLink = `\n📍 https://maps.google.com/?q=${lat},${lng}&z=18`;
    } else {
      mapsLink = `\n📍 Location unavailable`;
    }

    // Final message
    const finalMessage = `${frontendMessage}${richExtra}${mapsLink}`;

    // Update lastAlert on the user
    if (user && hasCoords) {
      user.lastAlert = {
        timestamp: now,
        lat,
        lng
      };
      // also bump smsCount
      user.smsCount = (user.smsCount || 0) + 1;
      writeUsers(users);
    }

    // ---------- send via MessageMedia ----------
    // REPLACE WITH YOUR REAL CREDENTIALS
    const auth = Buffer.from('YOUR_MESSAGEMEDIA_API_KEY:YOUR_MESSAGEMEDIA_API_SECRET').toString('base64');

    const mmRes = await fetch('https://api.messagemedia.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{
          content: finalMessage,
          destination_number: phone,
          format: 'SMS'
        }]
      })
    });

    if (!mmRes.ok) {
      const errText = await mmRes.text();
      console.error('MessageMedia error:', errText);
      return NextResponse.json({ success: false, error: 'SMS provider error' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('send-sms error:', err);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
