// Ports app/components/panels/Search.tsx. The frame and the first page of
// results render here, on the server; SearchClient runs the filters.
import type { PanelPropsOf } from '../panel.ts';
import { PanelFrame } from './PanelFrame.tsx';
import { SearchClient } from './SearchClient.tsx';
import type { searchFields } from './search.fields.ts';
import type { SearchLoaded } from './search.load.ts';

export default function Search({ data, loaded, panel }: PanelPropsOf<typeof searchFields, SearchLoaded>) {
  return (
    <PanelFrame name="search" data={data} panel={panel}>
      <SearchClient
        endpoint={loaded.endpoint}
        pageId={loaded.pageId}
        panelId={loaded.panelId}
        form={loaded.form}
        initial={loaded.initial}
        perRow={data.perRow}
        label={data.title || 'Search'}
      />
    </PanelFrame>
  );
}
