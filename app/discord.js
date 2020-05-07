const DiscordRPC = require("discord-rpc");
const client_id = "586883052379308062";
DiscordRPC.register(client_id);
let rpc;

function login() {
    rpc = new DiscordRPC.Client({transport: "ipc"});
    rpc.on("ready", () => {
        rpc.setActivity({details: "Pushing blocks", largeImageKey: "default", largeImageText: "Mœbius"});
    });
    rpc.login({clientId: client_id}).catch((e) => {});
}

function destroy() {
    rpc.destroy().catch((e) => {});
}

module.exports = {login, destroy};
