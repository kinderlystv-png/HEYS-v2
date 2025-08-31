// heys_error_boundary_v1.js — Error Boundary для React UMD
;(function(global){
  // Всегда инициализируем HEYS namespace и logError функцию
  global.HEYS = global.HEYS || {};
  global.HEYS.logError = function(err, info){
    try { console.error('[HEYS Error]', err, info); } catch(e){}
    // Можно добавить отправку ошибок на сервер
  };

  const React = global.React;
  if (!React) {
    console.log('[Error Boundary] React not found, only logError function available');
    return;
  }
  
  class ErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
      return { hasError: true, error };
    }
    componentDidCatch(error, info) {
      if (window.HEYS && window.HEYS.logError) window.HEYS.logError(error, info);
    }
    render() {
      if (this.state.hasError) {
        return React.createElement('div', { className: 'error-boundary' },
          'Произошла ошибка: ', String(this.state.error)
        );
      }
      return this.props.children;
    }
  }
  global.HEYS.ErrorBoundary = ErrorBoundary;
})(window);
