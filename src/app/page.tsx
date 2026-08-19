import { headers } from 'next/headers';
import HomeClient from './HomeClient';

/** Avoid year-long CDN/static shells that leave home buttons looking dead on iOS. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type HomeSearchParams = {
  signup?: string;
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
  return (
    <HomeClient
      initialSignup={sp.signup || null}
      initialSignupReason={sp.reason || null}
    />
  );
}
