import { MissionShell } from '@/components/navigation/MissionShell';

export default function SystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MissionShell>{children}</MissionShell>;
}
