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
        const date = new Date();
        const hours = date.getHours();
        const parsed_file = path.parse(file);
        const hour = `${hours > 12 ? hours - 12 : hours}${hours > 12 ? "pm" : "am"}`;
        return path.join(backup_folder, `${parsed_file.name} - ${date.toDateString()} - ${hour}${parsed_file.ext}`);
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
