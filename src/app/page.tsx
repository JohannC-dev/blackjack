import { Casino } from "@/components/casino";
import { ProfileProvider } from "@/lib/profile-context";
import { AudioProvider } from "@/lib/audio-context";

export default function Page() {
  return (
    <ProfileProvider>
      <AudioProvider>
        <Casino />
      </AudioProvider>
    </ProfileProvider>
  );
}
