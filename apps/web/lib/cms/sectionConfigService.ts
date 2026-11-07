import 'server-only';
import type { SectionConfig } from '@prisma/client';
import { prisma } from '../db';
import { roleHasPermission } from '../auth/rbac';
import type { Actor } from './guard';
import { audit } from './guard';
import { ServiceError } from './articleService';
import { z } from 'zod';

const need = (a: Actor) => {
  if (!roleHasPermission(a.roles, 'system.config')) throw new ServiceError('forbidden', 'Not permitted (system.config).');
};

const UpdateSchema = z.object({
  sectionKey: z.string().min(1),
  displayName: z.string().max(120).nullable().optional(),
  tagline: z.string().max(300).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  heroImage: z.string().url().max(500).nullable().optional(),
  visible: z.boolean().optional(),
});

export type SectionConfigInput = z.infer<typeof UpdateSchema>;

export async function getSectionConfig(sectionKey: string): Promise<SectionConfig | null> {
  return prisma.sectionConfig.findUnique({ where: { sectionKey } });
}

export async function getAllSectionConfigs(): Promise<SectionConfig[]> {
  return prisma.sectionConfig.findMany();
}

export async function upsertSectionConfig(actor: Actor, input: SectionConfigInput): Promise<SectionConfig> {
  need(actor);
  const data = UpdateSchema.parse(input);
  const { sectionKey, ...fields } = data;
  const result = await prisma.sectionConfig.upsert({
    where: { sectionKey },
    create: { sectionKey, ...fields, updatedById: actor.id },
    update: { ...fields, updatedById: actor.id },
  });
  await audit(actor.id, 'section_config.update', 'SectionConfig', result.id, JSON.stringify({ sectionKey }));
  return result;
}
