import { MembersSection, ChoreWeekEditor } from "./component";

export const instant = false;

export default function MembersPage() {
  return (
    <div className="space-y-6">
      <MembersSection />
      <ChoreWeekEditor />
    </div>
  );
}
