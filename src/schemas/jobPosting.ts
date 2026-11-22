import { z } from 'zod';

export const JobPostingSchema = z.strictObject({
  title: z.string().min(1),
  company: z.string().nullable(),
  location: z.string().nullable(),
  remote: z.boolean(),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'internship', 'unknown']),
  seniority: z.enum(['junior', 'mid', 'senior', 'lead', 'unknown']),
  required_skills: z.array(z.string().min(1)).max(40),
  preferred_skills: z.array(z.string().min(1)).max(40),
  min_years_experience: z.number().int().nonnegative().nullable(),
  responsibilities: z.array(z.string()).max(30),
  salary_min: z.number().nonnegative().nullable(),
  salary_max: z.number().nonnegative().nullable(),
  currency: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type JobPosting = z.infer<typeof JobPostingSchema>;
