import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-5">
          <div className="card text-center" style={{ maxWidth: 420, padding: '40px 30px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{
              fontFamily: 'Sora, sans-serif',
              fontSize: 18,
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: 8,
            }}>
              Нешто не е во ред
            </h2>
            <p style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              marginBottom: 24,
              lineHeight: 1.5,
            }}>
              Настана неочекувана грешка. Обидете се повторно или вратете се на почетната страница.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                className="btn-primary"
                style={{ padding: '10px 24px', fontSize: 14 }}
              >
                Обиди се повторно
              </button>
              <button
                onClick={() => { window.location.href = '/'; }}
                className="btn-ghost"
                style={{ padding: '10px 24px', fontSize: 14 }}
              >
                Почетна
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
