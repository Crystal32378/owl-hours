import {
  storyPackCreateSchema,
  storyPackDraftSchema,
  storyPackHandoffSchema,
  storyPackSourceSchema,
  storyPackUpdateSchema,
  storyPackReviewSchema,
  type StoryPackDraftDto,
} from "@owl-hours/shared";
import type {
  StoryHandoff,
  StoryPack,
  StoryPhotoJob,
  StorySource,
} from "../lib/storyPack.ts";
import { hasSelectedStoryMedia } from "../lib/storyPack.ts";
import { storyPackServiceCopys as copy } from "../copys/storyPackServiceCopys.ts";
import type { StoryPackClient } from "./storyPackService.ts";

function httpErrorMessage(status: number): string {
  if (status === 401) return copy.sessionError;
  if (status === 409) return copy.changedSinceReview;
  return copy.requestError;
}

export class StoryPackHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(httpErrorMessage(status));
    this.status = status;
  }
}
export type StoryPackHttpOptions = {
  apiUrl: string;
  getAccessToken: () => Promise<string>;
  fetch?: typeof fetch;
};

export function createHttpStoryPackClient(
  options: StoryPackHttpOptions,
): StoryPackClient {
  const http = options.fetch ?? fetch;
  let sources: StorySource[] = [];
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    const token = await options.getAccessToken();
    const response = await http(
      `${options.apiUrl.replace(/\/$/, "")}/v1/owner/content${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    if (!response.ok) throw new StoryPackHttpError(response.status);
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("data" in result))
      throw new Error(copy.invalidResponse);
    return result.data;
  }
  function fromDraft(value: unknown): StoryPack {
    const dto = storyPackDraftSchema.parse(value);
    const source = sources.find((source) => source.id === dto.sourceJobId);
    return {
      id: dto.id,
      sourceJobId: dto.sourceJobId ?? "",
      sourceMediaIds: dto.sourceMediaIds,
      canHandoff: dto.canHandoff,
      businessName: source?.businessName ?? copy.sourceUnavailable,
      jobTitle: dto.title ?? source?.jobTitle ?? copy.jobFallback,
      caption: dto.caption,
      slides: dto.slides ?? [],
      platforms: {
        facebook: dto.platforms.includes("facebook_page"),
        instagram: dto.platforms.includes("instagram"),
      },
      status: dto.status,
      isDemo: false,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      ...(dto.reviewedAt ? { approvedAt: dto.reviewedAt } : {}),
    };
  }
  function fields(pack: StoryPack) {
    return {
      caption: pack.caption,
      slides: pack.slides,
      platforms: [
        ...(pack.platforms.facebook ? ["facebook_page" as const] : []),
        ...(pack.platforms.instagram ? ["instagram" as const] : []),
      ],
    };
  }
  async function listPacks() {
    const result = await request("/drafts");
    if (!Array.isArray(result)) throw new Error(copy.invalidResponse);
    return result
      .filter((value: StoryPackDraftDto) => value.source === "story_pack")
      .map(fromDraft);
  }
  return {
    async listSources() {
      const result = await request("/sources");
      if (!Array.isArray(result)) throw new Error(copy.invalidResponse);
      sources = result.map((value) => storyPackSourceSchema.parse(value));
      return sources;
    },
    listPacks,
    findPack: async (id) =>
      (await listPacks()).find((pack) => pack.id === id) ?? null,
    create: async (pack) =>
      fromDraft(
        await request(
          "/drafts",
          "POST",
          storyPackCreateSchema.parse({
            sourceJobId: pack.sourceJobId,
            sourceMediaIds: pack.sourceMediaIds,
            title: pack.jobTitle,
            ...fields(pack),
          }),
        ),
      ),
    update: async (pack, expectedUpdatedAt = pack.updatedAt) =>
      fromDraft(
        await request(
          `/drafts/${encodeURIComponent(pack.id)}`,
          "PATCH",
          storyPackUpdateSchema.parse({ ...fields(pack), expectedUpdatedAt }),
        ),
      ),
    review: async (id, snapshot) =>
      fromDraft(
        await request(
          `/drafts/${encodeURIComponent(id)}/review`,
          "POST",
          storyPackReviewSchema.parse({ approve: true, ...snapshot }),
        ),
      ),
    async handoff(id): Promise<StoryHandoff> {
      const response = storyPackHandoffSchema.parse(
        await request(`/drafts/${encodeURIComponent(id)}/handoff`, "POST", {}),
      );
      const source = response.source;
      sources = [
        ...sources.filter((candidate) => candidate.id !== source.id),
        source,
      ];
      const pack = fromDraft(response.draft);
      if (
        pack.status !== "approved" ||
        !pack.canHandoff ||
        !hasSelectedStoryMedia(pack, source)
      )
        throw new Error(copy.selectedMediaBlocked);
      return { pack, source };
    },
    async listPhotoJobs() {
      const result = await request("/photo-jobs");
      if (!Array.isArray(result) || result.some((value) => !isPhotoJob(value)))
        throw new Error(copy.invalidResponse);
      return result as StoryPhotoJob[];
    },
    async assignPhotos(jobId, beforeMediaId, afterMediaId) {
      await request(`/photo-jobs/${encodeURIComponent(jobId)}/assign`, "POST", {
        beforeMediaId,
        afterMediaId,
      });
    },
  };
}
function isPhotoJob(value: unknown): value is StoryPhotoJob {
  if (!value || typeof value !== "object") return false;
  const job = value as StoryPhotoJob;
  return (
    typeof job.id === "string" &&
    typeof job.businessName === "string" &&
    typeof job.jobTitle === "string" &&
    ["yes", "no", "not_asked"].includes(job.shareConsent) &&
    (job.consentRecordedAt === null ||
      typeof job.consentRecordedAt === "string") &&
    [null, "consent_required", "ambiguous_conversation"].includes(
      job.assignmentBlockedReason,
    ) &&
    Array.isArray(job.assets) &&
    job.assets.every(
      (asset) =>
        typeof asset.id === "string" &&
        ["before", "after", "unassigned"].includes(asset.role) &&
        typeof asset.label === "string" &&
        typeof asset.imageUrl === "string",
    )
  );
}
