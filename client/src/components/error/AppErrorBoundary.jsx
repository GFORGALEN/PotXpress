import { Component } from 'react';
import { generateErrorId } from '../../utils/errorId.js';
import { ErrorFallback } from './ErrorFallback.jsx';

/**
 * 应用级 ErrorBoundary — 最外层兜底。
 *
 * 不依赖任何 Context / Provider / Router，因为它自身就是最外层。
 * 当 AppLayout、路由、Context 等任何顶层组件崩溃时触发。
 * 只提供「刷新页面」这一个恢复手段。
 */
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorId: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true, errorId: generateErrorId() };
  }

  componentDidCatch(error, info) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('potxpress:fatal-error', {
          detail: { errorId: this.state.errorId, error, info },
        }),
      );
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          level="app"
          errorId={this.state.errorId}
        />
      );
    }

    return this.props.children;
  }
}
