import { MissionShell } from '@/components/navigation/MissionShell';

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MissionShell>{children}</MissionShell>;
}
