const events = require("events");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

function files_match(file_1, file_2) {
    return crypto.createHash("sha1").update(fs.readFileSync(file_1)).digest("hex") == crypto.createHash("sha1").update(fs.readFileSync(file_2)).digest("hex");
}

class HourlySaver extends events.EventEmitter {
    filename(backup_folder, file) {
        if (backup_folder == undefined) return;
        const parsed_file = path.parse(file);
        const date = new Date();
        const year = date.getFullYear();
        let month = date.getMonth() + 1;
        let day =  date.getDate();
        let hour = date.getHours();
        let min = date.getMinutes();
        let sec = date.getSeconds();
        month = (month < 10) ? '0' + month : month;
        day = (day < 10) ? '0' + day : day;
        hour = (hour < 10) ? '0' + hour : hour;
        min = (min < 10) ? '0' + min : min;
        sec = (sec < 10) ? '0' + sec : sec;
        const timestamp = year + '-' + month + '-' + day + 'T' + hour + min + sec;
        return path.join(backup_folder, `${parsed_file.name} - ${timestamp}${parsed_file.ext}`);
    }

    keep_if_changes(file) {
        if (this.last_file && this.last_file != file && fs.existsSync(this.last_file)) {
            if (files_match(this.last_file, file)) {
                fs.unlinkSync(file);
                return false;
            }
        }
        this.last_file = file;
        return true;
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
    }

    start() {
        if (this.timer) this.stop();
        this.timer = setInterval(() => this.emit("save"), 60 * 60 * 1000);
    }
}

module.exports = {HourlySaver};
