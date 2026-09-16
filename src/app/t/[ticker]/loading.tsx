import { SkeletonCard } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-4">
      <SkeletonCard lines={2} />
      <SkeletonCard lines={4} />
      <SkeletonCard lines={3} />
    </div>
  );
}
