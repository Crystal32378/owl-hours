import { storyPackCopys as copy } from "../copys/storyPackCopys.ts";
import type { StorySlide } from "@owl-hours/shared";
export type { StorySlide } from "@owl-hours/shared";

export type StoryAssetRole = "before" | "after" | "job_photo";

export type StoryAsset = {
  id: string;
  role: StoryAssetRole;
  label: string;
  imageUrl?: string;
  revision?: string;
};

export type StorySource = {
  id: string;
  businessName: string;
  jobTitle: string;
  state: string;
  shareConsent: "yes" | "no" | "asked" | "not_asked";
  assets: StoryAsset[];
  isDemo: boolean;
};

export type StoryTargets = { facebook: boolean; instagram: boolean };
export type StoryPackStatus = "draft" | "approved" | "published" | "rejected";

export type StoryPack = {
  id: string;
  sourceJobId: string;
  sourceMediaIds: string[];
  canHandoff: boolean;
  businessName: string;
  jobTitle: string;
  caption: string;
  slides: StorySlide[];
  platforms: StoryTargets;
  status: StoryPackStatus;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
};

const REQUIRED_STORY_ROLES: StoryAssetRole[] = ["before", "after"];

export function canCreateStoryPack(source: StorySource): boolean {
  if (source.state !== "done" || source.shareConsent !== "yes") return false;
  return REQUIRED_STORY_ROLES.every((role) => source.assets.some((asset) => asset.role === role));
}

export function buildStoryPack(source: StorySource, id: string, createdAt: string): StoryPack {
  if (!canCreateStoryPack(source)) {
    throw new Error(copy.sourceRequired);
  }

  const subject = source.jobTitle.trim();
  const business = source.businessName.trim();
  if (!subject || !business) throw new Error(copy.namesRequired);

  return {
    id,
    sourceJobId: source.id,
    sourceMediaIds: REQUIRED_STORY_ROLES.map((role) => source.assets.find((asset) => asset.role === role)!.id),
    canHandoff: false,
    businessName: business,
    jobTitle: subject,
    caption: copy.caption(subject,business),
    slides: copy.slides(subject,business),
    platforms: { facebook: false, instagram: false },
    status: "draft",
    isDemo: source.isDemo,
    createdAt,
    updatedAt: createdAt,
  };
}

export function storyPackStatusLabel(status: StoryPackStatus): string {
  return copy.statusLabels[status];
}

export type StoryHandoff = { pack: StoryPack; source: StorySource };
export type StoryPhotoJob = {
  id: string;
  businessName: string;
  jobTitle: string;
  shareConsent: "yes" | "no" | "not_asked";
  consentRecordedAt: string | null;
  assignmentBlockedReason: "consent_required" | "ambiguous_conversation" | null;
  assets: {
    id: string;
    role: "before" | "after" | "unassigned";
    label: string;
    imageUrl: string;
  }[];
};

export type ApprovalMediaItem = {
  id: string;
  role: "before" | "after";
  revision: string;
};

export function buildApprovalMediaSnapshot(
  source: StorySource,
  pack: StoryPack,
): ApprovalMediaItem[] | null {
  if (source.id !== pack.sourceJobId || pack.sourceMediaIds.length !== 2 || new Set(pack.sourceMediaIds).size !== 2) {
    return null;
  }

  const selectedAssets = source.assets.filter((asset) =>
    pack.sourceMediaIds.includes(asset.id),
  );

  if (selectedAssets.length !== pack.sourceMediaIds.length) {
    return null;
  }

  const snapshot: ApprovalMediaItem[] = [];

  for (const asset of selectedAssets) {
    if (!asset.revision || (!pack.isDemo && !/^[a-f0-9]{64}$/.test(asset.revision))) {
      return null;
    }

    if (asset.role === "before" || asset.role === "after") {
      snapshot.push({
        id: asset.id,
        role: asset.role,
        revision: asset.revision,
      });
    }
  }

  const hasBefore = snapshot.some((item) => item.role === "before");
  const hasAfter = snapshot.some((item) => item.role === "after");
  if (!hasBefore || !hasAfter) {
    return null;
  }

  return snapshot;
}

export function isBackNavigationDisabled(flags: {
  saving: boolean;
  exporting: boolean;
  approving: boolean;
}): boolean {
  return flags.saving || flags.exporting || flags.approving;
}

export function hasSelectedStoryMedia(
  pack: StoryPack,
  source: StorySource,
): boolean {
  if (source.id !== pack.sourceJobId || !canCreateStoryPack(source)) return false;
  if (pack.sourceMediaIds.length !== 2 || new Set(pack.sourceMediaIds).size !== pack.sourceMediaIds.length) return false;
  const selected = pack.sourceMediaIds.map((id) => source.assets.find((asset) => asset.id === id));
  return selected.every(Boolean) && REQUIRED_STORY_ROLES.every((role) => selected.some((asset) => asset?.role === role));
}
