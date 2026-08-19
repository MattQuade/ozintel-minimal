import { headers } from 'next/headers';
import HomeClient from './HomeClient';

/** Avoid year-long CDN/static shells that leave home buttons looking dead on iOS. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  // Touch request headers so Next does not fully statically cache this route.
  await headers();
  return <HomeClient />;
}
