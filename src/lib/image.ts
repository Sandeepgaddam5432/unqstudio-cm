/** Downscale large images so multimodal payloads stay small. Returns a data URL (JPEG unless PNG/WebP transparency matters). */
export async function downscaleImage(dataUrl: string, maxDim = 1568): Promise<string> {
  if (typeof Image === 'undefined') return dataUrl
  const img = new Image()
  img.src = dataUrl
  try { await img.decode() } catch { return dataUrl }
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  if (scale >= 1 && dataUrl.length < 1_500_000) return dataUrl
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * scale)
  c.height = Math.round(img.naturalHeight * scale)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL(/^data:image\/png/.test(dataUrl) ? 'image/png' : 'image/jpeg', 0.88)
}
export const ACCEPTED_IMAGE = /^image\/(png|jpe?g|webp)$/
