import { MissionShell } from '@/components/navigation/MissionShell';

export default function MissionShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MissionShell>{children}</MissionShell>;
}
