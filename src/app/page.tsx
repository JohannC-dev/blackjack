import { Casino } from "@/components/casino";
import { ProfileProvider } from "@/lib/profile-context";

export default function Page() {
  return (
    <ProfileProvider>
      <Casino />
    </ProfileProvider>
  );
}
