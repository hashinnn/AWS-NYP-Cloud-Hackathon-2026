/**
 * UC-017 E2 / UC-018 E2 — a chart that fails to render must never leave a
 * blank panel. It falls back to the plainest possible view of the same
 * information.
 */

import { Component } from 'react';

export default class ChartBoundary extends Component<
  { children: any; fallback: any },
  { failed: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: any) {
    console.warn('chart render failed, using fallback', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
