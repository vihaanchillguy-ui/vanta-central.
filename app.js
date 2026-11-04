const toast=document.getElementById("toast");
let toastTimer;
function notify(message){
  toast.textContent=message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove("show"),3200);
}
const authApi=(window.VANTA_AUTH_API||"").replace(/\/$/,"");
const signInButtons=[document.getElementById("signinBtn"),document.getElementById("emptySignin")].filter(Boolean);
function startDiscordLogin(){
  if(!authApi){
    notify("Discord sign-in is not deployed yet. The secure backend URL still needs configuration.");
    return;
  }
  window.location.assign(authApi+"/auth/discord");
}
signInButtons.forEach(button=>button.addEventListener("click",startDiscordLogin));
document.getElementById("menuBtn").addEventListener("click",()=>document.getElementById("sidebar").classList.toggle("open"));
document.querySelectorAll(".nav-item").forEach(link=>link.addEventListener("click",()=>{
  document.querySelectorAll(".nav-item").forEach(item=>item.classList.remove("active"));
  link.classList.add("active");
  if(window.innerWidth<=720)document.getElementById("sidebar").classList.remove("open");
}));
async function loadDiscordSession(){
  if(!authApi)return;
  try{
    const response=await fetch(authApi+"/api/me",{credentials:"include",headers:{Accept:"application/json"}});
    if(!response.ok)return;
    const data=await response.json();
    if(!data.authenticated)return;
    const profile=document.querySelector(".profile-placeholder");
    if(profile){
      const avatar=data.user.avatar
        ? "https://cdn.discordapp.com/avatars/"+encodeURIComponent(data.user.id)+"/"+encodeURIComponent(data.user.avatar)+".png?size=64"
        : "";
      profile.innerHTML=(avatar?'<img class="avatar" alt="" src="'+avatar+'">':'<div class="avatar">'+(data.user.displayName||"V").charAt(0).toUpperCase()+'</div>')+
        '<div><b></b><small>Discord connected</small></div><button class="more" id="logoutBtn" type="button" aria-label="Sign out">↪</button>';
      profile.querySelector("b").textContent=data.user.displayName||data.user.username;
      document.querySelector(".account-state").textContent="CONNECTED";
      document.querySelector(".setup-alert b").textContent="Discord account connected";
      document.querySelector(".setup-alert p").textContent="Your Discord identity and current Vanta server membership have been verified.";
      document.querySelector(".alert-tag").textContent="CONNECTED";
      signInButtons.forEach(button=>button.hidden=true);
      document.getElementById("logoutBtn").addEventListener("click",async()=>{
        await fetch(authApi+"/auth/logout",{method:"POST",credentials:"include"});
        window.location.reload();
      });
    }
  }catch(error){
    notify("Could not check your Discord session. Try refreshing.");
  }
}
loadDiscordSession();
if(new URLSearchParams(location.search).get("discord")==="connected"){
  history.replaceState({},document.title,location.pathname);
  notify("Discord account connected.");
}
