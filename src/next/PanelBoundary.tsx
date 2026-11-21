'use client';
/**
 * Keeps one panel's failure from taking the page down: <Panels> wraps every
 * panel in this boundary. A panel that throws while rendering, on the server
 * or in the browser, is replaced by nothing for visitors, or by a short note
 * in draft preview and development, so editors can see which panel broke.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface PanelBoundaryProps {
  /** The panel type, e.g. `cera/text`. */
  type: string;
  /** The panel type's label, e.g. "Text", for the note. */
  label: string;
  /** Show a note in place of the failed panel (preview and development) instead of nothing. */
  showError: boolean;
  children: ReactNode;
}

export class PanelBoundary extends Component<PanelBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`cera: panel ${this.props.type} failed to render`, error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    if (!this.props.showError) return null;
    return (
      <div className="cera-panel-error" role="note" data-panel-type={this.props.type}>
        The {this.props.label} panel couldn’t be shown. Visitors see the page without it.
      </div>
    );
  }
}
