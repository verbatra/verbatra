import { z } from "zod";
import manifest from "./contributors.json" with { type: "json" };

export const contributorSchema = z.strictObject({
  login: z.string().regex(/^[A-Za-z0-9-]+$/),
  avatarPath: z.string().regex(/^\/contributors\/[A-Za-z0-9-]+\.(png|jpg|webp)$/),
  profileUrl: z.string().regex(/^https:\/\/github\.com\/[A-Za-z0-9-]+$/),
});

export type Contributor = z.infer<typeof contributorSchema>;

export function readContributors(data: unknown): Contributor[] {
  return z.array(contributorSchema).parse(data);
}

export const CONTRIBUTORS: ReadonlyArray<Contributor> = readContributors(manifest);
