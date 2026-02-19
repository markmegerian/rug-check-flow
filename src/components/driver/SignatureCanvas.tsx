import React, { useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface SignatureCanvasProps {
  onSignatureChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  initialDataUrl?: string;
}

const SignatureCanvas: React.FC<SignatureCanvasProps> = ({ onSignatureChange, disabled = false, initialDataUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const hasContentRef = useRef(false);

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = "hsl(var(--foreground))";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
    return ctx;
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }, []);

  useEffect(() => {
    resizeCanvas();
    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const rect = canvas.getBoundingClientRect();
        if (ctx) ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = initialDataUrl;
    }
  }, [initialDataUrl, resizeCanvas]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    isDrawingRef.current = true;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || disabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasContentRef.current = true;
  };

  const onPointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (hasContentRef.current && canvasRef.current) {
      onSignatureChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
    }
    hasContentRef.current = false;
    onSignatureChange(null);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Signature</p>
      <canvas
        ref={canvasRef}
        className="w-full h-[150px] rounded-md border border-input bg-background touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          Clear
        </Button>
      )}
    </div>
  );
};

export default SignatureCanvas;
