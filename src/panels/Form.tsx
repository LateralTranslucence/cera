// Ports app/components/panels/Form.tsx and shared/RenderForm.tsx from the
// theme. The form is drawn on the server and sent from the browser
// (FormClient). Nothing shows when no form is picked or it isn't published.
import type { PanelPropsOf } from '../panel.ts';
import { PanelFrame } from './PanelFrame.tsx';
import { FormClient } from './FormClient.tsx';
import type { formPanelFields } from './form.fields.ts';
import type { FormLoaded } from './form.load.ts';

export default function Form({ data, loaded, panel }: PanelPropsOf<typeof formPanelFields, FormLoaded>) {
  if (!loaded.form) return null;
  return (
    <PanelFrame name="form" data={data} panel={panel}>
      <FormClient form={loaded.form} endpoint={loaded.endpoint} preview={loaded.preview} />
    </PanelFrame>
  );
}
