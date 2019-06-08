const client_id = "586883052379308062";
const discord_rpc = require("discord-rpc");
discord_rpc.register(client_id);
const rpc = new discord_rpc.Client({transport: "ipc"});
const start_time = new Date();
let timer;
let queued_status;

function set_details(details) {
    if (timer) {
        queued_status = details;
    } else {
        rpc.setActivity({state: "Pushing Blocks", details, startTimestamp: start_time, largeImageKey: "default",largeImageText: "Mœbius"});
        timer = setTimeout(() => {
            if (queued_status) {
                timer = undefined;
                set_details(queued_status);
            }
        }, 16 * 1000);
    }
}

rpc.on("ready", () => set_details("Just started"));

rpc.login({clientId: client_id});

module.exports = {set_details};
