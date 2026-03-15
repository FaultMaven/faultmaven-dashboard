import React, { useRef } from 'react';

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  accept?: string;
  label?: string;
  helperText?: string;
}

export function UploadZone({
  onFileSelected,
  accept = '.md,.txt,.json,.csv,.pdf,.doc,.docx',
  label = 'Click to upload or drag and drop',
  helperText = 'Markdown, text, JSON, CSV, PDF, or DOC files (max 10MB)',
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelected(files[0]);
      e.target.value = '';
    }
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="border-2 border-dashed border-fm-border rounded-fm-card p-12 text-center hover:border-fm-accent transition-colors cursor-pointer"
    >
      <svg className="w-12 h-12 text-fm-text-tertiary mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
      <p className="text-fm-text-secondary font-medium mb-1">{label}</p>
      <p className="text-sm text-fm-text-tertiary">{helperText}</p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={handleFileChange}
      />
    </div>
  );
}
