import React from 'react';
import { PowerPointViewer } from 'pptx-react-viewer';
import 'pptx-react-viewer/styles.css';
import { AlertCircle, RotateCcw } from 'lucide-react';

class PptxErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('PPTX Viewer Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 min-h-[400px] bg-slate-950/80 rounded-2xl border border-rose-500/30 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-bold text-white">PowerPoint Rendering Notice</h4>
            <p className="text-xs text-slate-400 max-w-md">
              {this.state.error?.message || 'Unable to render this presentation structure.'}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry Viewer</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const PptxViewerWrapper = ({ content, fileName, className, style }) => {
  if (!content || !(content instanceof Uint8Array || content instanceof ArrayBuffer)) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] text-slate-400 text-sm">
        No PowerPoint presentation data loaded.
      </div>
    );
  }

  const binaryContent = content instanceof ArrayBuffer ? new Uint8Array(content) : content;

  return (
    <PptxErrorBoundary>
      <div 
        className={`w-full h-full min-h-[600px] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl relative flex flex-col ${className || ''}`}
        style={style}
      >
        <PowerPointViewer
          content={binaryContent}
          fileName={fileName || 'presentation.pptx'}
          canEdit={false}
        />
      </div>
    </PptxErrorBoundary>
  );
};
