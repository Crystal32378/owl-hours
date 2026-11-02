import type { MiddlewareHandler } from 'hono';
import { errorResponse, HttpError } from './respond.ts';

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
const HEADERS = ['authorization', 'content-type'];

// Startup-only configuration; do not accept arbitrary request origins or wildcard hosts.
export function readOwnerAppOrigins(value:string|undefined):string[] {
  if(!value?.trim())return [];
  const origins=value.split(',').map(entry=>{
    try {
      const url=new URL(entry.trim());
      const safeProtocol=url.protocol==='https:' || (url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname));
      if(!safeProtocol || url.username || url.password || url.pathname!=='/' || url.search || url.hash || url.origin==='null')throw new Error();
      return url.origin;
    } catch {throw new Error('OWNER_APP_ORIGINS must contain comma-separated exact HTTPS origins (localhost HTTP is allowed).');}
  });
  return [...new Set(origins)];
}

export function ownerCors(origins:readonly string[], publicOrigin?:string):MiddlewareHandler {
  const allowed=new Set(readOwnerAppOrigins(origins.join(',')));
  if(publicOrigin) {
    const configured=readOwnerAppOrigins(publicOrigin);
    if(configured.length!==1)throw new Error('OWNER_PUBLIC_ORIGIN must be a single exact HTTPS origin.');
    allowed.add(configured[0]!);
  }
  return async(c,next)=>{
    c.header('Vary','Origin',{append:true});
    const origin=c.req.header('Origin');
    // Native/server clients authenticate using their bearer token and send no Origin.
    if(!origin){await next();return;}
    const sameOrigin=origin===new URL(c.req.url).origin;
    if(!sameOrigin && !allowed.has(origin)) {
      return errorResponse(c,new HttpError(403,'origin_not_allowed','This owner app origin is not allowed.'));
    }
    if(c.req.method==='OPTIONS') {
      c.header('Vary','Access-Control-Request-Method, Access-Control-Request-Headers',{append:true});
      const method=c.req.header('Access-Control-Request-Method');
      const headers=(c.req.header('Access-Control-Request-Headers') ?? '').split(',').map(header=>header.trim().toLowerCase()).filter(Boolean);
      if(!method || !METHODS.includes(method) || headers.some(header=>!HEADERS.includes(header))) {
        return errorResponse(c,new HttpError(403,'cors_request_not_allowed','This browser request is not allowed.'));
      }
      c.header('Access-Control-Allow-Origin',origin);
      c.header('Access-Control-Allow-Methods',METHODS.join(', '));
      c.header('Access-Control-Allow-Headers','Authorization, Content-Type');
      c.header('Access-Control-Max-Age','600');
      return c.body(null,204);
    }
    c.header('Access-Control-Allow-Origin',origin);
    await next();
  };
}
