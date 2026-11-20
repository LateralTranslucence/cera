/**
 * cera/admin — client components for editing pages. Import from a
 * 'use client' file (they take the content type, which holds functions).
 * Styles: import '@lateraltranslucence/cera/admin.css' in the admin layout.
 */
export { PageEditor, type PageEditorProps, type SaveInput } from './PageEditor.tsx';
export { FieldMapForm, IssueList, type FormContext, type PageOption, type PageQuery } from './fields.tsx';
export * from './state.ts';
