import { MissionSectionLivePage } from '@/components/navigation/MissionSectionLivePage';
import { missionSectionBySlug } from '@/lib/mission-sections';

export default function SectionPage() {
  return <MissionSectionLivePage section={missionSectionBySlug['team']} />;
}
