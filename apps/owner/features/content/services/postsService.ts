// Spec: odd/tasks/owner-content.md, S2, S3, and S4 requirements.
// Service and fake client adapter for content drafts, published posts, and post approval.
import { DEMO_NOW, accounts as mockAccounts, anaJob, business, drafts as mockDrafts, regeneratedCaptions } from "../../../shared/data/mock.ts";
import type { ID, Job, PostDraft } from "../../../shared/data/types.ts";
import type { JobPhotoSource } from "../lib/jobPhotos.ts";
import { approvePost, regeneratePost } from "../lib/postApproval.ts";

export type PostsClient = {
  findPost(id: ID): Promise<PostDraft | null>;
  // Answers the post as the store now holds it, so callers show its status, never an assumed one.
  savePost(post: PostDraft): Promise<PostDraft>;
  listPosts(): Promise<PostDraft[]>;
  // Posts an approved post again after a failed attempt; only the live API posts for real.
  publishPost?(id: ID): Promise<PostDraft>;
  findJob(id: ID): Promise<JobPhotoSource | null>;
  getBusinessName?(): Promise<string>;
};

export type PostsServiceDeps = {
  now?: () => string;
  // False where no copy generator backs Regenerate (live API), so the screen hides it.
  canRegenerate?: boolean;
};

export type PostsService = {
  canRegenerate: boolean;
  getDrafts(): Promise<PostDraft[]>;
  getDraft(id: ID): Promise<PostDraft | null>;
  getPost(id: ID): Promise<PostDraft | null>;
  getScheduled(): Promise<PostDraft[]>;
  getPublished(): Promise<PostDraft[]>;
  getJob(id: ID): Promise<JobPhotoSource | null>;
  getBusinessName(): Promise<string>;
  approve(
    id: ID,
    options?: {
      caption?: string;
      targets?: { facebook: boolean; instagram: boolean };
    },
  ): Promise<PostDraft | null>;
  regenerate(id: ID): Promise<PostDraft | null>;
};

const SEED_PUBLISHED_POST: PostDraft = {
  id: "post_published_water_heater",
  title: "Water heater installed in one visit",
  caption: "Water heater installed in one visit",
  source: "job",
  targets: { facebook: true, instagram: true },
  status: "published",
  publishedAt: "2026-10-20T10:00:00-05:00",
};

export function createPostsService(
  client: PostsClient,
  deps?: PostsServiceDeps,
): PostsService {
  const clock = deps?.now ?? (() => DEMO_NOW);
  const canRegenerate = deps?.canRegenerate ?? true;
  const regeneratedIds = new Set<ID>();

  // Only the demo can regenerate. Each tap swaps between the draft's caption and its other one.
  function withNextCaption(post: PostDraft): PostDraft {
    const other = regeneratedCaptions[post.id];
    if (!other) return post;
    const isShowingOther = regeneratedIds.delete(post.id);
    if (isShowingOther) return post;
    regeneratedIds.add(post.id);
    return { ...post, caption: other };
  }

  return {
    canRegenerate,
    getDrafts: async () => {
      const posts = await client.listPosts();
      return posts.filter((p) => p.status === "draft");
    },
    getDraft: async (id) => {
      regeneratedIds.delete(id);
      const post = await client.findPost(id);
      return post?.status === "draft" ? post : null;
    },
    getPost: (id) => client.findPost(id),
    getScheduled: async () => {
      const posts = await client.listPosts();
      // Live approval waits for posting; it is listed with the scheduled posts, never as published.
      return posts.filter((p) => p.status === "scheduled" || p.status === "approved");
    },
    getPublished: async () => {
      const posts = await client.listPosts();
      return posts.filter((p) => p.status === "published");
    },
    getJob: (id) => client.findJob(id),
    getBusinessName: async () => {
      if (client.getBusinessName) {
        return client.getBusinessName();
      }
      return business.name;
    },
    approve: async (id, options) => {
      const post = await client.findPost(id);
      if (post?.status === "approved" && client.publishPost) return client.publishPost(id);
      const approved = post
        ? approvePost(post, {
            now: clock(),
            caption: options?.caption,
            targets: options?.targets,
          })
        : null;

      return approved ? client.savePost(approved) : null;
    },
    regenerate: async (id) => {
      if (!canRegenerate) return null;
      const post = await client.findPost(id);
      const regenerated = post ? regeneratePost(post) : null;
      return regenerated && withNextCaption(regenerated);
    },
  };
}

export function createFakePostsClient(): PostsClient {
  const postsList: PostDraft[] = [
    ...structuredClone(mockDrafts),
    structuredClone(SEED_PUBLISHED_POST),
  ];
  const postsById = new Map<ID, PostDraft>(postsList.map((p) => [p.id, p]));
  const jobsById = new Map<ID, Job>([[anaJob.id, structuredClone(anaJob)]]);

  return {
    findPost: async (id) => structuredClone(postsById.get(id) ?? null),
    savePost: async (post) => {
      postsById.set(post.id, structuredClone(post));
      return structuredClone(post);
    },
    listPosts: async () => Array.from(postsById.values()).map((p) => structuredClone(p)),
    findJob: async (id) => structuredClone(jobsById.get(id) ?? null),
    getBusinessName: async () => {
      const fb = mockAccounts.find((a) => a.kind === "facebook_page");
      return fb?.name ?? business.name;
    },
  };
}

// Module-level shared client instance used as default across content hooks so approvals persist in session.
export const defaultFakePostsClient: PostsClient = createFakePostsClient();
