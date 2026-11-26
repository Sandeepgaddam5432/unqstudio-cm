// Backward-compatible alias of /api/catalog (kept so older clients and cached bundles keep working).
import { handleCatalog } from './catalog'

type PagesFunction = (ctx: { request: Request }) => Response | Promise<Response>

export const handleModelsDev = handleCatalog
export const onRequest: PagesFunction = ({ request }) => handleCatalog(request)
