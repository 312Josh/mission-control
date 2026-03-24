import CommandCenter from '@/components/CommandCenter';
import { AGENT_ROSTER } from '@/lib/command-center';

export default function HomePage() {
  return <CommandCenter roster={AGENT_ROSTER} />;
}
