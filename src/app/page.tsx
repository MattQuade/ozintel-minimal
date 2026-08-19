import { cookies, headers } from 'next/headers';
import HomeClient from './HomeClient';
import { findUserByEmail, publicUser } from '@/lib/users';
import { readAlertContacts } from '@/lib/alertContacts';
import { SESSION_COOKIE_NAME } from '@/lib/sessionCookie';

/** Avoid year-long CDN/static shells that leave home buttons looking dead on iOS. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type HomeSearchParams = {
  signup?: string;
  restore?: string;
  contact?: string;
  list?: string;
  reason?: string;
};

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<HomeSearchParams>;
}) {
  // Touch request headers so Next does not fully statically cache this route.
  await headers();
  const sp = (await searchParams) || {};

  let initialUser = null;
  let initialSafe: { name: string; phone: string }[] = [];
  let initialEmergency: { name: string; phone: string }[] = [];

  try {
    const jar = await cookies();
    const raw = jar.get(SESSION_COOKIE_NAME)?.value;
    const email = raw
      ? (() => {
          try {
            return decodeURIComponent(raw).trim();
          } catch {
            return raw.trim();
          }
        })()
      : '';
    if (email) {
      const user = await findUserByEmail(email);
      if (user) {
        initialUser = publicUser(user);
        const contacts = await readAlertContacts(user.email);
        initialSafe = contacts.safe;
        initialEmergency = contacts.emergency;
      }
    }
  } catch (err) {
    console.error('[home] session load failed', err);
  }

  return (
    <HomeClient
      initialSignup={sp.signup || null}
      initialRestore={sp.restore || null}
      initialContact={sp.contact || null}
      initialContactList={sp.list || null}
      initialSignupReason={sp.reason || null}
      initialUser={initialUser}
      initialSafeContacts={initialSafe}
      initialEmergencyContacts={initialEmergency}
    />
  );
}
