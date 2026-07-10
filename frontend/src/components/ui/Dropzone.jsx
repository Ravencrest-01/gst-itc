import React, { useCallback, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

export function Dropzone({ label, accept, file, onFile, className }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFile(e.dataTransfer.files[0]);
    }
  }, [onFile]);

  const handleChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFile(e.target.files[0]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={cn("w-full", className)}>
      {file ? (
        <div className="flex items-center justify-between p-4 border border-accent bg-accent/5 rounded-radius">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="material-symbols-outlined text-accent text-3xl">description</span>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-foreground truncate" title={file.name}>{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => onFile(null)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Remove file"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-radius cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isDragging ? "border-accent bg-accent/5" : "border-border hover:bg-muted/50 bg-card"
          )}
        >
          <input 
            type="file" 
            ref={inputRef}
            className="hidden"
            accept={accept}
            onChange={handleChange}
          />
          <span className="material-symbols-outlined text-4xl text-muted-foreground mb-3">upload_file</span>
          <p className="text-sm font-medium text-foreground mb-1">{label}</p>
          <p className="text-xs text-muted-foreground">Drag and drop or click to choose</p>
          {accept && <p className="text-xs text-muted-foreground mt-2">Accepts: {accept}</p>}
        </div>
      )}
    </div>
  );
}
