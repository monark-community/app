"use client"

import { useCallback, useEffect, useState } from "react"
import Cropper, { type Area } from "react-easy-crop"
import { useTranslations } from "next-intl"
import { ZoomIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"

/**
 * Client-side crop dialog used by the profile section before uploading
 * an avatar (1:1) or a banner (3:1). The user picks the focal point ;
 * server-side `sharp` still resizes / converts to WebP, but receiving
 * an already-cropped image means a square selfie's face doesn't get
 * sliced just because it sat off-centre in the source.
 *
 * The cropped output preserves the source MIME type (or falls back to
 * `image/jpeg` for formats canvas can't re-encode) so the upload action's
 * MIME allow-list keeps working unchanged.
 */
export type ImageCropDialogProps = {
  /** The user-picked source File. The dialog is open while this is non-null. */
  file: File | null
  /**
   * Aspect ratio for the crop area. 1 for avatar (square), 3 for banner
   * (3:1 landscape). The `Cropper` clamps the crop box to this ratio.
   */
  aspect: number
  /** Closes the dialog without uploading. */
  onCancel: () => void
  /** Receives the cropped File ready for upload. */
  onCrop: (cropped: File) => void
  /**
   * Localized title + description shown on the dialog. Allows the same
   * component to phrase itself differently for avatar vs banner without
   * hardcoding strings here.
   */
  title: string
  description?: string
}

const DEFAULT_OUTPUT_WIDTH = 1500

export function ImageCropDialog({
  file,
  aspect,
  onCancel,
  onCrop,
  title,
  description,
}: ImageCropDialogProps) {
  const t = useTranslations("imageCrop")
  const [src, setSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Spin a fresh blob URL each time the file changes ; revoke on unmount /
  // file change so we don't leak object URLs.
  useEffect(() => {
    if (!file) {
      setSrc(null)
      return
    }
    const url = URL.createObjectURL(file)
    setSrc(url)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
    setCroppedArea(null)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels)
  }, [])

  async function onConfirm() {
    if (!file || !src || !croppedArea) return
    setIsProcessing(true)
    try {
      const cropped = await renderCroppedFile({
        sourceUrl: src,
        sourceName: file.name,
        sourceType: file.type,
        crop: croppedArea,
        rotation,
      })
      onCrop(cropped)
    } catch {
      // Surface as a no-op: parent can't tell we failed mid-crop, but
      // since `onCrop` was never called the upload path stays idle and
      // the user can pick another file.
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="relative aspect-[3/2] w-full overflow-hidden rounded-md bg-muted">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              showGrid
              cropShape={aspect === 1 ? "round" : "rect"}
              objectFit={aspect >= 2 ? "horizontal-cover" : "contain"}
            />
          )}
        </div>

        <div className="flex items-center gap-3 px-1">
          <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <Slider
            value={[zoom]}
            onValueChange={(value) => setZoom(value[0] ?? 1)}
            min={1}
            max={4}
            step={0.05}
            aria-label={t("zoomAria")}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isProcessing}
          >
            {t("cancel")}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isProcessing || !croppedArea}>
            {isProcessing ? t("processing") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type RenderInput = {
  sourceUrl: string
  sourceName: string
  sourceType: string
  crop: Area
  rotation: number
}

/**
 * Loads the source URL into an Image, draws the cropped + rotated region
 * into a canvas, and exports it as a File. Output width is capped at
 * 1500px so absurdly large source images don't ship oversized blobs to
 * the server (which already re-resizes via sharp). Output type prefers
 * the source MIME ; falls back to JPEG when canvas can't encode it.
 */
async function renderCroppedFile(input: RenderInput): Promise<File> {
  const image = await loadImage(input.sourceUrl)
  const radians = (input.rotation * Math.PI) / 180

  // Bounding box of the rotated image so we can paint the source fully
  // before clipping out the crop area. This matches react-easy-crop's
  // own coordinate space.
  const { width: bboxWidth, height: bboxHeight } = rotatedBoundingBox({
    width: image.naturalWidth,
    height: image.naturalHeight,
    rotation: radians,
  })

  const stage = document.createElement("canvas")
  stage.width = bboxWidth
  stage.height = bboxHeight
  const ctx = stage.getContext("2d")
  if (!ctx) throw new Error("canvas 2d context unavailable")
  ctx.translate(bboxWidth / 2, bboxHeight / 2)
  ctx.rotate(radians)
  ctx.translate(-image.naturalWidth / 2, -image.naturalHeight / 2)
  ctx.drawImage(image, 0, 0)

  // Scale the cropped slice to a sane output width so we don't ship a
  // 6000px-wide blob from a phone photo.
  const cropAspect = input.crop.width / input.crop.height
  const outputWidth = Math.min(input.crop.width, DEFAULT_OUTPUT_WIDTH)
  const outputHeight = Math.round(outputWidth / cropAspect)

  const out = document.createElement("canvas")
  out.width = outputWidth
  out.height = outputHeight
  const outCtx = out.getContext("2d")
  if (!outCtx) throw new Error("canvas 2d context unavailable")
  outCtx.drawImage(
    stage,
    input.crop.x,
    input.crop.y,
    input.crop.width,
    input.crop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  )

  const outputType = preferredOutputType(input.sourceType)
  const blob = await canvasToBlob(out, outputType)
  const fileName = renameForOutput(input.sourceName, outputType)
  return new File([blob], fileName, { type: outputType })
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener("load", () => resolve(image))
    image.addEventListener("error", () => reject(new Error("image load failed")))
    image.src = url
  })
}

function rotatedBoundingBox({
  width,
  height,
  rotation,
}: {
  width: number
  height: number
  rotation: number
}): { width: number; height: number } {
  const sin = Math.abs(Math.sin(rotation))
  const cos = Math.abs(Math.cos(rotation))
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  }
}

function preferredOutputType(sourceType: string): string {
  // The server's MIME allow-list is jpeg / png / webp ; respect the source
  // when it falls inside that set, otherwise default to jpeg (canvas always
  // supports it and bypasses any HEIC / GIF surprises).
  if (sourceType === "image/png" || sourceType === "image/webp") return sourceType
  return "image/jpeg"
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("canvas toBlob returned null"))
      },
      type,
      0.92,
    )
  })
}

function renameForOutput(originalName: string, outputType: string): string {
  const baseName = originalName.replace(/\.[^./\\]+$/, "") || "image"
  const ext = outputType === "image/png" ? "png" : outputType === "image/webp" ? "webp" : "jpg"
  return `${baseName}-cropped.${ext}`
}
