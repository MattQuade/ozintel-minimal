import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

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
  const R = 6371;
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

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
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

    const auth = Buffer.from('tkbyrABrz6WZOsyngIto:vjaIdgPjc9VsndXELQHOCMiTEHPY67').toString('base64');

    // Special case – signup notifications
    if (alertType === 'SIGNUP_REQUEST') {
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

    if (userEmail) {
      user = users.find((u: any) => u.email?.toLowerCase() === userEmail.toLowerCase());
    }
    if (!user && userName && userName !== 'Unknown User') {
      user = users.find((u: any) => u.name === userName);
    }

    const now = new Date();
    const hasCoords = typeof lat === 'number' && typeof lng === 'number';
    const currentMonth = getCurrentMonth();

    // Build rich message
    let header = '';
    if (alertType === 'SAFE ARRIVAL') {
      header = `✅ SAFE ARRIVAL`;
    } else if (alertType === 'EMERGENCY') {
      header = `🚨 EMERGENCY - SEND HELP`;
    } else {
      header = `⚠️ ALERT`;
    }

    let richExtra = '';
    if (user && user.lastAlert && hasCoords) {
      const prev = user.lastAlert;
      const timeDiffMs = now.getTime() - prev.timestamp;
      const timeStr = formatTimeDiff(timeDiffMs);
      const distKm = haversineKm(prev.lat, prev.lng, lat, lng);
      const distStr = distKm < 1
        ? `${Math.round(distKm * 1000)} m`
        : `${distKm.toFixed(2)} km`;

      richExtra = `\n⏱ ${timeStr} since last alert\n📏 ${distStr} from previous location`;
    } else {
      richExtra = `\n⏱ First alert today`;
    }

    let mapsLink = '';
    if (hasCoords) {
      mapsLink = `\n📍 https://maps.google.com/?q=${lat},${lng}&z=18`;
    } else {
      mapsLink = `\n📍 Location unavailable`;
    }

    // Final professional message
    const finalMessage = 
`${header}
From: ${userName}
Time: ${formatDateTime(now)}

${frontendMessage}
${richExtra}${mapsLink}`;

    // Update lastAlert + monthly SMS counter
    if (user && hasCoords) {
      user.lastAlert = {
        timestamp: now.getTime(),
        lat,
        lng
      };

      if (user.smsMonth !== currentMonth) {
        user.smsCount = 1;
        user.smsMonth = currentMonth;
      } else {
        user.smsCount = (user.smsCount || 0) + 1;
      }

      writeUsers(users);
    }

    // Send via MessageMedia
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
