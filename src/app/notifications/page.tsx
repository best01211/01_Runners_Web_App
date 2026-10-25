import {Suspense} from 'react';
import {redirect} from 'next/navigation';
import {getCurrentPageProfile} from '@/lib/auth/current-user';
import {canUseService} from '@/lib/auth/account-access';
import {NotificationInbox} from '@/components/notifications/notification-inbox';
export const metadata={title:'내 알림 | 2001 Runners'};
export default async function Page(){const p=await getCurrentPageProfile();if(!p||!canUseService(p))redirect('/login');return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6"><h1 className="text-2xl font-bold">내 알림</h1><Suspense fallback={<p>알림을 불러오는 중…</p>}><NotificationInbox/></Suspense></main>;}
