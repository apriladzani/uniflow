import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const VIEWPORT = 280;
const OUTPUT = 512;

interface Props {
  image: HTMLImageElement;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}

/** 1:1 crop with zoom + drag. Outputs a 512×512 JPEG data URL. */
export const AvatarCropModal: React.FC<Props> = ({ image, onCancel, onConfirm }) => {
  // Scale that makes the shorter side exactly fill the viewport.
  const baseScale = VIEWPORT / Math.min(image.naturalWidth, image.naturalHeight);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const scale = baseScale * zoom;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;

  // Keep the image covering the whole viewport.
  const clamp = (x: number, y: number) => ({
    x: Math.min(0, Math.max(VIEWPORT - width, x)),
    y: Math.min(0, Math.max(VIEWPORT - height, y)),
  });

  useEffect(() => {
    setOffset(clamp((VIEWPORT - width) / 2, (VIEWPORT - height) / 2));
    // Centre once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const changeZoom = (next: number) => {
    // Zoom around the viewport centre.
    const centre = VIEWPORT / 2;
    const ratio = next / zoom;
    const newWidth = image.naturalWidth * baseScale * next;
    const newHeight = image.naturalHeight * baseScale * next;
    const x = centre - (centre - offset.x) * ratio;
    const y = centre - (centre - offset.y) * ratio;
    setZoom(next);
    setOffset({
      x: Math.min(0, Math.max(VIEWPORT - newWidth, x)),
      y: Math.min(0, Math.max(VIEWPORT - newHeight, y)),
    });
  };

  const confirm = () => {
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const context = canvas.getContext('2d');
    if (!context) return;
    const sourceSize = VIEWPORT / scale;
    context.drawImage(image, -offset.x / scale, -offset.y / scale, sourceSize, sourceSize, 0, 0, OUTPUT, OUTPUT);
    onConfirm(canvas.toDataURL('image/jpeg', 0.9));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-crop-title"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') confirm(); }}
        className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-[0_20px_40px_rgb(15_23_42/0.12)] outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="avatar-crop-title" className="text-lg font-bold text-ink">Atur foto profil</h2>
          <button onClick={onCancel} aria-label="Tutup" className="rounded-lg p-1.5 text-subtle hover:bg-chip hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className="relative mx-auto cursor-grab touch-none overflow-hidden rounded-2xl bg-chip active:cursor-grabbing"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setOffset(clamp(drag.current.ox + e.clientX - drag.current.x, drag.current.oy + e.clientY - drag.current.y));
          }}
          onPointerUp={() => { drag.current = null; }}
          onWheel={(e) => changeZoom(Math.min(3, Math.max(1, zoom - e.deltaY * 0.002)))}
        >
          <img
            src={image.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none select-none"
            style={{ width, height, left: offset.x, top: offset.y }}
          />
          {/* Circle guide showing how the avatar will be cropped */}
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgb(15_23_42/0.45)]" />
        </div>

        <label className="mt-5 block text-[13px] font-medium text-muted" htmlFor="avatar-zoom">Zoom</label>
        <input
          id="avatar-zoom"
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => changeZoom(Number(e.target.value))}
          className="mt-1 w-full accent-primary"
        />
        <p className="mt-1 text-[13px] text-muted">Geser foto untuk mengatur posisi.</p>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="h-11 rounded-xl px-4 text-sm font-medium text-muted hover:text-ink">Batal</button>
          <button onClick={confirm} className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-ink hover:bg-primary-hover">
            Gunakan foto
          </button>
        </div>
      </div>
    </div>
  );
};
