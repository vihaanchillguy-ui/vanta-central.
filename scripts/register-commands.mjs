const applicationId = "1563889602559873136";
const guildId = "1564583995839217674";
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("Set DISCORD_BOT_TOKEN in your local terminal first.");
  process.exit(1);
}
const commands = [
  { name: "panel", description: "Open the VANTA Central portal" },
  { name: "order", description: "View VANTA orders", options: [
    { type: 1, name: "list", description: "List your recent orders (staff can see all)" },
    { type: 1, name: "view", description: "View an order", options: [
      { type: 3, name: "id", description: "VANTA order ID", required: true }
    ]}
  ]}
];
const response = await fetch(`https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands)
});
const result = await response.json();
if (!response.ok) {
  console.error("Command registration failed:", result);
  process.exit(1);
}
console.log("Registered VANTA commands:", result.map(command => "/" + command.name).join(", "));
