import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApp } from '../src/index.ts';
import { readOwnerAppOrigins } from '../src/http/owner-cors.ts';

const origin='https://owner.example.test';
const preflight=(from=origin,method='PATCH',headers='authorization,content-type'):RequestInit=>({method:'OPTIONS',headers:{Origin:from,'Access-Control-Request-Method':method,'Access-Control-Request-Headers':headers}});

describe('owner-only CORS',()=>{
  it('answers allowed browser preflight before owner authentication and reflects only the exact origin',async()=>{
    const {app}=createApp({ownerAppOrigins:[origin]});
    const response=await app.request('/v1/owner/content/drafts/fixture',preflight());
    assert.equal(response.status,204);
    assert.equal(response.headers.get('access-control-allow-origin'),origin);
    assert.match(response.headers.get('access-control-allow-methods') ?? '',/PATCH/);
    assert.match(response.headers.get('access-control-allow-headers')?.toLowerCase() ?? '',/authorization/);
    assert.match(response.headers.get('vary') ?? '',/Origin/);
    assert.equal(response.headers.get('access-control-allow-credentials'),null);
  });
  it('allows PUT for the business replacements (prices, hours, area)',async()=>{
    const {app}=createApp({ownerAppOrigins:[origin]});
    const response=await app.request('/v1/owner/business/prices',preflight(origin,'PUT'));
    assert.equal(response.status,204);
    assert.match(response.headers.get('access-control-allow-methods') ?? '',/PUT/);
  });
  it('allows DELETE for unlinking a Facebook Page or Instagram account',async()=>{
    const {app}=createApp({ownerAppOrigins:[origin]});
    const response=await app.request('/v1/owner/linked-accounts/a0000000-0000-4000-8000-000000000001',preflight(origin,'DELETE'));
    assert.equal(response.status,204);
    assert.match(response.headers.get('access-control-allow-methods') ?? '',/DELETE/);
  });
  it('rejects unlisted origins, methods, and headers without a permissive origin response',async()=>{
    const {app}=createApp({ownerAppOrigins:[origin]});
    for(const request of [preflight('https://owner.example.test.attacker.test'),preflight(origin,'TRACE'),preflight(origin,'POST','authorization,x-zukki-key')]) {
      const response=await app.request('/v1/owner/content/drafts',request);
      assert.equal(response.status,403);
      assert.equal(response.headers.get('access-control-allow-origin'),null);
    }
  });
  it('preserves CORS headers on owner errors and leaves internal/webhook routes without CORS',async()=>{
    const {app}=createApp({ownerAppOrigins:[origin]});
    const owner=await app.request('/v1/owner/content/drafts',{headers:{Origin:origin}});
    assert.equal(owner.status,503);
    assert.equal(owner.headers.get('access-control-allow-origin'),origin);
    for(const path of ['/v1/internal/jobs','/webhooks/whatsapp','/health']) {
      const response=await app.request(path,preflight());
      assert.equal(response.headers.get('access-control-allow-origin'),null,path);
    }
  });
  it('defaults to no cross-origin access while native/server requests keep their existing authentication behavior',async()=>{
    const {app}=createApp();
    const blocked=await app.request('/v1/owner/content/drafts',preflight());
    assert.equal(blocked.status,403);
    const native=await app.request('/v1/owner/content/drafts');
    assert.equal(native.status,503);
    assert.equal(native.headers.get('access-control-allow-origin'),null);
  });
  it('reads exact secure origins and rejects wildcard, opaque, and path-valued configuration',()=>{
    assert.deepEqual(readOwnerAppOrigins(undefined),[]);
    assert.deepEqual(readOwnerAppOrigins('https://owner.example.test/, http://localhost:8081, https://owner.example.test'),[origin,'http://localhost:8081']);
    for(const value of ['*','null','https://owner.example.test/path','http://remote.example.test','https://name:secret@owner.example.test']) {
      assert.throws(()=>readOwnerAppOrigins(value),/OWNER_APP_ORIGINS/);
    }
  });
});

it('accepts an explicit public API origin behind TLS termination without trusting forwarded headers', async () => {
  const {app}=createApp({ownerPublicOrigin:'https://api.example.test'});
  const accepted=await app.request('http://internal:3000/v1/owner/offers',preflight('https://api.example.test','GET'));
  assert.equal(accepted.status,204);
  const spoofed=await app.request('http://internal:3000/v1/owner/offers',{
    ...preflight('https://attacker.test','GET'), headers:{...preflight('https://attacker.test','GET').headers,'X-Forwarded-Host':'attacker.test','X-Forwarded-Proto':'https'},
  });
  assert.equal(spoofed.status,403);
});
