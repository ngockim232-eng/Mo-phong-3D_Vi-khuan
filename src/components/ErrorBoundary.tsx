import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let friendly = 'Đã xảy ra sự cố khi kết nối dữ liệu thi đua. Vui lòng thử tải lại.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string };
      if (parsed?.error) {
        if (parsed.error.includes('Quota exceeded')) {
          friendly =
            'Hệ thống lưu trữ tạm thời đạt giới hạn truy cập trong ngày (sẽ tự động làm mới vào ngày mai).';
        } else if (parsed.error.includes('permission') || parsed.error.includes('PERMISSION_DENIED')) {
          friendly =
            'Thao tác bị từ chối quyền truy cập. Học sinh hãy chọn đúng Lớp và Họ tên trong danh sách lớp; quản lý lớp chỉ dành cho tài khoản Giáo viên đã đăng nhập.';
        }
      }
    } catch {
      if (error.message) {
        friendly = error.message;
      }
    }
    return { hasError: true, message: friendly };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto my-12 max-w-xl rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Không thể hoàn tất thao tác</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-800"
          >
            <RotateCcw className="h-4 w-4" />
            Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
