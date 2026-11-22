import { z } from 'zod';

const dateLike = z.string().regex(/^\d{4}(-\d{2})?$/, 'Use YYYY or YYYY-MM');

export const ResumeSchema = z.strictObject({
  full_name: z.string().min(1),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  summary: z.string().nullable(),
  skills: z.array(z.string().min(1)).max(40),
  experience: z
    .array(
      z.strictObject({
        company: z.string(),
        role: z.string(),
        start: dateLike,
        end: dateLike.nullable(),
        months: z.number().int().nonnegative().nullable(),
      }),
    )
    .max(20),
  education: z
    .array(
      z.strictObject({
        institution: z.string(),
        degree: z.string().nullable(),
        year: z.string().nullable(),
      }),
    )
    .max(10),
  total_experience_months: z.number().int().nonnegative().nullable(),
  confidence: z.number().min(0).max(1),
});

export type Resume = z.infer<typeof ResumeSchema>;
