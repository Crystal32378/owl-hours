import {
  storyPackCreateSchema,
  storySlidesSchema,
  type StoryPackApprovalSnapshot,
} from "@owl-hours/shared";
import { storyPackCopys } from "../copys/storyPackCopys.ts";
import {
  buildStoryPack,
  canCreateStoryPack,
  hasSelectedStoryMedia,
  type StoryHandoff,
  type StoryPack,
  type StoryPhotoJob,
  type StorySlide,
  type StorySource,
  type StoryTargets,
} from "../lib/storyPack.ts";
import { storyPackServiceCopys as copy } from "../copys/storyPackServiceCopys.ts";

export type StoryPackPatch = {
  expectedUpdatedAt?: string;
  caption?: string;
  slides?: StorySlide[];
  platforms?: StoryTargets;
};
export type StoryPackClient = {
  listSources(): Promise<StorySource[]>;
  listPacks(): Promise<StoryPack[]>;
  findPack(id: string): Promise<StoryPack | null>;
  create(pack: StoryPack): Promise<StoryPack>;
  update(pack: StoryPack, expectedUpdatedAt?: string): Promise<StoryPack>;
  review(id: string, snapshot: StoryPackApprovalSnapshot): Promise<StoryPack>;
  handoff(id: string): Promise<StoryHandoff>;
  listPhotoJobs(): Promise<StoryPhotoJob[]>;
  assignPhotos(
    jobId: string,
    beforeMediaId: string,
    afterMediaId: string,
  ): Promise<void>;
};
export type StoryPackService = {
  listSources(): Promise<StorySource[]>;
  listPacks(): Promise<StoryPack[]>;
  createFromJob(jobId: string): Promise<StoryPack>;
  updateDraft(id: string, patch: StoryPackPatch): Promise<StoryPack>;
  approve(id: string, snapshot: StoryPackApprovalSnapshot): Promise<StoryPack>;
  prepareHandoff(id: string): Promise<StoryHandoff>;
  listPhotoJobs(): Promise<StoryPhotoJob[]>;
  assignPhotos(
    jobId: string,
    beforeMediaId: string,
    afterMediaId: string,
  ): Promise<void>;
};
export type StoryPackServiceDeps = { newId: () => string; now: () => string };
export function createStoryPackService(
  client: StoryPackClient,
  deps: Partial<StoryPackServiceDeps> = {},
): StoryPackService {
  let sequence = 0;
  const newId = deps.newId ?? (() => `story_${Date.now()}_${++sequence}`);
  const now = deps.now ?? (() => new Date().toISOString());
  async function requirePack(id: string) {
    const pack = await client.findPack(id);
    if (!pack) throw new Error(copy.notFound);
    return pack;
  }
  return {
    listSources: async () =>
      (await client.listSources()).filter(canCreateStoryPack),
    listPacks: () => client.listPacks(),
    listPhotoJobs: () => client.listPhotoJobs(),
    assignPhotos: (jobId, beforeId, afterId) =>
      client.assignPhotos(jobId, beforeId, afterId),
    async createFromJob(jobId) {
      const source = (await client.listSources()).find(
        (candidate) => candidate.id === jobId,
      );
      if (!source || !canCreateStoryPack(source))
        throw new Error(copy.sourceBlocked);
      return client.create(buildStoryPack(source, newId(), now()));
    },
    async updateDraft(id, patch) {
      const current = await requirePack(id);
      if (current.status !== "draft") throw new Error(copy.draftOnlyEdit);
      const { expectedUpdatedAt = current.updatedAt, ...fields } = patch;
      if (current.updatedAt !== expectedUpdatedAt) throw new Error(copy.changedSinceReview);
      const next: StoryPack = {
        ...current,
        ...fields,
        slides: patch.slides?.map((slide) => ({ ...slide })) ?? current.slides,
        platforms: { ...(patch.platforms ?? current.platforms) },
        updatedAt: now(),
      };
      validatePackCopy(next);
      return client.update(next, expectedUpdatedAt);
    },
    async approve(id, snapshot) {
      const current = await requirePack(id);
      if (current.status !== "draft") throw new Error(copy.draftOnlyApprove);
      if (current.updatedAt !== snapshot.expectedUpdatedAt)
        throw new Error(copy.changedSinceReview);
      validatePackCopy(current);
      if (!current.platforms.facebook && !current.platforms.instagram)
        throw new Error(copy.chooseFormat);
      // Live clients call the server's review transition; only the explicit demo adapter stores it locally.
      return client.review(id, snapshot);
    },
    async prepareHandoff(id) {
      const current = await requirePack(id);
      if (current.status !== "approved") throw new Error(copy.approveFirst);
      validatePackCopy(current);
      if (!current.platforms.facebook && !current.platforms.instagram)
        throw new Error(copy.chooseFormat);
      // Recheck on every attempt, including repeated downloads of a previously prepared pack.
      return client.handoff(id);
    },
  };
}
function validatePackCopy(pack: StoryPack) {
  if (!storyPackCreateSchema.shape.caption.safeParse(pack.caption).success)
    throw new Error(copy.invalidCaption);
  if (!storySlidesSchema.safeParse(pack.slides).success)
    throw new Error(copy.invalidSlides);
}
function syntheticImage(after: boolean): string {
  const label = after
    ? storyPackCopys.syntheticAfter
    : storyPackCopys.syntheticBefore;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
    <rect width="1080" height="1920" fill="${after ? "#c4d6c8" : "#e6c9b7"}"/>
    <rect x="160" y="400" width="760" height="900" rx="40" fill="#fff8e9"/>
    <path d="M300 650H760V900H540V1150" fill="none" stroke="#506357" stroke-width="65"/>
    <circle cx="540" cy="1180" r="45" fill="${after ? "#508068" : "#ad5747"}"/>
    <text x="540" y="1480" text-anchor="middle" font-family="sans-serif" font-size="52" fill="#25382e">${label}</text>
    <text x="540" y="1570" text-anchor="middle" font-family="sans-serif" font-size="36" fill="#25382e">${storyPackCopys.syntheticDisclaimer}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
const demoSource: StorySource = {
  id: "job-demo-completed-01",
  businessName: storyPackCopys.demoBusiness,
  jobTitle: storyPackCopys.demoJob,
  state: "done",
  shareConsent: "yes",
  isDemo: true,
  assets: [
    {
      id: "demo-before",
      revision: "synthetic-before-v1",
      role: "before",
      label: storyPackCopys.demoBefore,
      imageUrl: syntheticImage(false),
    },
    {
      id: "demo-after",
      revision: "synthetic-after-v1",
      role: "after",
      label: storyPackCopys.demoAfter,
      imageUrl: syntheticImage(true),
    },
  ],
};
// Created only by explicit EXPO_PUBLIC_STORY_PACK_MODE=demo. No real auth session or API is used.
export function createFakeStoryPackClient(): StoryPackClient {
  const sources = structuredClone([demoSource]);
  const packs: StoryPack[] = [];
  const approvals = new Map<string, StoryPackApprovalSnapshot>();
  const find = (id: string) => {
    const pack = packs.find((pack) => pack.id === id);
    if (!pack) throw new Error(copy.notFound);
    return pack;
  };
  const sourceFor = (pack: StoryPack) => {
    const source = sources.find((source) => source.id === pack.sourceJobId);
    if (!source || !hasSelectedStoryMedia(pack, source))
      throw new Error(copy.selectedMediaBlocked);
    return source;
  };
  const matchesApproval = (
    pack: StoryPack,
    source: StorySource,
    snapshot: StoryPackApprovalSnapshot | undefined,
  ) =>
    !!snapshot &&
    snapshot.expectedMedia.length === pack.sourceMediaIds.length &&
    new Set(snapshot.expectedMedia.map((media) => media.id)).size ===
      snapshot.expectedMedia.length &&
    snapshot.expectedMedia.every(
      (expected) =>
        pack.sourceMediaIds.includes(expected.id) &&
        source.assets.some(
          (asset) =>
            asset.id === expected.id &&
            asset.role === expected.role &&
            asset.revision === expected.revision,
        ),
    );
  return {
    listSources: async () => structuredClone(sources),
    listPacks: async () =>
      structuredClone(
        packs.map((pack) => ({
          ...pack,
          canHandoff:
            pack.status === "approved" &&
            sources.some(
              (source) =>
                hasSelectedStoryMedia(pack, source) &&
                matchesApproval(pack, source, approvals.get(pack.id)),
            ),
        })),
      ),
    findPack: async (id) =>
      structuredClone(packs.find((pack) => pack.id === id) ?? null),
    create: async (pack) => {
      packs.push(structuredClone(pack));
      return structuredClone(pack);
    },
    update: async (pack, expectedUpdatedAt) => {
      if (expectedUpdatedAt !== undefined && find(pack.id).updatedAt !== expectedUpdatedAt) throw new Error(copy.changedSinceReview);
      Object.assign(find(pack.id), structuredClone(pack));
      return structuredClone(pack);
    },
    review: async (id, snapshot) => {
      const pack = find(id);
      const source = sourceFor(pack);
      if (
        pack.updatedAt !== snapshot.expectedUpdatedAt ||
        !matchesApproval(pack, source, snapshot)
      )
        throw new Error(copy.changedSinceReview);
      approvals.set(id, structuredClone(snapshot));
      Object.assign(pack, {
        status: "approved",
        canHandoff: true,
        approvedAt: new Date().toISOString(),
      });
      return structuredClone(pack);
    },
    handoff: async (id) => {
      const pack = find(id);
      const source = sourceFor(pack);
      if (!matchesApproval(pack, source, approvals.get(id)))
        throw new Error(copy.changedSinceReview);
      return structuredClone({
        pack,
        source: {
          ...source,
          assets: source.assets.filter((asset) =>
            pack.sourceMediaIds.includes(asset.id),
          ),
        },
      });
    },
    listPhotoJobs: async () =>
      sources.map((source) => ({
        id: source.id,
        businessName: source.businessName,
        jobTitle: source.jobTitle,
        shareConsent: source.shareConsent === "yes" ? "yes" : "no",
        consentRecordedAt: null,
        assignmentBlockedReason: null,
        assets: source.assets.map((asset) => ({
          ...asset,
          role: asset.role === "job_photo" ? "unassigned" : asset.role,
          imageUrl: asset.imageUrl!,
        })),
      })),
    assignPhotos: async (jobId, beforeId, afterId) => {
      const source = sources.find((source) => source.id === jobId);
      if (
        !source ||
        source.shareConsent !== "yes" ||
        beforeId === afterId ||
        ![beforeId, afterId].every((id) =>
          source.assets.some((asset) => asset.id === id),
        )
      )
        throw new Error(copy.selectedMediaBlocked);
      source.assets = source.assets.map((asset) => ({
        ...asset,
        role:
          asset.id === beforeId
            ? "before"
            : asset.id === afterId
              ? "after"
              : "job_photo",
      }));
    },
  };
}
