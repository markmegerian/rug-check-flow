import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const ACCEPTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

const isSupportedImageFile = (file: File) => {
  if (ACCEPTED_IMAGE_MIME_TYPES.has(file.type.toLowerCase())) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
};

export interface PhotoItem {
  file: File;
  preview: string;
}

interface CheckInPhotoSectionProps {
  photos: PhotoItem[];
  onPhotosChange: (photos: PhotoItem[]) => void;
  maxPhotos?: number;
}

export function CheckInPhotoSection({ photos, onPhotosChange, maxPhotos = 20 }: CheckInPhotoSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const stopCameraStream = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCameraStream();
  }, [stopCameraStream]);

  const appendFiles = useCallback((files: File[]) => {
    const invalidFiles = files.filter((file) => !isSupportedImageFile(file));
    if (invalidFiles.length > 0) {
      toast({
        title: "Unsupported file type",
        description: "Only JPG, PNG, and WEBP photos are supported. HEIC and video files are not allowed.",
        variant: "destructive",
      });
    }

    const validFiles = files.filter((file) => isSupportedImageFile(file));
    const remaining = maxPhotos - photos.length;
    const toAdd = validFiles.slice(0, remaining);
    const newPhotos = toAdd.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    if (validFiles.length > remaining) {
      toast({
        title: "Photo limit reached",
        description: `You can upload up to ${maxPhotos} photos per check-in.`,
        variant: "destructive",
      });
    }

    if (newPhotos.length > 0) {
      onPhotosChange([...photos, ...newPhotos]);
    }
  }, [photos, maxPhotos, onPhotosChange]);

  const openCameraCapture = useCallback(async () => {
    if (!window.isSecureContext) {
      toast({
        title: "Secure context required",
        description: "Camera capture needs HTTPS (or localhost). Use Upload Photo if you are on an insecure URL.",
        variant: "destructive",
      });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraSupported(false);
      toast({
        title: "Camera not supported",
        description: "This device/browser does not support direct camera capture. Use Upload instead.",
        variant: "destructive",
      });
      return;
    }

    setCameraLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 0);
    } catch (error) {
      toast({
        title: "Unable to open camera",
        description: error instanceof Error ? error.message : "Camera permission was denied.",
        variant: "destructive",
      });
    } finally {
      setCameraLoading(false);
    }
  }, []);

  const captureFromCamera = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      toast({ title: "Camera not ready", description: "Wait for camera preview, then try again.", variant: "destructive" });
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      toast({ title: "Capture failed", description: "Could not access camera frame.", variant: "destructive" });
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        toast({ title: "Capture failed", description: "Could not create captured image.", variant: "destructive" });
        return;
      }
      const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      appendFiles([file]);
      setCameraOpen(false);
      stopCameraStream();
    }, "image/jpeg", 0.92);
  }, [appendFiles, stopCameraStream]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    appendFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(photos[index].preview);
    onPhotosChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2 min-h-[12.5rem]">
      <Label>
        Photos{" "}
        <span className="text-muted-foreground font-normal">
          ({photos.length}/{maxPhotos} — min 1)
        </span>
      </Label>
      <div className="rounded-md border border-border bg-background/80 p-3 min-h-[10rem]">
        <div className="flex flex-wrap items-start gap-2">
          {photos.map((photo, i) => (
            <div
              key={i}
              className="relative w-16 h-16 md:w-20 md:h-20 rounded-md overflow-hidden border border-border group"
            >
              <img
                src={photo.preview}
                alt={`Photo ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-1 md:p-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3.5 w-3.5 md:h-3 md:w-3" />
              </button>
            </div>
          ))}
          {photos.length < maxPhotos && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 md:w-20 md:h-20 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors shrink-0"
                title="Upload photo"
              >
                <Camera className="h-5 w-5" />
              </button>
              <Button type="button" variant="outline" size="sm" className="h-8 min-w-[8.5rem]" onClick={() => void openCameraCapture()} disabled={cameraLoading || !cameraSupported}>
                {cameraLoading ? "Opening camera…" : "Use Camera"}
              </Button>
            </>
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
      <Dialog open={cameraOpen} onOpenChange={(open) => { setCameraOpen(open); if (!open) stopCameraStream(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Capture check-in photo</DialogTitle>
            <DialogDescription>Use attached webcam or mobile camera to capture a photo now.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-black/80 overflow-hidden">
            <video ref={videoRef} className="w-full h-auto" playsInline muted />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setCameraOpen(false); stopCameraStream(); }}>Cancel</Button>
            <Button type="button" onClick={captureFromCamera}>Capture Photo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
