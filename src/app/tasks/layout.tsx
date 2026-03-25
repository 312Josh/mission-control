import { MissionShell } from '@/components/navigation/MissionShell';

export default function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MissionShell>{children}</MissionShell>;
}
