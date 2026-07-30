import { Component } from 'react';
import { generateErrorId } from '../../utils/errorId.js';
import { ErrorFallback } from './ErrorFallback.jsx';

/**
 * 页面级 ErrorBoundary — 包裹 <Outlet />，只隔离页面内容区。
 *
 * 当某个页面渲染崩溃时：
 * - 侧栏（Sidebar）依然可用，用户可导航到其他页面
 * - 顶栏（TopNavbar）依然可用，退出登录、切换门店等操作不受影响
 * - 只在本边界内展示错误回退 UI，提供「重试」按钮（reset 边界）
 *
 * key 使用 location.pathname + search，确保路由切换时自动重置。
 */
export class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, errorId: generateErrorId() };
  }

  componentDidCatch(error, info) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('potxpress:page-error', {
          detail: {
            errorId: this.state.errorId,
            routeKey: this.props.routeKey,
            error,
            info,
          },
        }),
      );
    }
  }

  componentDidUpdate(prevProps) {
    // 路由切换时自动重置错误状态
    if (this.state.hasError && prevProps.routeKey !== this.props.routeKey) {
      this.setState({ hasError: false, error: null, errorId: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          level="page"
          errorId={this.state.errorId}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}
