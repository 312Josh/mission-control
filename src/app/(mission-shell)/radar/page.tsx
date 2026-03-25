import { SectionStubPage } from '@/components/navigation/SectionStubPage';
import { missionSectionBySlug } from '@/lib/mission-sections';

export default function SectionPage() {
  return <SectionStubPage section={missionSectionBySlug['radar']} />;
}
