// Server-side: finds the form before the panel renders. On the live site only
// a published form resolves; in preview, its working copy does.
import type { InferFields } from '../fields.ts';
import type { PublicForm } from '../forms/model.ts';
import type { LoadContext } from '../panel.ts';
import type { formPanelFields } from './form.fields.ts';

export async function loadForm(data: InferFields<typeof formPanelFields>, ctx: LoadContext): Promise<{ form: PublicForm | null; endpoint: string; preview: boolean }> {
  if (!ctx.forms) throw new Error('The Form panel needs loadContext.forms (see createFormResolver).');
  const id = data.form[0];
  const form = id ? await ctx.forms.byId(id) : null;
  return { form, endpoint: ctx.forms.endpoint, preview: ctx.draft };
}

export type FormLoaded = Awaited<ReturnType<typeof loadForm>>;
