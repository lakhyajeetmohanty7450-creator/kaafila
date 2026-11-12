import { useRef, useState } from 'react';
import { Upload, Image as ImageIcon, Loader2 } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

export default function ImageUploadField({
  label,
  value = '',
  onChange,
  placeholder = 'https://... or upload an image',
  aspect = 'wide',
  helperText = 'JPEG, PNG or WebP up to 2 MB.',
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const { showToast } = useToast();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('Please select a JPEG, PNG, or WebP image.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image must be 2 MB or smaller.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('image', file);

    setUploading(true);
    try {
      const { data } = await api.post('/uploads/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data?.data?.url) {
        onChange(data.data.url);
        showToast('Image uploaded.', 'success');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Image upload failed.', 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wider text-kaafila-muted">
          {label}
        </label>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          className={`relative shrink-0 overflow-hidden rounded-xl border border-kaafila-primary/25 bg-kaafila-bg ${
            aspect === 'square' ? 'h-20 w-20' : 'h-20 w-36'
          }`}
        >
          {value ? (
            <img src={value} alt={label || 'Preview'} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-kaafila-muted">
              <ImageIcon className="h-6 w-6 opacity-50" />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg border border-kaafila-primary/40 bg-kaafila-primary/10 px-3 py-1.5 text-xs font-semibold text-kaafila-accent hover:bg-kaafila-primary/20 transition disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              <span>{uploading ? 'Uploading...' : 'Upload Image'}</span>
            </button>
            <span className="text-[11px] text-kaafila-muted">{helperText}</span>
          </div>

          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-xl border border-kaafila-border bg-kaafila-bg px-3 py-2 text-xs text-kaafila-text outline-none focus:border-kaafila-primary"
          />
        </div>
      </div>
    </div>
  );
}

