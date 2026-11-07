'use server';

import { revalidatePath } from 'next/cache';
import { getActor, AuthzError, toActionError, type ActionResult } from '@/lib/cms/guard';
import { upsertSectionConfig, type SectionConfigInput } from '@/lib/cms/sectionConfigService';

async function actor() {
  const a = await getActor();
  if (!a) throw new AuthzError('unauthenticated');
  return a;
}

export async function updateSectionConfigAction(input: SectionConfigInput): Promise<ActionResult> {
  try {
    await upsertSectionConfig(await actor(), input);
    revalidatePath('/admin/settings/');
    revalidatePath(`/${input.sectionKey}/`);
    revalidatePath('/');
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
