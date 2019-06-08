const client = require("discord-rich-presence")("586883052379308062");
const start_time = new Date();
let timer;
let queued_status;

function set_details(details) {
    if (timer) {
        queued_status = details;
    } else {
        client.updatePresence({state: "Pushing Blocks", details, startTimestamp: start_time, largeImageKey: "default", largeImageText: "Mœbius"});
        timer = setTimeout(() => {
            if (queued_status) {
                timer = undefined;
                set_details(queued_status);
            }
        }, 16 * 1000);
    }
}

module.exports = {set_details};
