import { redirect } from 'next/navigation';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const workspace = queryOne<{ slug: string }>(
    `SELECT slug
     FROM workspaces
     ORDER BY CASE WHEN id = 'default' THEN 0 ELSE 1 END, name
     LIMIT 1`
  );

  redirect(`/workspace/${workspace?.slug || 'default'}`);
}
