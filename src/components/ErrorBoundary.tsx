import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error boundary', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  private handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 px-6 py-10 text-center bg-gray-50 dark:bg-gray-900">
        <p className="text-lg font-extrabold text-gray-900 dark:text-white">Не удалось открыть экран</p>
        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-xs">
          Ошибка в одном из блоков не должна ронять всё приложение. Обновите страницу или вернитесь назад.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="mt-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white active:scale-95 transition-transform"
        >
          Обновить
        </button>
      </div>
    );
  }
}
