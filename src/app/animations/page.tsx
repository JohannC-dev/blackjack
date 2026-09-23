import type { Metadata } from "next";
import { AnimationLab } from "@/components/lab/animation-lab";

export const metadata: Metadata = {
  title: "Animation Lab — MINUIT",
  robots: { index: false, follow: false },
};

export default function AnimationsPage() {
  return <AnimationLab />;
}
