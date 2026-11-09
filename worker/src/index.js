const DISCORD_API = "https://discord.com/api/v10";
const SESSION_COOKIE = "vanta_session";
const STATE_COOKIE = "vanta_oauth_state";
const SESSION_SECONDS = 60 * 60 * 8;
const ROLE_PERMISSIONS = {
  "Executives": ["*"], "Co-Executives": ["management"],
  "Operations Team": ["operations"], "Operations Lead": ["operations"], "Operations": ["operations"],
  "Trial Operations": ["operations_limited"], "Sales Team": ["sales","orders:create","orders:view","customers:view"],
  "Senior Sales Associate": ["sales","orders:create","orders:view","customers:view"], "Sales Associate": ["sales","orders:create","orders:view","customers:view"],
  "Support Team": ["support"], "Senior Support Agent": ["support"], "Support Agent": ["support"],
  "Trial Agent": ["support_limited"], "Creative Team": ["creative"],
  "Clothing Designer": ["orders:clothing"], "Livery Designer": ["orders:livery"],
  "Graphics Designer": ["orders:graphics"], "Official Partner": ["customer"], "Pixel+": ["customer"],
  "Customer": ["customer"], "Pixel Member": ["customer"], "Subscribed User": ["customer"]
};
const BLOCKED_ROLE_NAMES = new Set(["Wick","Server Automation","Quarantine","News","Order Status","Careers","Releases","Verified","Bloxlink","Melonly","Unverified","GMRP Central"]);
const ORDER_STATUSES = ["Awaiting Payment","Paid","In Progress","Awaiting Customer Review","Revision Requested","Completed","Cancelled"];
const ALL_PERMISSIONS = ["orders:view","orders:create","orders:update","orders:assign","customers:view","customers:manage","roles:view","roles:manage","support:manage","sales","creative","operations","management"];
const DEFAULT_ROLES = [
  ["role-owner","Owner","#e7b85c",["*"]],
  ["role-executive","Executive","#b88cff",["management","orders:view","orders:create","orders:update","orders:assign","customers:view","customers:manage","roles:view","roles:manage","support:manage","sales","creative","operations"]],
  ["role-management","Management","#8b9cff",["management","orders:view","orders:create","orders:update","orders:assign","customers:view","customers:manage","roles:view","support:manage","sales","creative","operations"]],
  ["role-operations","Operations","#56b6d9",["operations","orders:view","orders:update","orders:assign","customers:view"]],
  ["role-sales","Sales","#5dc99b",["sales","orders:view","orders:create","customers:view"]],
  ["role-support","Support","#e3a45e",["support:manage","orders:view","customers:view"]],
  ["role-designer","Designer","#bd8ee8",["creative","orders:view","orders:update"]],
  ["role-customer","Customer","#8794a8",["customer"]]
];
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}})}
function cookie(name,value,maxAge){return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`}
function clearCookie(name){return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`}
function b64url(bytes){let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
function fromB64url(value){const base64=value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4);return Uint8Array.from(atob(base64),c=>c.charCodeAt(0))}
async function hmac(value,secret){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)))}
async function sign(value,secret){return `${b64url(new TextEncoder().encode(value))}.${b64url(await hmac(value,secret))}`}
async function verify(token,secret){if(!token||!token.includes("."))return null;const [encoded,signature]=token.split(".");try{const value=new TextDecoder().decode(fromB64url(encoded));const actual=fromB64url(signature);const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);return await crypto.subtle.verify("HMAC",key,actual,new TextEncoder().encode(value))?value:null}catch{return null}}
function getCookie(request,name){const header=request.headers.get("cookie")||"";const match=header.split(";").map(v=>v.trim()).find(v=>v.startsWith(name+"="));return match?match.slice(name.length+1):""}
function allowedOrigin(request,env){const origin=request.headers.get("Origin")||new URL(request.url).origin;return origin===env.APP_ORIGIN?origin:""}
function corsHeaders(origin){return {"access-control-allow-origin":origin,"access-control-allow-credentials":"true","access-control-allow-methods":"GET,POST,PATCH,DELETE,OPTIONS","access-control-allow-headers":"Content-Type","vary":"Origin"}}
async function discordFetch(path,token){return fetch(DISCORD_API+path,{headers:{Authorization:token}})}
async function getVantaMember(userId,env){
 const [mr,rr]=await Promise.all([discordFetch(`/guilds/${env.VANTA_GUILD_ID}/members/${userId}`,`Bot ${env.DISCORD_BOT_TOKEN}`),discordFetch(`/guilds/${env.VANTA_GUILD_ID}/roles`,`Bot ${env.DISCORD_BOT_TOKEN}`)]);
 if(mr.status===404)return null;if(!mr.ok||!rr.ok)throw new Error(`Discord membership verification failed (member: ${mr.status}, roles: ${rr.status})`);
 const member=await mr.json(),roles=await rr.json(),roleNames=roles.filter(r=>member.roles.includes(r.id)).map(r=>r.name),permissions=new Set();
 for(const name of roleNames){if(!BLOCKED_ROLE_NAMES.has(name))for(const p of ROLE_PERMISSIONS[name]||[])permissions.add(p)}
 return {roleNames,permissions:[...permissions]};
}
function has(perms,p){return perms.includes("*")||perms.includes(p)}
function canManageRoles(perms){return has(perms,"roles:manage")||has(perms,"management")}
function canSeeCustomers(perms){return has(perms,"customers:view")||has(perms,"customers:manage")||has(perms,"orders:create")||canManageRoles(perms)}
async function getSession(request,env){
 const raw=await verify(getCookie(request,SESSION_COOKIE),env.SESSION_SECRET);if(!raw)return null;
 try{const s=JSON.parse(raw);return s.exp>Date.now()/1000?s:null}catch{return null}
}
async function getAccess(userId,env){
 const member=await getVantaMember(userId,env);if(!member)return null;
 const rows=await env.DB.prepare("SELECT r.id,r.name,r.color,r.permissions_json FROM vanta_roles r JOIN account_vanta_roles a ON a.role_id=r.id WHERE a.discord_id=?").bind(userId).all();
 const vantaRoles=(rows.results||[]).map(r=>({id:r.id,name:r.name,color:r.color,permissions:JSON.parse(r.permissions_json||"[]")}));
 const permissions=new Set(member.permissions);for(const role of vantaRoles)for(const p of role.permissions)permissions.add(p);
 return {discordRoles:member.roleNames,vantaRoles,permissions:[...permissions]};
}
function requirePermission(perms,p){return has(perms,p)}
async function recordEvent(env,orderId,actor,type,details){await env.DB.prepare("INSERT INTO order_events(id,order_id,actor_discord_id,event_type,details,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),orderId,actor,type,details||"",new Date().toISOString()).run()}
async function handleApi(request,env,url,origin,session){
 const headers=corsHeaders(origin),path=url.pathname,method=request.method;
 if(!session)return json({error:"Sign in required"},401,headers);
 const access=await getAccess(session.id,env);if(!access)return json({error:"VANTA membership required"},403,headers);
 const perms=access.permissions;
 if(path==="/api/me"&&method==="GET")return json({authenticated:true,user:{id:session.id,username:session.username,displayName:session.global_name,avatar:session.avatar},roles:access.discordRoles,discordRoles:access.discordRoles,vantaRoles:access.vantaRoles,permissions:perms},200,headers);
 if(path==="/api/staff"&&method==="GET"){
  if(!has(perms,"orders:assign"))return json({error:"You cannot assign orders"},403,headers);
  const roleResponse=await discordFetch(`/guilds/${env.VANTA_GUILD_ID}/roles`,`Bot ${env.DISCORD_BOT_TOKEN}`);
  if(!roleResponse.ok)return json({error:"Discord role directory unavailable"},502,headers);
  const roles=await roleResponse.json(),roleMap=new Map(roles.map(role=>[role.id,role.name])),members=[];
  let after="";
  for(let page=0;page<10;page++){
   const suffix=after?`&after=${after}`:"";
   const response=await discordFetch(`/guilds/${env.VANTA_GUILD_ID}/members?limit=1000${suffix}`,`Bot ${env.DISCORD_BOT_TOKEN}`);
   if(!response.ok)return json({error:"Discord member directory unavailable"},502,headers);
   const batch=await response.json();
   for(const member of batch){
    const roleNames=(member.roles||[]).map(id=>roleMap.get(id)).filter(Boolean);
    const memberPermissions=new Set();
    for(const roleName of roleNames){if(!BLOCKED_ROLE_NAMES.has(roleName))for(const permission of ROLE_PERMISSIONS[roleName]||[])memberPermissions.add(permission)}
    if(memberPermissions.has("*")||memberPermissions.has("orders:update")||memberPermissions.has("orders:assign")||memberPermissions.has("creative")||memberPermissions.has("support")){
     members.push({discord_id:member.user.id,username:member.user.username,display_name:member.user.global_name||member.user.username,role_names:roleNames});
    }
   }
   if(batch.length<1000)break;
   after=batch[batch.length-1]?.user?.id||"";
   if(!after)break;
  }
  return json({staff:members},200,headers);
 }
 if(path==="/api/command-logs"&&method==="GET"){
  if(!canManageRoles(perms))return json({error:"Management access required"},403,headers);
  const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit"))||50));
  const rows=await env.DB.prepare("SELECT id,discord_id,username,display_name,command_name,subcommand,guild_id,created_at FROM command_logs ORDER BY created_at DESC LIMIT ?").bind(limit).all();
  return json({logs:rows.results||[]},200,headers);
 }
 if(path==="/api/orders"&&method==="GET"){
  if(!has(perms,"orders:view")&&!has(perms,"customer"))return json({error:"You cannot view orders"},403,headers);
  const own=!canSeeCustomers(perms)&&!has(perms,"orders:view");
  const rows=own?await env.DB.prepare("SELECT o.*,a.username customer_username,a.display_name customer_name FROM orders o LEFT JOIN accounts a ON a.discord_id=o.customer_discord_id WHERE o.customer_discord_id=? ORDER BY o.created_at DESC").bind(session.id).all():await env.DB.prepare("SELECT o.*,a.username customer_username,a.display_name customer_name FROM orders o LEFT JOIN accounts a ON a.discord_id=o.customer_discord_id ORDER BY o.created_at DESC").all();
  return json({orders:rows.results||[],statuses:ORDER_STATUSES},200,headers);
 }
 if(path==="/api/orders"&&method==="POST"){
  if(!has(perms,"orders:create"))return json({error:"You do not have permission to create orders"},403,headers);
  const b=await request.json(),customer=String(b.customerDiscordId||"").trim(),title=String(b.title||"").trim();
  if(!customer||!title)return json({error:"Customer and order title are required"},400,headers);
  const exists=await env.DB.prepare("SELECT discord_id FROM accounts WHERE discord_id=?").bind(customer).first();if(!exists)return json({error:"Customer must sign in to VANTA Central first"},404,headers);
  const id="VNT-"+crypto.randomUUID().slice(0,8).toUpperCase(),now=new Date().toISOString();
  await env.DB.prepare("INSERT INTO orders(id,customer_discord_id,title,service,package,quantity,price_robux,status,assigned_to,requirements,internal_notes,payment_status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,customer,title,String(b.service||"Other"),String(b.package||"Custom"),Math.max(1,Number(b.quantity)||1),Math.max(0,Number(b.priceRobux)||0),String(b.status||"Awaiting Payment"),String(b.assignedTo||""),String(b.requirements||""),String(b.internalNotes||""),String(b.paymentStatus||"Unpaid"),session.id,now,now).run();
  if(Array.isArray(b.assignedStaffIds)&&has(perms,"orders:assign")){
   const ids=[...new Set(b.assignedStaffIds.map(String))].slice(0,20);
   for(const staffId of ids){const member=await getAccess(staffId,env);if(!member||(!has(member.permissions,"orders:update")&&!has(member.permissions,"orders:assign")))return json({error:"Every assignee must be an order-handling VANTA staff member"},400,headers)}
   for(const staffId of ids)await env.DB.prepare("INSERT INTO order_assignments(order_id,discord_id,assigned_by,assigned_at) VALUES(?,?,?,?)").bind(id,staffId,session.id,now).run();
  }
  await recordEvent(env,id,session.id,"Order created",title);
  return json({ok:true,id},201,headers);
 }
 const orderMatch=path.match(/^\/api\/orders\/([^/]+)$/);
 if(orderMatch&&method==="GET"){
  const id=decodeURIComponent(orderMatch[1]),order=await env.DB.prepare("SELECT o.*,a.username customer_username,a.display_name customer_name FROM orders o LEFT JOIN accounts a ON a.discord_id=o.customer_discord_id WHERE o.id=?").bind(id).first();
  if(!order)return json({error:"Order not found"},404,headers);
  if(!has(perms,"orders:view")&&order.customer_discord_id!==session.id)return json({error:"You cannot view this order"},403,headers);
  const [assigned,progress]=await Promise.all([env.DB.prepare("SELECT oa.discord_id,a.username,a.display_name FROM order_assignments oa LEFT JOIN accounts a ON a.discord_id=oa.discord_id WHERE oa.order_id=? ORDER BY oa.assigned_at").bind(id).all(),env.DB.prepare("SELECT id,actor_discord_id,message,created_at FROM order_progress WHERE order_id=? ORDER BY created_at DESC").bind(id).all()]);
  return json({...order,assignedStaff:assigned.results||[],progress:progress.results||[]},200,headers);
 }
 if(orderMatch&&method==="PATCH"){
  const id=decodeURIComponent(orderMatch[1]),old=await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();if(!old)return json({error:"Order not found"},404,headers);
  if(!has(perms,"orders:update")&&!has(perms,"orders:assign"))return json({error:"You cannot update orders"},403,headers);
  const b=await request.json(),allowed=["title","service","package","quantity","price_robux","status","assigned_to","requirements","internal_notes","payment_status"];
  if(Array.isArray(b.assignedStaffIds)){
   if(!has(perms,"orders:assign"))return json({error:"You cannot assign orders"},403,headers);
   const ids=[...new Set(b.assignedStaffIds.map(String))].slice(0,20);
   for(const staffId of ids){const member=await getAccess(staffId,env);if(!member||(!has(member.permissions,"orders:update")&&!has(member.permissions,"orders:assign")))return json({error:"Every assignee must be an order-handling VANTA staff member"},400,headers)}
   await env.DB.prepare("DELETE FROM order_assignments WHERE order_id=?").bind(id).run();
   for(const staffId of ids)await env.DB.prepare("INSERT INTO order_assignments(order_id,discord_id,assigned_by,assigned_at) VALUES(?,?,?,?)").bind(id,staffId,session.id,new Date().toISOString()).run();
  }
  if(b.status&&!ORDER_STATUSES.includes(b.status))return json({error:"Invalid order status"},400,headers);
  const changes=[];const values=[];for(const key of allowed){if(Object.prototype.hasOwnProperty.call(b,key)){if(key==="assigned_to"&&!has(perms,"orders:assign"))return json({error:"You cannot assign orders"},403,headers);changes.push(key+"=?");values.push(b[key]===null?"":b[key]);}}
  if(!changes.length)return json({error:"No changes supplied"},400,headers);
  changes.push("updated_at=?");values.push(new Date().toISOString(),id);
  await env.DB.prepare("UPDATE orders SET "+changes.join(",")+" WHERE id=?").bind(...values).run();
  await recordEvent(env,id,session.id,"Order updated",JSON.stringify(b));
  return json({ok:true},200,headers);
 }
 const progressMatch=path.match(/^\/api\/orders\/([^/]+)\/progress$/);
 if(progressMatch&&method==="POST"){
  const id=decodeURIComponent(progressMatch[1]),order=await env.DB.prepare("SELECT id FROM orders WHERE id=?").bind(id).first();
  if(!order)return json({error:"Order not found"},404,headers);
  if(!has(perms,"orders:update"))return json({error:"You cannot post progress updates"},403,headers);
  const b=await request.json(),message=String(b.message||"").slice(0,2000),images=Array.isArray(b.images)?b.images:[];
  if(images.length>8)return json({error:"Upload up to 8 images per update"},400,headers);
  const progressId=crypto.randomUUID(),now=new Date().toISOString();
  await env.DB.prepare("INSERT INTO order_progress(id,order_id,actor_discord_id,message,created_at) VALUES(?,?,?,?,?)").bind(progressId,id,session.id,message,now).run();
  for(const image of images){
   const match=String(image.dataUrl||"").match(/^data:(image\/webp);base64,([A-Za-z0-9+/=]+)$/);
   if(!match)return json({error:"Images must be converted to WEBP before upload"},400,headers);
   const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
   if(bytes.byteLength>1250000)return json({error:"Each compressed image must be 1.25 MB or smaller"},400,headers);
   await env.DB.prepare("INSERT INTO order_progress_images(id,progress_id,order_id,data_url,file_name,content_type,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),progressId,id,image.dataUrl,String(image.name||"Progress image").slice(0,180),match[1],now).run();
  }
  await recordEvent(env,id,session.id,"Progress update",message||images.length+" image(s) added");
  return json({ok:true,id:progressId},201,headers);
 }
 if(progressMatch&&method==="GET"){
  const id=decodeURIComponent(progressMatch[1]),order=await env.DB.prepare("SELECT customer_discord_id FROM orders WHERE id=?").bind(id).first();
  if(!order)return json({error:"Order not found"},404,headers);
  if(!has(perms,"orders:view")&&order.customer_discord_id!==session.id)return json({error:"You cannot view this order"},403,headers);
  const rows=await env.DB.prepare("SELECT p.id,p.actor_discord_id,p.message,p.created_at,i.id image_id,i.file_name,i.content_type FROM order_progress p LEFT JOIN order_progress_images i ON i.progress_id=p.id WHERE p.order_id=? ORDER BY p.created_at DESC").bind(id).all();
  return json({updates:rows.results||[]},200,headers);
 }
 const imageMatch=path.match(/^\/api\/order-images\/([^/]+)$/);
 if(imageMatch&&method==="GET"){
  const imageId=decodeURIComponent(imageMatch[1]),row=await env.DB.prepare("SELECT i.data_url,i.content_type,o.customer_discord_id FROM order_progress_images i JOIN orders o ON o.id=i.order_id WHERE i.id=?").bind(imageId).first();
  if(!row)return json({error:"Image not found"},404,headers);
  if(!has(perms,"orders:view")&&row.customer_discord_id!==session.id)return json({error:"You cannot view this image"},403,headers);
  if(!row.data_url)return json({error:"Image not found"},404,headers);
  const encoded=row.data_url.split(",")[1]||"",bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  return new Response(bytes,{headers:{...headers,"content-type":row.content_type,"cache-control":"private, max-age=300","x-content-type-options":"nosniff"}});
 }
 if(path==="/api/customers"&&method==="GET"){
  if(!canSeeCustomers(perms))return json({error:"You cannot view customers"},403,headers);
  const q="%"+String(url.searchParams.get("q")||"").slice(0,80)+"%";
  const rows=await env.DB.prepare("SELECT discord_id,username,display_name,avatar_hash,created_at,last_login_at FROM accounts WHERE username LIKE ? OR display_name LIKE ? OR discord_id LIKE ? ORDER BY last_login_at DESC LIMIT 100").bind(q,q,q).all();
  return json({customers:rows.results||[]},200,headers);
 }
 const customerMatch=path.match(/^\/api\/customers\/([^/]+)$/);
 if(customerMatch&&method==="GET"){
  if(!canSeeCustomers(perms))return json({error:"You cannot view customer profiles"},403,headers);
  const id=decodeURIComponent(customerMatch[1]),customer=await env.DB.prepare("SELECT discord_id,username,display_name,avatar_hash,created_at,last_login_at FROM accounts WHERE discord_id=?").bind(id).first();
  if(!customer)return json({error:"Customer not found"},404,headers);
  let discordRoles=[];try{const m=await getVantaMember(id,env);discordRoles=m?.roleNames||[]}catch{}
  const vrows=await env.DB.prepare("SELECT r.id,r.name,r.color,r.permissions_json FROM vanta_roles r JOIN account_vanta_roles a ON a.role_id=r.id WHERE a.discord_id=?").bind(id).all();
  const orders=await env.DB.prepare("SELECT * FROM orders WHERE customer_discord_id=? ORDER BY created_at DESC").bind(id).all();
  return json({customer,discordRoles,vantaRoles:(vrows.results||[]).map(r=>({id:r.id,name:r.name,color:r.color,permissions:JSON.parse(r.permissions_json||"[]")})),orders:orders.results||[]},200,headers);
 }
 if(path==="/api/vanta-roles"&&method==="GET"){
  if(!has(perms,"roles:view")&&!canManageRoles(perms)&&!canSeeCustomers(perms))return json({error:"You cannot view VANTA roles"},403,headers);
  const rows=await env.DB.prepare("SELECT id,name,color,permissions_json,is_system FROM vanta_roles ORDER BY is_system DESC,name").all();
  return json({roles:(rows.results||[]).map(r=>({...r,permissions:JSON.parse(r.permissions_json||"[]")})),availablePermissions:ALL_PERMISSIONS},200,headers);
 }
 if(path==="/api/vanta-roles"&&method==="POST"){
  if(!canManageRoles(perms))return json({error:"Management access required"},403,headers);
  const b=await request.json(),name=String(b.name||"").trim(),color=String(b.color||"#8794a8"),ps=Array.isArray(b.permissions)?b.permissions.filter(p=>ALL_PERMISSIONS.includes(p)||p==="*"):[];
  if(!name||name.length>32)return json({error:"Role name must be 1–32 characters"},400,headers);
  if(!has(perms,"*")&&ps.some(p=>["*","management","roles:manage"].includes(p)))return json({error:"Only an Owner can grant management-level permissions"},403,headers);
  const id="custom-"+crypto.randomUUID().slice(0,12);
  try{await env.DB.prepare("INSERT INTO vanta_roles(id,name,color,permissions_json,is_system,created_at,updated_at) VALUES(?,?,?,?,0,?,?)").bind(id,name,color,JSON.stringify(ps),new Date().toISOString(),new Date().toISOString()).run()}catch{return json({error:"That role name may already exist"},409,headers)}
  return json({ok:true,id},201,headers);
 }
 const roleMatch=path.match(/^\/api\/vanta-roles\/([^/]+)$/);
 if(roleMatch&&method==="PATCH"){
  if(!canManageRoles(perms))return json({error:"Management access required"},403,headers);
  const id=decodeURIComponent(roleMatch[1]),old=await env.DB.prepare("SELECT * FROM vanta_roles WHERE id=?").bind(id).first();if(!old)return json({error:"Role not found"},404,headers);
  if(old.is_system)return json({error:"Default system roles cannot be edited"},400,headers);
  const b=await request.json(),name=String(b.name??old.name).trim(),color=String(b.color??old.color),ps=Array.isArray(b.permissions)?b.permissions.filter(p=>ALL_PERMISSIONS.includes(p)||p==="*"):JSON.parse(old.permissions_json);
  if(!has(perms,"*")&&ps.some(p=>["*","management","roles:manage"].includes(p)))return json({error:"Only an Owner can grant management-level permissions"},403,headers);
  try{await env.DB.prepare("UPDATE vanta_roles SET name=?,color=?,permissions_json=?,updated_at=? WHERE id=?").bind(name,color,JSON.stringify(ps),new Date().toISOString(),id).run()}catch{return json({error:"Role name already exists"},409,headers)}
  return json({ok:true},200,headers);
 }
 const assignMatch=path.match(/^\/api\/customers\/([^/]+)\/roles$/);
 if(assignMatch&&method==="POST"){
  if(!canManageRoles(perms))return json({error:"Management access required"},403,headers);
  const customer=decodeURIComponent(assignMatch[1]),b=await request.json(),roleId=String(b.roleId||"");
  const [exists,role]=await Promise.all([env.DB.prepare("SELECT discord_id FROM accounts WHERE discord_id=?").bind(customer).first(),env.DB.prepare("SELECT id,permissions_json FROM vanta_roles WHERE id=?").bind(roleId).first()]);
  if(!exists||!role)return json({error:"Customer or role not found"},404,headers);
  const granted=JSON.parse(role.permissions_json||"[]");if(!has(perms,"*")&&granted.some(p=>["*","management","roles:manage"].includes(p)))return json({error:"Only an Owner can assign management-level roles"},403,headers);
  await env.DB.prepare("INSERT OR IGNORE INTO account_vanta_roles(discord_id,role_id,assigned_by,assigned_at) VALUES(?,?,?,?)").bind(customer,roleId,session.id,new Date().toISOString()).run();
  return json({ok:true},200,headers);
 }
 const removeMatch=path.match(/^\/api\/customers\/([^/]+)\/roles\/([^/]+)$/);
 if(removeMatch&&method==="DELETE"){
  if(!canManageRoles(perms))return json({error:"Management access required"},403,headers);
  await env.DB.prepare("DELETE FROM account_vanta_roles WHERE discord_id=? AND role_id=?").bind(decodeURIComponent(removeMatch[1]),decodeURIComponent(removeMatch[2])).run();
  return json({ok:true},200,headers);
 }
 if(path==="/api/order-events"&&method==="GET"){
  if(!has(perms,"orders:view"))return json({error:"Staff access required"},403,headers);
  const id=String(url.searchParams.get("orderId")||"");
  const rows=await env.DB.prepare("SELECT * FROM order_events WHERE order_id=? ORDER BY created_at DESC").bind(id).all();
  return json({events:rows.results||[]},200,headers);
 }
 return json({error:"Not found"},404,headers);
}

function fromHex(value){if(!/^[0-9a-f]+$/i.test(value)||value.length%2)return new Uint8Array();return Uint8Array.from(value.match(/.{2}/g),x=>parseInt(x,16))}
async function verifyDiscordRequest(request,env,body){
 const signature=request.headers.get("X-Signature-Ed25519"),timestamp=request.headers.get("X-Signature-Timestamp");
 if(!signature||!timestamp||!env.DISCORD_PUBLIC_KEY)return false;
 try{
  const key=await crypto.subtle.importKey("raw",fromHex(env.DISCORD_PUBLIC_KEY),{name:"Ed25519"},false,["verify"]);
  return await crypto.subtle.verify({name:"Ed25519"},key,fromHex(signature),new TextEncoder().encode(timestamp+body));
 }catch{return false}
}
async function discordInteraction(request,env){
 const body=await request.text();
 if(!await verifyDiscordRequest(request,env,body))return new Response("Invalid request signature",{status:401});
 const i=JSON.parse(body);
 const reply=(content,ephemeral=true)=>json({type:4,data:{content,flags:ephemeral?64:0}});
 if(i.type===1)return json({type:1});
 if(i.type!==2)return json({error:"Unsupported interaction"},400);
 const name=i.data?.name,root=i.data?.options||[],sub=root[0]?.name,opts=root[0]?.options||[];
 const getOpt=(key)=>opts.find(o=>o.name===key)?.value;
 const user=i.member?.user||i.user,uid=user?.id;
 if(!uid)return reply("I couldn't identify your Discord account.");
 let access;try{access=await getAccess(uid,env)}catch(error){console.error("Discord interaction access check failed:",error?.message||String(error));return reply("I couldn't verify your VANTA server access right now.")};
 if(!access)return reply("You need to be a member of the VANTA Designs server to use this command.");
 const perms=access.permissions;
 const isStaffCommandUser=has(perms,"*")||has(perms,"orders:update")||has(perms,"orders:assign")||has(perms,"management")||has(perms,"support:manage")||has(perms,"sales")||has(perms,"creative")||has(perms,"operations");
 if(isStaffCommandUser){
  try{await env.DB.prepare("INSERT INTO command_logs(id,discord_id,username,display_name,command_name,subcommand,guild_id,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),uid,user.username||"",user.global_name||user.username||"",String(name||"unknown").slice(0,80),String(sub||"").slice(0,80),String(i.guild_id||env.VANTA_GUILD_ID),new Date().toISOString()).run()}catch(error){console.error("Discord command log write failed:",error?.message||String(error))}
 }
 if(name==="panel")return reply("**VANTA Central**\nManage your orders and account here: "+env.APP_URL);
 if(name==="order"){
  if(sub==="list"){
   if(!has(perms,"orders:view")&&!has(perms,"customer"))return reply("You don't have permission to view orders.");
   const rows=has(perms,"orders:view")?await env.DB.prepare("SELECT id,title,status,customer_discord_id FROM orders ORDER BY created_at DESC LIMIT 10").all():await env.DB.prepare("SELECT id,title,status,customer_discord_id FROM orders WHERE customer_discord_id=? ORDER BY created_at DESC LIMIT 10").bind(uid).all();
   const items=rows.results||[];return reply(items.length?"**Recent VANTA orders**\n"+items.map(o=>"`"+o.id+"` · "+o.title+" · "+o.status).join("\n"):"No orders found.");
  }
  if(sub==="view"){
   const id=String(getOpt("id")||"").trim(),o=await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
   if(!o)return reply("Order not found.");
   if(!has(perms,"orders:view")&&o.customer_discord_id!==uid)return reply("You don't have permission to view that order.");
   return reply("**"+o.id+" · "+o.title+"**\nStatus: "+o.status+"\nService: "+o.service+"\nPackage: "+o.package+"\nQuantity: "+o.quantity+"\nPrice: "+o.price_robux+" Robux");
  }
  if(sub==="create"){
   if(!has(perms,"orders:create"))return reply("You don't have permission to create orders.");
   const customer=getOpt("customer"),title=String(getOpt("title")||"").trim();
   if(!customer||!title)return reply("Customer and title are required.");
   const exists=await env.DB.prepare("SELECT discord_id FROM accounts WHERE discord_id=?").bind(customer).first();
   if(!exists)return reply("That customer must sign in to VANTA Central first.");
   const id="VNT-"+crypto.randomUUID().slice(0,8).toUpperCase(),now=new Date().toISOString();
   const service=String(getOpt("service")||"Other"),pkg=String(getOpt("package")||"Custom"),quantity=Math.max(1,Number(getOpt("quantity")||1)),price=Math.max(0,Number(getOpt("price")||0));
   await env.DB.prepare("INSERT INTO orders(id,customer_discord_id,title,service,package,quantity,price_robux,status,assigned_to,requirements,internal_notes,payment_status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,customer,title,service,pkg,quantity,price,"Awaiting Payment","","","","Unpaid",uid,now,now).run();
   await recordEvent(env,id,uid,"Order created",title);
   return reply("Created order **"+id+"** for <@"+customer+">.");
  }
  if(sub==="update"){
   if(!has(perms,"orders:update"))return reply("You don't have permission to update orders.");
   const id=String(getOpt("id")||""),status=String(getOpt("status")||"");
   if(!ORDER_STATUSES.includes(status))return reply("Choose a valid order status.");
   const old=await env.DB.prepare("SELECT id FROM orders WHERE id=?").bind(id).first();if(!old)return reply("Order not found.");
   await env.DB.prepare("UPDATE orders SET status=?,updated_at=? WHERE id=?").bind(status,new Date().toISOString(),id).run();
   await recordEvent(env,id,uid,"Status changed",status);
   return reply("Updated **"+id+"** to **"+status+"**.");
  }
  if(sub==="assign"){
   if(!has(perms,"orders:assign"))return reply("You don't have permission to assign orders.");
   const id=String(getOpt("id")||""),assignee=getOpt("staff");
   const old=await env.DB.prepare("SELECT id FROM orders WHERE id=?").bind(id).first();if(!old)return reply("Order not found.");
   if(!assignee)return reply("Choose a staff member.");
   const staffAccess=await getAccess(assignee,env);
   if(!staffAccess||(!has(staffAccess.permissions,"orders:update")&&!has(staffAccess.permissions,"orders:assign")))return reply("That member doesn't have order-handling permissions.");
   await env.DB.prepare("UPDATE orders SET assigned_to=?,updated_at=? WHERE id=?").bind(assignee,new Date().toISOString(),id).run();
   await recordEvent(env,id,uid,"Order assigned",assignee);
   return reply("Assigned **"+id+"** to <@"+assignee+">.");
  }
  return reply("Unknown order action.");
 }
 if(name==="customer"&&sub==="lookup"){
  if(!canSeeCustomers(perms))return reply("You don't have permission to look up customers.");
  const query=String(getOpt("user")||"").trim(),customer=await env.DB.prepare("SELECT discord_id,username,display_name,created_at,last_login_at FROM accounts WHERE discord_id=? OR username LIKE ? OR display_name LIKE ? LIMIT 1").bind(query,"%"+query+"%","%"+query+"%").first();
  if(!customer)return reply("No VANTA Central customer found. They may need to sign in first.");
  const orders=await env.DB.prepare("SELECT id,title,status FROM orders WHERE customer_discord_id=? ORDER BY created_at DESC LIMIT 5").bind(customer.discord_id).all();
  return reply("**Customer: "+customer.display_name+"** (@"+customer.username+")\nDiscord: <@"+customer.discord_id+">\n"+(orders.results||[]).map(o=>"`"+o.id+"` · "+o.title+" · "+o.status).join("\n"));
 }
 return reply("Unknown VANTA command.");
}
async function handle(request,env){
 const url=new URL(request.url),origin=allowedOrigin(request,env);
 if(url.pathname==="/discord/interactions"&&request.method==="POST")return discordInteraction(request,env);
 if(request.method==="OPTIONS"){if(!origin)return new Response(null,{status:403});return new Response(null,{status:204,headers:corsHeaders(origin)})}
 if(url.pathname==="/health"){
  let tables=false,commandLogsTable=false;try{const r=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").first();tables=Boolean(r);const c=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='command_logs'").first();commandLogsTable=Boolean(c)}catch{}
  const checks={discordClientId:!!env.DISCORD_CLIENT_ID,discordClientSecret:!!env.DISCORD_CLIENT_SECRET,discordBotToken:!!env.DISCORD_BOT_TOKEN,sessionSecret:!!env.SESSION_SECRET,databaseBinding:!!env.DB,ordersTable:tables,commandLogsTable};
  const ready=Object.values(checks).every(Boolean);return json({ok:ready,service:"Vanta Central",checks},ready?200:503);
 }
 if(url.pathname==="/internal/command-logs"&&request.method==="GET"){
  const auth=request.headers.get("authorization")||"";
  if(!env.DISCORD_CLIENT_SECRET||auth!==`Bearer ${env.DISCORD_CLIENT_SECRET}`)return json({error:"Unauthorized"},401);
  const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit"))||100));
  const rows=await env.DB.prepare("SELECT id,discord_id,username,display_name,command_name,subcommand,guild_id,created_at FROM command_logs ORDER BY created_at DESC LIMIT ?").bind(limit).all();
  return json({logs:rows.results||[]},200);
 }
 if(url.pathname==="/internal/staff-directory"&&request.method==="GET"){
  const auth=request.headers.get("authorization")||"";
  if(!env.DISCORD_CLIENT_SECRET||auth!==`Bearer ${env.DISCORD_CLIENT_SECRET}`)return json({error:"Unauthorized"},401);
  const roleResponse=await discordFetch(`/guilds/${env.VANTA_GUILD_ID}/roles`,`Bot ${env.DISCORD_BOT_TOKEN}`);
  if(!roleResponse.ok)return json({error:"Discord role directory unavailable"},502);
  const roles=await roleResponse.json(),roleMap=new Map(roles.map(role=>[role.id,role.name])),staff=[];
  let after="";
  for(let page=0;page<10;page++){
   const suffix=after?`&after=${after}`:"";
   const response=await discordFetch(`/guilds/${env.VANTA_GUILD_ID}/members?limit=1000${suffix}`,`Bot ${env.DISCORD_BOT_TOKEN}`);
   if(!response.ok)return json({error:"Discord member directory unavailable"},502);
   const batch=await response.json();
   for(const member of batch){
    const roleNames=(member.roles||[]).map(id=>roleMap.get(id)).filter(Boolean);
    const memberPermissions=new Set();
    for(const roleName of roleNames){if(!BLOCKED_ROLE_NAMES.has(roleName))for(const permission of ROLE_PERMISSIONS[roleName]||[])memberPermissions.add(permission)}
    const isStaff=memberPermissions.has("*")||["management","operations","operations_limited","sales","support","support_limited","creative","orders:update","orders:assign"].some(permission=>memberPermissions.has(permission));
    if(isStaff)staff.push({discord_user_id:member.user.id,discord_username:member.user.username,display_name:member.user.global_name||member.user.username,role_names:roleNames});
   }
   if(batch.length<1000)break;
   after=batch[batch.length-1]?.user?.id||"";
   if(!after)break;
  }
  return json({staff},200);
 }
 if(url.pathname==="/auth/discord"&&request.method==="GET"){
  const state=b64url(crypto.getRandomValues(new Uint8Array(32))),mode=url.searchParams.get("mode")==="signup"?"signup":"login",redirect=new URL("https://discord.com/oauth2/authorize");
  redirect.searchParams.set("client_id",env.DISCORD_CLIENT_ID);redirect.searchParams.set("response_type","code");redirect.searchParams.set("redirect_uri",`${url.origin}/auth/callback`);redirect.searchParams.set("scope","identify");redirect.searchParams.set("state",state);
  const headers=new Headers({location:redirect.toString(),"cache-control":"no-store"});headers.append("set-cookie",cookie(STATE_COOKIE,state+"."+mode,600));return new Response(null,{status:302,headers});
 }
 if(url.pathname==="/auth/callback"&&request.method==="GET"){
  const code=url.searchParams.get("code"),state=url.searchParams.get("state"),saved=getCookie(request,STATE_COOKIE),[expected,mode]=saved.split(".");
  if(!code||!state||!expected||state!==expected)return new Response("Discord sign-in could not be verified.",{status:400,headers:{"set-cookie":clearCookie(STATE_COOKIE)}});
  const tr=await fetch(`${DISCORD_API}/oauth2/token`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code,redirect_uri:`${url.origin}/auth/callback`})});
  if(!tr.ok)return new Response("Discord token exchange failed.",{status:502,headers:{"set-cookie":clearCookie(STATE_COOKIE)}});
  const oauth=await tr.json(),ur=await fetch(`${DISCORD_API}/users/@me`,{headers:{Authorization:`Bearer ${oauth.access_token}`}});if(!ur.ok)return new Response("Could not retrieve your Discord account.",{status:502});
  const user=await ur.json();let member;try{member=await getVantaMember(user.id,env)}catch(error){console.error("VANTA membership verification failed:",error);return new Response("VANTA membership could not be checked. Try again.",{status:503})}
  if(!member)return new Response("Join the VANTA Designs Discord server before using VANTA Central.",{status:403});
  const now=new Date().toISOString();await env.DB.prepare("INSERT INTO accounts(discord_id,username,display_name,avatar_hash,created_at,last_login_at) VALUES(?,?,?,?,?,?) ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,avatar_hash=excluded.avatar_hash,last_login_at=excluded.last_login_at").bind(user.id,user.username,user.global_name||user.username,user.avatar||null,now,now).run();
  await env.DB.prepare("INSERT OR IGNORE INTO account_vanta_roles(discord_id,role_id,assigned_by,assigned_at) VALUES(?,?,?,?)").bind(user.id,"role-customer","system",now).run();
  const session=await sign(JSON.stringify({id:user.id,username:user.username,global_name:user.global_name||user.username,avatar:user.avatar,exp:Math.floor(Date.now()/1000)+SESSION_SECONDS}),env.SESSION_SECRET);
  const h=new Headers({location:env.APP_URL+"?discord=connected&mode="+(mode==="signup"?"signup":"login"),"cache-control":"no-store"});h.append("set-cookie",cookie(SESSION_COOKIE,session,SESSION_SECONDS));h.append("set-cookie",clearCookie(STATE_COOKIE));return new Response(null,{status:302,headers:h});
 }
 if(url.pathname==="/auth/logout"&&request.method==="POST"){if(!origin)return json({error:"Origin not allowed"},403);return json({ok:true},200,{...corsHeaders(origin),"set-cookie":clearCookie(SESSION_COOKIE)})}
 if(url.pathname.startsWith("/api/")){
  if(!origin)return json({error:"Origin not allowed"},403);
  const session=await getSession(request,env);
  return handleApi(request,env,url,origin,session);
 }
 if(env.ASSETS)return env.ASSETS.fetch(request);
 return json({error:"Not found"},404);
}
export default {async fetch(request,env){try{return await handle(request,env)}catch(error){return json({error:"Internal VANTA Central error"},500)}}};
