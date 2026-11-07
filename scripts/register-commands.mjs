const applicationId = "1568489901815496774";
const guildId = "1564583995839217674";
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("Missing DISCORD_BOT_TOKEN. Set it in this Terminal session, then rerun.");
  process.exit(1);
}
const statuses = ["Awaiting Payment","Paid","In Progress","Awaiting Customer Review","Revision Requested","Completed","Cancelled"].map(name => ({name,value:name}));
const str = (name,description,required=false) => ({type:3,name,description,required});
const int = (name,description,required=false,min_value=1) => ({type:4,name,description,required,min_value});
const user = (name,description) => ({type:6,name,description,required:true});
const sub = (name,description,options=[]) => ({type:1,name,description,options});
const commands = [
 {name:"panel",description:"Open the VANTA Central portal"},
 {name:"order",description:"Manage VANTA customer orders",options:[
  sub("list","List recent orders"),
  sub("view","View an order",[str("id","VANTA order ID",true)]),
  sub("create","Create a customer order",[user("customer","Customer Discord account"),str("title","Order title",true),str("service","Service type"),str("package","Package name"),int("quantity","Number of items"),int("price","Price in Robux",false,0)]),
  sub("update","Update an order status",[str("id","VANTA order ID",true),{type:3,name:"status",description:"New order status",required:true,choices:statuses}]),
  sub("assign","Assign an order to staff",[str("id","VANTA order ID",true),user("staff","Staff member")])
 ]},
 {name:"customer",description:"Look up VANTA customers",options:[
  sub("lookup","Find a customer by username or Discord ID",[str("user","Discord username or ID",true)])
 ]}
];
const response = await fetch(`https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`, {
 method:"PUT",
 headers:{Authorization:`Bot ${token}`,"Content-Type":"application/json"},
 body:JSON.stringify(commands)
});
const result = await response.json();
if(!response.ok){console.error("Command registration failed:",result);process.exit(1);}
console.log("Registered VANTA slash commands:");
for(const command of result) console.log("/"+command.name+(command.options?.length?" ("+command.options.map(o=>o.name).join(", ")+")":""));
