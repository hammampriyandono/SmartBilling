import {HttpError} from './http-input.js';

// Reviewed read endpoints only. New endpoints remain closed until reviewed;
// GET alone is not a guarantee that a future handler has no side effects.
const id='[0-9a-fA-F-]{36}';
const reads=[
  /^\/(rooms|meters|facilities|usage-sessions)\/?$/,
  new RegExp(`^/meters/${id}/(latest|readings|daily)/?$`),
  new RegExp(`^/usage-sessions/${id}/?$`),
  /^\/owner\/(properties|rooms|tenants|occupancies|rfid-cards|facilities|devices|meter-assets|meter-installations|readers|hardware-readiness|rfid-readiness|rfid-devices|meter-comparison|device-health|tariff-schedules|billing-periods|bill-shares|token-purchases|monthly-token-summary|token-energy-estimate)\/?$/,
  /^\/owner\/reports\/billing\/?$/,
  new RegExp(`^/owner/billing-periods/${id}(/observed-usage)?/?$`),
  new RegExp(`^/owner/token-purchases/${id}/revisions/?$`),
  new RegExp(`^/owner/rooms/${id}/relay/?$`),
];

export async function viewerGrant(pool,userId) {
  return (await pool.query(`SELECT v.owner_id,v.expires_at FROM owner_viewers v
    JOIN users o ON o.id=v.owner_id AND o.role='owner' AND o.is_active
    WHERE v.user_id=$1 AND v.revoked_at IS NULL AND v.expires_at>now()`,[userId])).rows[0];
}

// Mounted once before ALL business routers, after authentication. The actual
// session identity stays in req.actor and /auth/me; only approved reads use the
// existing owner-scoped queries. No request parameter selects this scope.
export function ownerViewerAccess(req,_res,next) {
  if(req.user?.role!=='viewer')return next();
  if(!req.viewerGrant)return next(new HttpError(403,'viewer_access_expired'));
  if(!['GET','HEAD'].includes(req.method)||!reads.some(pattern=>pattern.test(req.path)))
    return next(new HttpError(403,'viewer_read_only'));
  req.actor=req.user;
  req.user={...req.user,id:req.viewerGrant.owner_id,role:'owner',read_only:true};
  next();
}
