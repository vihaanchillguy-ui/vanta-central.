const toast=document.getElementById("toast");
let toastTimer;
function notify(message){toast.textContent=message;toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("show"),4000)}
const authApi=(window.VANTA_AUTH_API||location.origin).replace(/\/$/,"");
function beginAuth(mode){window.location.assign(authApi+"/auth/discord?mode="+encodeURIComponent(mode))}
document.getElementById("createBtn").addEventListener("click",()=>beginAuth("signup"));
document.getElementById("signinBtn").addEventListener("click",()=>beginAuth("login"));
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function showAccount(data){
 const user=data.user||{};
 const roles=Array.isArray(data.roles)?data.roles:[];
 const permissions=Array.isArray(data.permissions)?data.permissions:[];
 const staffPermissions=permissions.filter(p=>p!=="customer");
 const isStaff=staffPermissions.length>0;
 const panel=document.querySelector(".panel");
 const name=user.displayName||user.username||"Vanta user";
 const avatar=user.avatar?"https://cdn.discordapp.com/avatars/"+encodeURIComponent(user.id)+"/"+encodeURIComponent(user.avatar)+".png?size=128":"";
 panel.innerHTML="";
 const head=document.createElement("div");head.className="account-head";
 const photo=document.createElement("div");photo.className="avatar";
 if(avatar){const img=document.createElement("img");img.src=avatar;img.alt="";photo.appendChild(img)}else photo.textContent=name.charAt(0).toUpperCase();
 const label=document.createElement("div");
 label.innerHTML='<p class="overline">ACCOUNT CONNECTED</p><h2>Welcome, '+escapeHtml(name)+'</h2><p class="account-sub">'+(isStaff?'VANTA staff workspace':'Your Vanta account is ready.')+'</p>';
 head.append(photo,label);panel.append(head);
 const status=document.createElement("div");status.className="status";status.innerHTML='<span></span> Discord verified';panel.append(status);
 const info=document.createElement("div");info.className="account-info";
 if(isStaff){
  info.innerHTML='<strong>Staff access recognised</strong><p>Your Discord roles have granted staff permissions. Your staff workspace is active.</p><div class="role-list"><p><strong>Staff permissions</strong></p><p>'+staffPermissions.map(escapeHtml).join(" · ")+'</p></div>';
 }else{
  info.innerHTML='<strong>Customer workspace</strong><p>Your Discord account is connected, but none of its roles currently match a staff permission in VANTA Central. The detected roles are shown below so the role mapping can be corrected.</p><div class="role-list"><p><strong>Detected Discord roles</strong></p><p>'+(roles.length?roles.map(escapeHtml).join(" · "):"No roles returned")+'</p></div>';
 }
 panel.append(info);
 const logout=document.createElement("button");logout.className="secondary logout";logout.textContent="Sign out";logout.addEventListener("click",async()=>{await fetch(authApi+"/auth/logout",{method:"POST",credentials:"include"});location.reload()});panel.append(logout);
}
async function loadAccount(){
 try{
  const response=await fetch(authApi+"/api/me",{credentials:"include",headers:{Accept:"application/json"}});
  if(!response.ok)return;
  const data=await response.json();
  if(data.authenticated&&data.user)showAccount(data);
 }catch(error){notify("We couldn't check your account. Refresh the page and try again.")}
}
const params=new URLSearchParams(location.search);
if(params.get("discord")==="connected"){history.replaceState({},document.title,location.pathname);notify("Discord connected. Checking your Vanta account…")}
if(params.get("error")==="not_member"){history.replaceState({},document.title,location.pathname);notify("Join the Vanta Designs Discord server before creating an account.")}
loadAccount();
