import { z } from "zod";

export const STORY_PACK_LIMITS = {
  slideTitle: 60,
  slideBody: 280,
  title: 80,
  caption: 2200,
} as const;

export const storySlideSchema = z.object({
  title: z.string().trim().min(1).max(STORY_PACK_LIMITS.slideTitle),
  body: z.string().trim().min(1).max(STORY_PACK_LIMITS.slideBody),
}).strict();

export const storySlidesSchema = z.array(storySlideSchema).length(3);

export const storyPlatformsSchema = z.array(z.enum(["facebook_page", "instagram"]))
  .max(2)
  .refine((values) => new Set(values).size === values.length, "platforms must not contain duplicates");

const selectedMediaSchema = z.array(z.string().uuid())
  .length(2)
  .refine((values) => new Set(values).size === values.length, "sourceMediaIds must not contain duplicates");

export const storyPackCreateSchema = z.object({
  sourceJobId: z.string().uuid(),
  sourceMediaIds: selectedMediaSchema,
  title: z.string().trim().min(1).max(STORY_PACK_LIMITS.title),
  caption: z.string().trim().min(1).max(STORY_PACK_LIMITS.caption),
  slides: storySlidesSchema,
  platforms: storyPlatformsSchema,
}).strict();

export const storyPackUpdateSchema = storyPackCreateSchema
  .pick({ title: true, caption: true, slides: true, platforms: true })
  .partial()
  .extend({ expectedUpdatedAt: z.string().datetime({ offset: true }) })
  .refine((input) => Object.keys(input).some((key) => key !== "expectedUpdatedAt"), "provide at least one draft field");

export const storyPackDraftSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(["job", "story_pack", "prices", "reminder"]),
  sourceJobId: z.string().uuid().nullable(),
  sourceMediaIds: z.array(z.string().uuid()),
  title: z.string().nullable(),
  caption: z.string(),
  // Older drafts have no Story copy; they must be edited before approval.
  slides: storySlidesSchema.nullable(),
  platforms: storyPlatformsSchema,
  scheduledAt: z.string().nullable(),
  status: z.enum(["draft", "approved", "published", "rejected"]),
  reviewedAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  canHandoff: z.boolean(),
});

export const storyPackSourceSchema = z.object({
  id: z.string().uuid(),
  businessName: z.string(),
  jobTitle: z.string(),
  state: z.literal("done"),
  shareConsent: z.literal("yes"),
  isDemo: z.literal(false),
  assets: z.array(z.object({
    id: z.string().uuid(),
    role: z.enum(["before", "after"]),
    label: z.string(),
    imageUrl: z.string().url(),
    // Stable across expiring URL signatures; changes when the stored path changes.
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  })),
});

export const storyPackHandoffSchema = z.object({
  draft: storyPackDraftSchema,
  source: storyPackSourceSchema,
});

export type StorySlide = z.infer<typeof storySlideSchema>;
export type StoryPackCreate = z.infer<typeof storyPackCreateSchema>;
export type StoryPackUpdate = z.infer<typeof storyPackUpdateSchema>;
export type StoryPackDraftDto = z.infer<typeof storyPackDraftSchema>;
export type StoryPackSourceDto = z.infer<typeof storyPackSourceSchema>;
export type StoryPackHandoffDto = z.infer<typeof storyPackHandoffSchema>;

export const storyPackMediaRevisionSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["before", "after"]),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const storyPackReviewSchema = z.object({
  approve: z.boolean(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  expectedMedia: z.array(storyPackMediaRevisionSchema)
    .length(2)
    .refine((values) => new Set(values.map((v) => v.id)).size === values.length, "selected media must be distinct")
    .refine(
      (values) => {
        const roles = values.map((v) => v.role);
        return roles.includes("before") && roles.includes("after");
      },
      "expectedMedia requires exactly one before and one after photo",
    )
    .optional(),
}).strict().superRefine((input, ctx) => {
  if (input.approve && (!input.expectedUpdatedAt || !input.expectedMedia)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Approval requires the displayed draft version and selected photos.",
    });
  }
});

export type StoryPackMediaRevision = z.infer<typeof storyPackMediaRevisionSchema>;
export type StoryPackApprovalSnapshot = {
  expectedUpdatedAt: string;
  expectedMedia: StoryPackMediaRevision[];
};
export type StoryPackReview = z.infer<typeof storyPackReviewSchema>;
