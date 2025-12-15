import { useEffect, useState } from 'preact/hooks';
import './Toast.css';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type ToastProps = {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose?: () => void;
};

const Toast = ({ message, type = 'info', duration = 3000, onClose }: ToastProps) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        onClose && onClose();
      }, 300); // 等待动画完成
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  return (
    <div className={`toast toast-${type} ${visible ? 'toast-show' : 'toast-hide'}`}>
      <div className="toast-content">
        <span className="toast-icon">
          {type === 'success' && '✓'}
          {type === 'error' && '✕'}
          {type === 'warning' && '⚠'}
          {type === 'info' && 'ℹ'}
        </span>
        <span className="toast-message">{message}</span>
      </div>
    </div>
  );
};

type ToastContainerProps = {
  toasts: Array<{ id: number; message: string; type?: ToastType }>;
  onRemove: (id: number) => void;
};

export const ToastContainer = ({ toasts, onRemove }: ToastContainerProps) => {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => onRemove(toast.id)} />
      ))}
    </div>
  );
};

// Hook for managing toasts
export const useToast = (): {
  toasts: Array<{ id: number; message: string; type?: ToastType }>;
  showToast: (message: string, type?: ToastType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
  removeToast: (id: number) => void;
} => {
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type?: ToastType }>>([]);

  const showToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  return {
    toasts,
    showToast,
    showSuccess: (message: string) => showToast(message, 'success'),
    showError: (message: string) => showToast(message, 'error'),
    showInfo: (message: string) => showToast(message, 'info'),
    showWarning: (message: string) => showToast(message, 'warning'),
    removeToast,
  };
};

export default Toast;
