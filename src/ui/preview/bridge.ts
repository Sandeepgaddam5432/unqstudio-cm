let frame: HTMLIFrameElement | null = null
export const setPreviewFrame = (f: HTMLIFrameElement | null) => { frame = f }
export const getPreviewFrame = () => frame

/** Send a message to the preview iframe (defaults to the currently mounted preview). */
export function postToPreview(target: HTMLIFrameElement | null, msg: Record<string, unknown>) {
  ;(target ?? frame)?.contentWindow?.postMessage({ __unq: true, ...msg }, '*')
}
