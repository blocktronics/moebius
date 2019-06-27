(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const {ega} = require("./palette");
const {Textmode, add_sauce_for_ans} = require("./textmode");
const {cp437_to_unicode_bytes} = require("./encodings");

const sequence_type = {UNKNOWN: 0, UP: "A", DOWN: "B", RIGHT: "C", LEFT: "D", MOVE: "H", MOVE_ALT: "f", ERASE_DISPLAY: "J", ERASE_LINE: "K", SGR: "m", SAVE_POS: "s", TRUE_COLOR: "t", RESTORE_POS: "u"};
const token_type = {ESCAPE_SEQUENCE: 0, LITERAL: 1};
const ascii = {NEW_LINE: 10, CARRIAGE_RETURN: 13, ESCAPE: 27, SPACE: 32, ZERO: 48, NINE: 57, COLON: 58, SEMI_COLON: 59, AT_SYMBOL: 64, OPEN_SQUARE_BRACKET: 91, TILDA: 126};

class EscapeSequence {
    constructor() {
        this.no_value = true;
        this.type = sequence_type.UNKNOWN;
        this.values = [];
    }

    append_numeric(num) {
        if (this.no_value) {
            this.values.push(0);
            this.no_value = false;
        }
        this.values[this.values.length - 1] *= 10;
        this.values[this.values.length - 1] += num;
    }

    set_defaults(default_value, size_limit) {
        if (this.values.length < size_limit) {
            while(this.values.length < size_limit) {
                this.values.push(default_value);
            }
        } else if (this.values.length > size_limit) {
            while(this.values.length > size_limit) {
                this.values.pop();
            }
        }
    }

    set_default(default_value) {
        if (this.values.length == 0) {
            this.values.push(default_value);
        }
    }
}

function tokenize_file({bytes, filesize}) {
    const tokens = [];
    let sequence = new EscapeSequence();
    let pre_escape_mode = false;
    let escape_mode = false;
    for (let i = 0; i < filesize; i++) {
        const code = bytes[i];
        if (escape_mode) {
            if (code >= ascii.ZERO && code <= ascii.NINE) {
                sequence.append_numeric(code - ascii.ZERO);
            } else if (code == ascii.COLON || code == ascii.SEMI_COLON) {
                if (sequence.no_value) {
                    sequence.values.push(1);
                }
                sequence.no_value = true;
            } else if (code >= ascii.AT_SYMBOL && code <= ascii.TILDA) {
                switch(String.fromCharCode(code)) {
                    case sequence_type.UP:
                    sequence.type = sequence_type.UP;
                    sequence.set_defaults(1, 1);
                    break;
                    case sequence_type.DOWN:
                    sequence.type = sequence_type.DOWN;
                    sequence.set_defaults(1, 1);
                    break;
                    case sequence_type.RIGHT:
                    sequence.type = sequence_type.RIGHT;
                    sequence.set_defaults(1, 1);
                    break;
                    case sequence_type.LEFT:
                    sequence.type = sequence_type.LEFT;
                    sequence.set_defaults(1, 1);
                    break;
                    case sequence_type.MOVE:
                    case sequence_type.MOVE_ALT:
                    sequence.type = sequence_type.MOVE;
                    sequence.set_defaults(1, 2);
                    break;
                    case sequence_type.ERASE_DISPLAY:
                    sequence.type = sequence_type.ERASE_DISPLAY;
                    sequence.set_defaults(0, 1);
                    break;
                    case sequence_type.ERASE_LINE:
                    sequence.type = sequence_type.ERASE_LINE;
                    sequence.set_defaults(0, 1);
                    break;
                    case sequence_type.SGR:
                    sequence.type = sequence_type.SGR;
                    sequence.set_default(0);
                    break;
                    case sequence_type.SAVE_POS:
                    sequence.type = sequence_type.SAVE_POS;
                    sequence.values = [];
                    break;
                    case sequence_type.TRUE_COLOR:
                    sequence.type = sequence_type.TRUE_COLOR;
                    break;
                    case sequence_type.RESTORE_POS:
                    sequence.type = sequence_type.RESTORE_POS;
                    sequence.values = [];
                    break;
                    default:
                    sequence.type = sequence_type.UNKNOWN;
                    sequence.values = [];
                    break;
                }
                escape_mode = false;
                delete sequence.no_value;
                tokens.push({type: token_type.ESCAPE_SEQUENCE, sequence});
                sequence = new EscapeSequence();
            }
        } else {
            if (code == ascii.ESCAPE && !pre_escape_mode) {
                pre_escape_mode = true;
            } else if (code == ascii.OPEN_SQUARE_BRACKET && pre_escape_mode) {
                pre_escape_mode = false;
                escape_mode = true;
            } else {
                pre_escape_mode = false;
                tokens.push({type: token_type.LITERAL, code});
            }
        }
    }
    return tokens;
}

function ansi_to_bin_color(ansi_color) {
    switch (ansi_color) {
    case 4: return 1;
    case 6: return 3;
    case 1: return 4;
    case 3: return 6;
    case 12: return 9;
    case 14: return 11;
    case 9: return 12;
    case 11: return 14;
    default: return ansi_color;
    }
}

class Screen {
    reset_attributes() {
        this.bold = false;
        this.blink = false;
        this.inverse = false;
        this.fg = 7;
        this.bg = 0;
        this.fg_rgb = undefined;
        this.bg_rgb = undefined;
    }

    clear() {
        this.custom_colors = [];
        this.top_of_screen = 0;
        this.bottom_of_screen = 24;
        this.reset_attributes();
        this.rows = 25;
        this.x = 0;
        this.y = 0;
        this.data = new Array(this.columns * 1000);
        this.data.fill({fg: 7, bg: 0, code: ascii.SPACE});
    }

    constructor(columns) {
        this.columns = columns;
        this.clear();
        this.position_saved = false;
        this.save_x = 0;
        this.save_y = 0;
    }

    adjust_screen() {
        if (this.y > this.bottom_of_screen) {
            this.top_of_screen += 1;
            this.bottom_of_screen += 1;
        }
    }

    new_line() {
        this.x = 0;
        this.y += 1;
    }

    fill(extra_rows) {
        const more_data = new Array(this.columns * extra_rows);
        more_data.fill({fg: 7, bg: 0, code: ascii.SPACE});
        this.data = this.data.concat(more_data);
    }

    put({fg = 7, bg = 0, code = ascii.SPACE, fg_rgb, bg_rgb} = {}) {
        const i = this.y * this.columns + this.x;
        if (i >= this.data.length) this.fill(1000);
        this.data[i] = {code, fg: ansi_to_bin_color(fg), bg: ansi_to_bin_color(bg), fg_rgb, bg_rgb};
        this.x += 1;
        if (this.x == this.columns) this.new_line();
        if (this.y + 1 > this.rows) this.rows += 1;
        this.adjust_screen();
    }

    literal(code) {
        if (this.inverse) {
            this.put({
                code,
                fg: this.blink ? this.bg + 8 : this.bg,
                bg: this.bold ? this.fg + 8 : this.fg,
                fg_rgb: this.bg_rgb,
                bg_rgb: this.fg_rgb
            });
        } else {
            this.put({
                code,
                fg: this.bold ? this.fg + 8 : this.fg,
                bg: this.blink ? this.bg + 8 : this.bg,
                fg_rgb: this.fg_rgb,
                bg_rgb: this.bg_rgb
            });
        }
        if (this.fg_rgb) {
            this.custom_colors.push(this.fg_rgb);
        }
        if (this.bg_rgb) {
            this.custom_colors.push(this.bg_rgb);
        }
    }

    up(value) {
        this.y = Math.max(this.y - value, this.top_of_screen);
    }

    down(value) {
        this.y = Math.min(this.y + value, this.bottom_of_screen);
    }

    right(value) {
        this.x = Math.min(this.x + value, this.columns - 1);
    }

    left(value) {
        this.x = Math.max(this.x - value, 0);
    }

    move(x, y) {
        this.x = x - 1;
        this.y = y - 1 + this.top_of_screen;
    }

    clear_until_end_of_screen() {
        const tmp_x = this.x;
        const tmp_y = this.y;
        this.x = 0;
        while (!(this.x == this.columns && this.y == this.bottom_of_screen - 1)) {
            this.put();
        }
        this.x = tmp_x;
        this.y = tmp_y;
    }

    clear_from_start_of_screen() {
        const tmp_x = this.x;
        const tmp_y = this.y;
        this.x = 0;
        this.y = 0;
        while(!(this.x == this.columns && this.y == tmp_y)) {
            this.put();
        }
        this.x = tmp_x;
        this.y = tmp_y;
    }

    clear_until_end_of_line() {
        const tmp_x = this.x;
        while(this.x < this.columns) {
            this.put();
        }
        this.x = tmp_x;
    }

    clear_from_start_of_line() {
        const tmp_x = this.x;
        this.x = 0;
        while(this.x < tmp_x + 1) {
            this.put();
        }
        this.x = tmp_x;
    }

    clear_line() {
        const tmp_x = this.x;
        this.x = 0;
        while(this.x < this.columns) {
            putc();
        }
        this.x = tmp_x;
    }

    save_pos() {
        this.position_saved = true;
        this.save_x = this.x;
        this.save_y = this.y;
    }

    restore_pos() {
        if (this.position_saved) {
            this.x = this.save_x;
            this.y = this.save_y;
        }
    }

    trim_data() {
        return this.data.slice(0, this.rows * this.columns);
    }

    unique_custom_colors() {
        const unique_colors = [];
        for (const rgb of this.custom_colors) {
            if (unique_colors.find(stored_rgb => stored_rgb.r == rgb.r && stored_rgb.g == rgb.g && stored_rgb.b == rgb.b) == undefined) {
                unique_colors.push(rgb);
            }
        }
        return unique_colors;
    }
}

const erase_display_types = {UNTIL_END_OF_SCREEN: 0, FROM_START_OF_SCREEN: 1, CLEAR_SCREEN: 2};
const erase_line_types = {UNTIL_END_OF_LINE: 0, FROM_START_OF_LINE: 1, CLEAR_LINE: 2};
const sgr_types = {RESET_ATTRIBUTES: 0, BOLD_ON: 1, BLINK_ON: 5, INVERSE_ON: 7, BOLD_OFF: 22, BLINK_OFF: 21, BLINK_OFF_ALT: 22, INVERSE_OFF: 27, CHANGE_FG_START: 30, CHANGE_FG_END: 37, CHANGE_BG_START: 40, CHANGE_BG_END: 47};
const true_color_type = {BACKGROUND: 0, FOREGROUND: 1};

class Ansi extends Textmode {
    constructor(bytes) {
        super(bytes);
        const tokens = tokenize_file({bytes: this.bytes, filesize: this.filesize});
        if (!this.columns) this.columns = 80;
        let screen = new Screen(this.columns);
        for (const token of tokens) {
            if (token.type == token_type.LITERAL) {
                const code = token.code;
                switch (code) {
                    case ascii.NEW_LINE:
                    screen.new_line();
                    break;
                    case ascii.CARRIAGE_RETURN:
                    break;
                    default:
                    screen.literal(code);
                    break;
                }
            } else if (token.type == token_type.ESCAPE_SEQUENCE) {
                const sequence = token.sequence;
                switch (sequence.type) {
                    case sequence_type.UP: screen.up(sequence.values[0]); break;
                    case sequence_type.DOWN: screen.down(sequence.values[0]); break;
                    case sequence_type.RIGHT: screen.right(sequence.values[0]); break;
                    case sequence_type.LEFT: screen.left(sequence.values[0]); break;
                    case sequence_type.MOVE: screen.move(sequence.values[1], sequence.values[0]); break;
                    case sequence.ERASE_DISPLAY:
                    switch (sequence.values[0]) {
                        // case erase_display_types.UNTIL_END_OF_SCREEN: screen.clear_until_end_of_screen(); break;
                        // case erase_display_types.FROM_START_OF_SCREEN: screen.clear_from_start_of_screen(); break;
                        // case erase_display_types.CLEAR_SCREEN: screen.clear(); break;
                    }
                    break;
                    case sequence_type.ERASE_LINE:
                    switch (sequence.values[0]) {
                        // case erase_line_types.UNTIL_END_OF_LINE: screen.clear_until_end_of_line(); break;
                        // case erase_line_types.FROM_START_OF_LINE: screen.clear_from_start_of_line(); break;
                        // case erase_line_types.CLEAR_LINE: screen.clear_line(); break;
                    }
                    break;
                    case sequence_type.SGR:
                    for (const value of sequence.values) {
                        if (value >= sgr_types.CHANGE_FG_START && value <= sgr_types.CHANGE_FG_END) {
                            screen.fg = value - sgr_types.CHANGE_FG_START;
                            screen.fg_rgb = undefined;
                        } else if (value >= sgr_types.CHANGE_BG_START && value <= sgr_types.CHANGE_BG_END) {
                            screen.bg = value - sgr_types.CHANGE_BG_START;
                            screen.bg_rgb = undefined;
                        } else {
                            switch (value) {
                                case sgr_types.RESET_ATTRIBUTES: screen.reset_attributes(); break;
                                case sgr_types.BOLD_ON: screen.bold = true; screen.fg_rgb = undefined; break;
                                case sgr_types.BLINK_ON: screen.blink = true; break;
                                case sgr_types.INVERSE_ON: screen.inverse = true; break;
                                case sgr_types.BOLD_OFF:
                                case sgr_types.BLINK_OFF_ALT:
                                screen.bold = false;
                                break;
                                case sgr_types.BLINK_OFF: screen.blink = false; break;
                                case sgr_types.INVERSE_OFF: screen.inverse = false; break;
                            }
                        }
                    }
                    break;
                    case sequence_type.SAVE_POS: screen.save_pos(); break;
                    case sequence_type.TRUE_COLOR:
                    if (sequence.values.length >= 4) {
                        switch (sequence.values[0]) {
                            case true_color_type.BACKGROUND: screen.bg_rgb = {r: sequence.values[1], g: sequence.values[2], b: sequence.values[3]}; break;
                            case true_color_type.FOREGROUND: screen.fg_rgb = {r: sequence.values[1], g: sequence.values[2], b: sequence.values[3]}; break;
                        }
                    }
                    break;
                    case sequence_type.RESTORE_POS: screen.restore_pos(); break;
                    case sequence_type.UNKNOWN: break;
                }
            }
        }
        if (!this.rows) {
            this.rows = screen.rows;
        } else if (this.rows > screen.rows) {
            screen.fill(this.rows - screen.rows);
            screen.rows = this.rows;
        } else if (this.rows < screen.rows) {
            screen.rows = this.rows;
        }
        this.palette = ega;
        this.custom_colors = screen.unique_custom_colors();
        this.data = screen.trim_data();
    }
}

function bin_to_ansi_colour(bin_colour) {
    switch (bin_colour) {
    case 1: return 4;
    case 3: return 6;
    case 4: return 1;
    case 6: return 3;
    default: return bin_colour;
    }
}

function encode_as_ansi(doc, {utf8 = false} = {}) {
    let output = [27, 91, 48, 109];
    let bold = false;
    let blink = false;
    let current_fg = 7;
    let current_bg = 0;
    let current_bold = false;
    let current_blink = false;
    for (let i = 0; i < doc.data.length; i++) {
        let attribs = [];
        let {code, fg, bg} = doc.data[i];
        switch (code) {
        case 10: code = 9; break;
        case 13: code = 14; break;
        case 26: code = 16; break;
        case 27: code = 17; break;
        default:
        }
        if (fg > 7) {
            bold = true;
            fg = fg - 8;
        } else {
            bold = false;
        }
        if (bg > 7) {
            blink = true;
            bg = bg - 8;
        } else {
            blink = false;
        }
        if ((current_bold && !bold) || (current_blink && !blink)) {
            attribs.push([48]);
            current_fg = 7;
            current_bg = 0;
            current_bold = false;
            current_blink = false;
        }
        if (bold && !current_bold) {
            attribs.push([49]);
            current_bold = true;
        }
        if (blink && !current_blink) {
            attribs.push([53]);
            current_blink = true;
        }
        if (fg !== current_fg) {
            attribs.push([51, 48 + bin_to_ansi_colour(fg)]);
            current_fg = fg;
        }
        if (bg !== current_bg) {
            attribs.push([52, 48 + bin_to_ansi_colour(bg)]);
            current_bg = bg;
        }
        if (attribs.length) {
            output.push(27, 91);
            for (let i = 0; i < attribs.length; i += 1) {
                for (const attrib of attribs[i]) {
                    output.push(attrib);
                }
                if (i != attribs.length - 1) {
                    output.push(59);
                } else {
                    output.push(109);
                }
            }
        }
        if (code == 32 && bg == 0) {
            for (let j = i; j < doc.data.length; j++) {
                let {code: look_ahead_code, bg: look_ahead_bg} = doc.data[j];
                if (look_ahead_code != 32 || look_ahead_bg != 0) {
                    while (i < j) {
                        output.push(32);
                        i += 1;
                    }
                    i = j - 1;
                    break;
                }
                if ((j + 1) % doc.columns == 0) {
                    output.push(13, 10);
                    i = j;
                    break;
                }
            }
        } else if (utf8) {
            output.push.apply(output, cp437_to_unicode_bytes(code));
        } else {
            output.push(code);
        }
    }
    const bytes = new Uint8Array(output);
    if (utf8) return bytes;
    return add_sauce_for_ans({doc, bytes});
}

module.exports = {Ansi, encode_as_ansi};

},{"./encodings":4,"./palette":7,"./textmode":8}],2:[function(require,module,exports){
const {ega} = require("./palette");
const {bytes_to_blocks, Textmode, add_sauce_for_bin} = require("./textmode");

class BinaryText extends Textmode {
    constructor(bytes) {
        super(bytes);
        if (this.columns == undefined) {
            this.columns = 160;
        }
        const rows = this.filesize / this.columns / 2;
        if (rows % 1 != 0) {
            throw("Error parsing BinaryText file: unexpected number of rows");
        }
        this.rows = rows;
        this.palette = ega;
        this.data = bytes_to_blocks({columns: this.columns, rows: this.rows, bytes: this.bytes.subarray(0, this.filesize)});
    }
}

function encode_as_bin(doc) {
    if (doc.columns % 2 != 0) {
        throw("Cannot save in Binary Text format with an odd number of columns.");
    }
    const bytes = new Uint8Array(doc.data.length * 2);
    for (let i = 0, j = 0; i < doc.data.length; i++, j += 2) {
        bytes[j] = doc.data[i].code;
        bytes[j + 1] = (doc.data[i].bg << 4) + doc.data[i].fg;
    }
    return add_sauce_for_bin({doc, bytes});
}

module.exports = {BinaryText, encode_as_bin};

},{"./palette":7,"./textmode":8}],3:[function(require,module,exports){
function create_canvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const image_data = ctx.getImageData(0, 0, width, height);
    return {canvas, ctx, image_data};
}

function join_canvases(canvases) {
    let height = 0;
    for (const canvas of canvases) {
        height += canvas.height;
    }
    const {canvas, ctx} = create_canvas(canvases[0].width, height);
    for (let i = 0, y = 0; i < canvases.length; i++) {
        ctx.drawImage(canvases[i], 0, y);
        y += canvases[i].height;
    }
    return canvas;
}

module.exports = {create_canvas, join_canvases};

},{}],4:[function(require,module,exports){
(function (Buffer){
function cp437_to_unicode(cp437) {
    switch(cp437) {
        case 1: return "\u263A";
        case 2: return "\u263B";
        case 3: return "\u2665";
        case 4: return "\u2666";
        case 5: return "\u2663";
        case 6: return "\u2660";
        case 7: return "\u2022";
        case 8: return "\u25D8";
        case 9: return "\u25CB";
        case 10: return "\u25D9";
        case 11: return "\u2642";
        case 12: return "\u2640";
        case 13: return "\u266A";
        case 14: return "\u266B";
        case 15: return "\u263C";
        case 16: return "\u25BA";
        case 17: return "\u25C4";
        case 18: return "\u2195";
        case 19: return "\u203C";
        case 20: return "\u00B6";
        case 21: return "\u00A7";
        case 22: return "\u25AC";
        case 23: return "\u21A8";
        case 24: return "\u2191";
        case 25: return "\u2193";
        case 26: return "\u2192";
        case 27: return "\u2190";
        case 28: return "\u221F";
        case 29: return "\u2194";
        case 30: return "\u25B2";
        case 31: return "\u25BC";
        case 127: return "\u2302";
        case 128: return "\u00C7";
        case 129: return "\u00FC";
        case 130: return "\u00E9";
        case 131: return "\u00E2";
        case 132: return "\u00E4";
        case 133: return "\u00E0";
        case 134: return "\u00E5";
        case 135: return "\u00E7";
        case 136: return "\u00EA";
        case 137: return "\u00EB";
        case 138: return "\u00E8";
        case 139: return "\u00EF";
        case 140: return "\u00EE";
        case 141: return "\u00EC";
        case 142: return "\u00C4";
        case 143: return "\u00C5";
        case 144: return "\u00C9";
        case 145: return "\u00E6";
        case 146: return "\u00C6";
        case 147: return "\u00F4";
        case 148: return "\u00F6";
        case 149: return "\u00F2";
        case 150: return "\u00FB";
        case 151: return "\u00F9";
        case 152: return "\u00FF";
        case 153: return "\u00D6";
        case 154: return "\u00DC";
        case 155: return "\u00A2";
        case 156: return "\u00A3";
        case 157: return "\u00A5";
        case 158: return "\u20A7";
        case 159: return "\u0192";
        case 160: return "\u00E1";
        case 161: return "\u00ED";
        case 162: return "\u00F3";
        case 163: return "\u00FA";
        case 164: return "\u00F1";
        case 165: return "\u00D1";
        case 166: return "\u00AA";
        case 167: return "\u00BA";
        case 168: return "\u00BF";
        case 169: return "\u2310";
        case 170: return "\u00AC";
        case 171: return "\u00BD";
        case 172: return "\u00BC";
        case 173: return "\u00A1";
        case 174: return "\u00AB";
        case 175: return "\u00BB";
        case 176: return "\u2591";
        case 177: return "\u2592";
        case 178: return "\u2593";
        case 179: return "\u2502";
        case 180: return "\u2524";
        case 181: return "\u2561";
        case 182: return "\u2562";
        case 183: return "\u2556";
        case 184: return "\u2555";
        case 185: return "\u2563";
        case 186: return "\u2551";
        case 187: return "\u2557";
        case 188: return "\u255D";
        case 189: return "\u255C";
        case 190: return "\u255B";
        case 191: return "\u2510";
        case 192: return "\u2514";
        case 193: return "\u2534";
        case 194: return "\u252C";
        case 195: return "\u251C";
        case 196: return "\u2500";
        case 197: return "\u253C";
        case 198: return "\u255E";
        case 199: return "\u255F";
        case 200: return "\u255A";
        case 201: return "\u2554";
        case 202: return "\u2569";
        case 203: return "\u2566";
        case 204: return "\u2560";
        case 205: return "\u2550";
        case 206: return "\u256C";
        case 207: return "\u2567";
        case 208: return "\u2568";
        case 209: return "\u2564";
        case 210: return "\u2565";
        case 211: return "\u2559";
        case 212: return "\u2558";
        case 213: return "\u2552";
        case 214: return "\u2553";
        case 215: return "\u256B";
        case 216: return "\u256A";
        case 217: return "\u2518";
        case 218: return "\u250C";
        case 219: return "\u2588";
        case 220: return "\u2584";
        case 221: return "\u258C";
        case 222: return "\u2590";
        case 223: return "\u2580";
        case 224: return "\u03B1";
        case 225: return "\u00DF";
        case 226: return "\u0393";
        case 227: return "\u03C0";
        case 228: return "\u03A3";
        case 229: return "\u03C3";
        case 230: return "\u00B5";
        case 231: return "\u03C4";
        case 232: return "\u03A6";
        case 233: return "\u0398";
        case 234: return "\u03A9";
        case 235: return "\u03B4";
        case 236: return "\u221E";
        case 237: return "\u03C6";
        case 238: return "\u03B5";
        case 239: return "\u2229";
        case 240: return "\u2261";
        case 241: return "\u00B1";
        case 242: return "\u2265";
        case 243: return "\u2264";
        case 244: return "\u2320";
        case 245: return "\u2321";
        case 246: return "\u00F7";
        case 247: return "\u2248";
        case 248: return "\u00B0";
        case 249: return "\u2219";
        case 250: return "\u00B7";
        case 251: return "\u221A";
        case 252: return "\u207F";
        case 253: return "\u00B2";
        case 254: return "\u25A0";
        case 0:
        case 255: return "\u00A0";
        default: return String.fromCharCode(cp437);
    }
}

function cp437_to_unicode_bytes(cp437) {
    return Buffer.from(cp437_to_unicode(cp437));
}

function unicode_to_cp437(unicode) {
    switch(unicode) {
        case 0x263A: return 1;
        case 0x263B: return 2;
        case 0x2665: return 3;
        case 0x2666: return 4;
        case 0x2663: return 5;
        case 0x2660: return 6;
        case 0x2022: return 7;
        case 0x25D8: return 8;
        case 0x25CB: return 9;
        case 0x25D9: return 10;
        case 0x2642: return 11;
        case 0x2640: return 12;
        case 0x266A: return 13;
        case 0x266B: return 14;
        case 0x263C: return 15;
        case 0x25BA: return 16;
        case 0x25C4: return 17;
        case 0x2195: return 18;
        case 0x203C: return 19;
        case 0x00B6: return 20;
        case 0x00A7: return 21;
        case 0x25AC: return 22;
        case 0x21A8: return 23;
        case 0x2191: return 24;
        case 0x2193: return 25;
        case 0x2192: return 26;
        case 0x2190: return 27;
        case 0x221F: return 28;
        case 0x2194: return 29;
        case 0x25B2: return 30;
        case 0x25BC: return 31;
        case 0x2302: return 127;
        case 0x00C7: return 128;
        case 0x00FC: return 129;
        case 0x00E9: return 130;
        case 0x00E2: return 131;
        case 0x00E4: return 132;
        case 0x00E0: return 133;
        case 0x00E5: return 134;
        case 0x00E7: return 135;
        case 0x00EA: return 136;
        case 0x00EB: return 137;
        case 0x00E8: return 138;
        case 0x00EF: return 139;
        case 0x00EE: return 140;
        case 0x00EC: return 141;
        case 0x00C4: return 142;
        case 0x00C5: return 143;
        case 0x00C9: return 144;
        case 0x00E6: return 145;
        case 0x00C6: return 146;
        case 0x00F4: return 147;
        case 0x00F6: return 148;
        case 0x00F2: return 149;
        case 0x00FB: return 150;
        case 0x00F9: return 151;
        case 0x00FF: return 152;
        case 0x00D6: return 153;
        case 0x00DC: return 154;
        case 0x00A2: return 155;
        case 0x00A3: return 156;
        case 0x00A5: return 157;
        case 0x20A7: return 158;
        case 0x0192: return 159;
        case 0x00E1: return 160;
        case 0x00ED: return 161;
        case 0x00F3: return 162;
        case 0x00FA: return 163;
        case 0x00F1: return 164;
        case 0x00D1: return 165;
        case 0x00AA: return 166;
        case 0x00BA: return 167;
        case 0x00BF: return 168;
        case 0x2310: return 169;
        case 0x00AC: return 170;
        case 0x00BD: return 171;
        case 0x00BC: return 172;
        case 0x00A1: return 173;
        case 0x00AB: return 174;
        case 0x00BB: return 175;
        case 0x2591: return 176;
        case 0x2592: return 177;
        case 0x2593: return 178;
        case 0x2502: return 179;
        case 0x2524: return 180;
        case 0x2561: return 181;
        case 0x2562: return 182;
        case 0x2556: return 183;
        case 0x2555: return 184;
        case 0x2563: return 185;
        case 0x2551: return 186;
        case 0x2557: return 187;
        case 0x255D: return 188;
        case 0x255C: return 189;
        case 0x255B: return 190;
        case 0x2510: return 191;
        case 0x2514: return 192;
        case 0x2534: return 193;
        case 0x252C: return 194;
        case 0x251C: return 195;
        case 0x2500: return 196;
        case 0x253C: return 197;
        case 0x255E: return 198;
        case 0x255F: return 199;
        case 0x255A: return 200;
        case 0x2554: return 201;
        case 0x2569: return 202;
        case 0x2566: return 203;
        case 0x2560: return 204;
        case 0x2550: return 205;
        case 0x256C: return 206;
        case 0x2567: return 207;
        case 0x2568: return 208;
        case 0x2564: return 209;
        case 0x2565: return 210;
        case 0x2559: return 211;
        case 0x2558: return 212;
        case 0x2552: return 213;
        case 0x2553: return 214;
        case 0x256B: return 215;
        case 0x256A: return 216;
        case 0x2518: return 217;
        case 0x250C: return 218;
        case 0x2588: return 219;
        case 0x2584: return 220;
        case 0x258C: return 221;
        case 0x2590: return 222;
        case 0x2580: return 223;
        case 0x03B1: return 224;
        case 0x00DF: return 225;
        case 0x0393: return 226;
        case 0x03C0: return 227;
        case 0x03A3: return 228;
        case 0x03C3: return 229;
        case 0x00B5: return 230;
        case 0x03C4: return 231;
        case 0x03A6: return 232;
        case 0x0398: return 233;
        case 0x03A9: return 234;
        case 0x03B4: return 235;
        case 0x221E: return 236;
        case 0x03C6: return 237;
        case 0x03B5: return 238;
        case 0x2229: return 239;
        case 0x2261: return 240;
        case 0x00B1: return 241;
        case 0x2265: return 242;
        case 0x2264: return 243;
        case 0x2320: return 244;
        case 0x2321: return 245;
        case 0x00F7: return 246;
        case 0x2248: return 247;
        case 0x00B0: return 248;
        case 0x2219: return 249;
        case 0x00B7: return 250;
        case 0x221A: return 251;
        case 0x207F: return 252;
        case 0x00B2: return 253;
        case 0x25A0: return 254;
        case 0x00A0: return 255;
        default:
            if (unicode >= 0 && unicode <= 127) return unicode;
            return 0;
    }
}

module.exports = {cp437_to_unicode, cp437_to_unicode_bytes, unicode_to_cp437};

}).call(this,require("buffer").Buffer)
},{"buffer":15}],5:[function(require,module,exports){
const {white, bright_white, get_rgba, convert_ega_to_vga, ega} = require("./palette");
const {create_canvas} = require("./canvas");

function generate_font_canvas(bitmask, height, length) {
    const {canvas, ctx, image_data} = create_canvas(8 * length, height);
    const rgba = get_rgba(convert_ega_to_vga(bright_white));
    for (let i = 0, y = 0, char = 0; i < bitmask.length; i++) {
        for (let x = 0, byte = bitmask[i]; x < 8; x++) {
            if (byte >> x & 1) {
                image_data.data.set(rgba, (y * canvas.width + (8 - 1 - x) + char * 8) * 4);
            }
        }
        if ((i + 1) % height == 0) {
            y = 0;
            char++;
        } else {
            y++;
        }
    }
    ctx.putImageData(image_data, 0, 0);
    return canvas;
}

function add_ninth_bit_to_canvas(canvas, length) {
    const {canvas: new_canvas, ctx} = create_canvas(9 * length, canvas.height);
    for (let char = 0; char < length; char++) {
        ctx.drawImage(canvas, char * 8, 0, 8, canvas.height, char * 9, 0, 8, canvas.height);
        if (char >= 0xc0 && char <= 0xdf) {
            ctx.drawImage(canvas, char * 8 + 8 - 1, 0, 1, canvas.height, char * 9 + 8, 0, 1, canvas.height);
        }
    }
    return new_canvas;
}

function coloured_glyphs(canvas, rgb) {
    const image_data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const {canvas: coloured_canvas, ctx} = create_canvas(canvas.width, canvas.height);
    const rgba = get_rgba(rgb);
    for (let i = 0; i < image_data.data.length; i += 4) {
        if (image_data.data[i + 3]) {
            image_data.data.set(rgba, i);
        }
    }
    ctx.putImageData(image_data, 0, 0);
    return coloured_canvas;
}

function coloured_background(font_width, height, rgb) {
    const {canvas, ctx, image_data} = create_canvas(font_width, height);
    const rgba = get_rgba(rgb);
    for (let i = 0; i < image_data.data.length; i += 4) {
        image_data.data.set(rgba, i);
    }
    ctx.putImageData(image_data, 0, 0);
    return canvas;
}

function create_coloured_glyph({canvas: glyphs_canvas, code, rgb, width, height}) {
    const {canvas, ctx} = create_canvas(width, height);
    const image_data = glyphs_canvas.getContext("2d").getImageData(code * width, 0, width, height);
    const rgba = get_rgba(rgb);
    for (let i = 0; i < image_data.data.length; i += 4) {
        if (image_data.data[i + 3]) {
            image_data.data.set(rgba, i);
        }
    }
    ctx.putImageData(image_data, 0, 0);
    return canvas;
}

function lookup_url(font_name) {
    switch (font_name) {
    case "IBM VGA":               return "../fonts/ibm/CP437.F16";
    case "IBM VGA50":             return "../fonts/ibm/CP437.F08";
    case "IBM VGA25G":            return "../fonts/ibm/CP437.F19";
    case "IBM EGA":               return "../fonts/ibm/CP437.F14";
    case "IBM EGA43":             return "../fonts/ibm/CP437.F08";
    case "IBM VGA 437":           return "../fonts/ibm/CP437.F16";
    case "IBM VGA50 437":         return "../fonts/ibm/CP437.F08";
    case "IBM VGA25G 437":        return "../fonts/ibm/CP437.F19";
    case "IBM EGA 437":           return "../fonts/ibm/CP437.F14";
    case "IBM EGA43 437":         return "../fonts/ibm/CP437.F08";
    case "IBM VGA 720":           return "../fonts/ibm/CP720.F16";
    case "IBM VGA50 720":         return "../fonts/ibm/CP720.F08";
    case "IBM VGA25G 720":        return "../fonts/ibm/CP720.F19";
    case "IBM EGA 720":           return "../fonts/ibm/CP720.F14";
    case "IBM EGA43 720":         return "../fonts/ibm/CP720.F08";
    case "IBM VGA 737":           return "../fonts/ibm/CP737.F16";
    case "IBM VGA50 737":         return "../fonts/ibm/CP737.F08";
    case "IBM VGA25G 737":        return "../fonts/ibm/CP737.F19";
    case "IBM EGA 737":           return "../fonts/ibm/CP737.F14";
    case "IBM EGA43 737":         return "../fonts/ibm/CP737.F08";
    case "IBM VGA 775":           return "../fonts/ibm/CP775.F16";
    case "IBM VGA50 775":         return "../fonts/ibm/CP775.F08";
    case "IBM VGA25G 775":        return "../fonts/ibm/CP775.F19";
    case "IBM EGA 775":           return "../fonts/ibm/CP775.F14";
    case "IBM EGA43 775":         return "../fonts/ibm/CP775.F08";
    case "IBM VGA 819":           return "../fonts/ibm/CP819.F16";
    case "IBM VGA50 819":         return "../fonts/ibm/CP819.F08";
    case "IBM VGA25G 819":        return "../fonts/ibm/CP819.F19";
    case "IBM EGA 819":           return "../fonts/ibm/CP819.F14";
    case "IBM EGA43 819":         return "../fonts/ibm/CP819.F08";
    case "IBM VGA 850":           return "../fonts/ibm/CP850.F16";
    case "IBM VGA50 850":         return "../fonts/ibm/CP850.F08";
    case "IBM VGA25G 850":        return "../fonts/ibm/CP850.F19";
    case "IBM EGA 850":           return "../fonts/ibm/CP850.F14";
    case "IBM EGA43 850":         return "../fonts/ibm/CP850.F08";
    case "IBM VGA 852":           return "../fonts/ibm/CP852.F16";
    case "IBM VGA50 852":         return "../fonts/ibm/CP852.F08";
    case "IBM VGA25G 852":        return "../fonts/ibm/CP852.F19";
    case "IBM EGA 852":           return "../fonts/ibm/CP852.F14";
    case "IBM EGA43 852":         return "../fonts/ibm/CP852.F08";
    case "IBM VGA 855":           return "../fonts/ibm/CP855.F16";
    case "IBM VGA50 855":         return "../fonts/ibm/CP855.F08";
    case "IBM VGA25G 855":        return "../fonts/ibm/CP855.F19";
    case "IBM EGA 855":           return "../fonts/ibm/CP855.F14";
    case "IBM EGA43 855":         return "../fonts/ibm/CP855.F08";
    case "IBM VGA 857":           return "../fonts/ibm/CP857.F16";
    case "IBM VGA50 857":         return "../fonts/ibm/CP857.F08";
    case "IBM VGA25G 857":        return "../fonts/ibm/CP857.F19";
    case "IBM EGA 857":           return "../fonts/ibm/CP857.F14";
    case "IBM EGA43 857":         return "../fonts/ibm/CP857.F08";
    case "IBM VGA 858":           return "../fonts/ibm/CP858.F16";
    case "IBM VGA50 858":         return "../fonts/ibm/CP858.F08";
    case "IBM VGA25G 858":        return "../fonts/ibm/CP858.F19";
    case "IBM EGA 858":           return "../fonts/ibm/CP858.F14";
    case "IBM EGA43 858":         return "../fonts/ibm/CP858.F08";
    case "IBM VGA 860":           return "../fonts/ibm/CP860.F16";
    case "IBM VGA50 860":         return "../fonts/ibm/CP860.F08";
    case "IBM VGA25G 860":        return "../fonts/ibm/CP860.F19";
    case "IBM EGA 860":           return "../fonts/ibm/CP860.F14";
    case "IBM EGA43 860":         return "../fonts/ibm/CP860.F08";
    case "IBM VGA 861":           return "../fonts/ibm/CP861.F16";
    case "IBM VGA50 861":         return "../fonts/ibm/CP861.F08";
    case "IBM VGA25G 861":        return "../fonts/ibm/CP861.F19";
    case "IBM EGA 861":           return "../fonts/ibm/CP861.F14";
    case "IBM EGA43 861":         return "../fonts/ibm/CP861.F08";
    case "IBM VGA 862":           return "../fonts/ibm/CP862.F16";
    case "IBM VGA50 862":         return "../fonts/ibm/CP862.F08";
    case "IBM VGA25G 862":        return "../fonts/ibm/CP862.F19";
    case "IBM EGA 862":           return "../fonts/ibm/CP862.F14";
    case "IBM EGA43 862":         return "../fonts/ibm/CP862.F08";
    case "IBM VGA 863":           return "../fonts/ibm/CP863.F16";
    case "IBM VGA50 863":         return "../fonts/ibm/CP863.F08";
    case "IBM VGA25G 863":        return "../fonts/ibm/CP863.F19";
    case "IBM EGA 863":           return "../fonts/ibm/CP863.F14";
    case "IBM EGA43 863":         return "../fonts/ibm/CP863.F08";
    case "IBM VGA 864":           return "../fonts/ibm/CP864.F16";
    case "IBM VGA50 864":         return "../fonts/ibm/CP864.F08";
    case "IBM VGA25G 864":        return "../fonts/ibm/CP864.F19";
    case "IBM EGA 864":           return "../fonts/ibm/CP864.F14";
    case "IBM EGA43 864":         return "../fonts/ibm/CP864.F08";
    case "IBM VGA 865":           return "../fonts/ibm/CP865.F16";
    case "IBM VGA50 865":         return "../fonts/ibm/CP865.F08";
    case "IBM VGA25G 865":        return "../fonts/ibm/CP865.F19";
    case "IBM EGA 865":           return "../fonts/ibm/CP865.F14";
    case "IBM EGA43 865":         return "../fonts/ibm/CP865.F08";
    case "IBM VGA 866":           return "../fonts/ibm/CP866.F16";
    case "IBM VGA50 866":         return "../fonts/ibm/CP866.F08";
    case "IBM VGA25G 866":        return "../fonts/ibm/CP866.F19";
    case "IBM EGA 866":           return "../fonts/ibm/CP866.F14";
    case "IBM EGA43 866":         return "../fonts/ibm/CP866.F08";
    case "IBM VGA 869":           return "../fonts/ibm/CP869.F16";
    case "IBM VGA50 869":         return "../fonts/ibm/CP869.F08";
    case "IBM VGA25G 869":        return "../fonts/ibm/CP869.F19";
    case "IBM EGA 869":           return "../fonts/ibm/CP869.F14";
    case "IBM EGA43 869":         return "../fonts/ibm/CP869.F08";
    case "IBM VGA 872":           return "../fonts/ibm/CP872.F16";
    case "IBM VGA50 872":         return "../fonts/ibm/CP872.F08";
    case "IBM VGA25G 872":        return "../fonts/ibm/CP872.F19";
    case "IBM EGA 872":           return "../fonts/ibm/CP872.F14";
    case "IBM EGA43 872":         return "../fonts/ibm/CP872.F08";
    case "IBM VGA KAM":           return "../fonts/ibm/CP867.F16";
    case "IBM VGA50 KAM":         return "../fonts/ibm/CP867.F08";
    case "IBM VGA25G KAM":        return "../fonts/ibm/CP867.F19";
    case "IBM EGA KAM":           return "../fonts/ibm/CP867.F14";
    case "IBM EGA43 KAM":         return "../fonts/ibm/CP867.F08";
    case "IBM VGA MAZ":           return "../fonts/ibm/CP667.F16";
    case "IBM VGA50 MAZ":         return "../fonts/ibm/CP667.F08";
    case "IBM VGA25G MAZ":        return "../fonts/ibm/CP667.F19";
    case "IBM EGA MAZ":           return "../fonts/ibm/CP667.F14";
    case "IBM EGA43 MAZ":         return "../fonts/ibm/CP667.F08";
    case "IBM VGA MIK":           return "../fonts/ibm/CP866.F16";
    case "IBM VGA50 MIK":         return "../fonts/ibm/CP866.F08";
    case "IBM VGA25G MIK":        return "../fonts/ibm/CP866.F19";
    case "IBM EGA MIK":           return "../fonts/ibm/CP866.F14";
    case "IBM EGA43 MIK":         return "../fonts/ibm/CP866.F08";
    case "IBM VGA 667":           return "../fonts/ibm/CP667.F16";
    case "IBM VGA50 667":         return "../fonts/ibm/CP667.F08";
    case "IBM VGA25G 667":        return "../fonts/ibm/CP667.F19";
    case "IBM EGA 667":           return "../fonts/ibm/CP667.F14";
    case "IBM EGA43 667":         return "../fonts/ibm/CP667.F08";
    case "IBM VGA 790":           return "../fonts/ibm/CP790.F16";
    case "IBM VGA50 790":         return "../fonts/ibm/CP790.F08";
    case "IBM VGA25G 790":        return "../fonts/ibm/CP790.F19";
    case "IBM EGA 790":           return "../fonts/ibm/CP790.F14";
    case "IBM EGA43 790":         return "../fonts/ibm/CP790.F08";
    case "IBM VGA 866":           return "../fonts/ibm/CP866.F16";
    case "IBM VGA50 866":         return "../fonts/ibm/CP866.F08";
    case "IBM VGA25G 866":        return "../fonts/ibm/CP866.F19";
    case "IBM EGA 866":           return "../fonts/ibm/CP866.F14";
    case "IBM EGA43 866":         return "../fonts/ibm/CP866.F08";
    case "IBM VGA 867":           return "../fonts/ibm/CP867.F16";
    case "IBM VGA50 867":         return "../fonts/ibm/CP867.F08";
    case "IBM VGA25G 867":        return "../fonts/ibm/CP867.F19";
    case "IBM EGA 867":           return "../fonts/ibm/CP867.F14";
    case "IBM EGA43 867":         return "../fonts/ibm/CP867.F08";
    case "IBM VGA 895":           return "../fonts/ibm/CP895.F16";
    case "IBM VGA50 895":         return "../fonts/ibm/CP895.F08";
    case "IBM VGA25G 895":        return "../fonts/ibm/CP895.F19";
    case "IBM EGA 895":           return "../fonts/ibm/CP895.F14";
    case "IBM EGA43 895":         return "../fonts/ibm/CP895.F08";
    case "IBM VGA 991":           return "../fonts/ibm/CP991.F16";
    case "IBM VGA50 991":         return "../fonts/ibm/CP991.F08";
    case "IBM VGA25G 991":        return "../fonts/ibm/CP991.F19";
    case "IBM EGA 991":           return "../fonts/ibm/CP991.F14";
    case "IBM EGA43 991":         return "../fonts/ibm/CP991.F08";
    case "Amiga Topaz 1":         return "../fonts/amiga/Topaz_a500.F16";
    case "Amiga Topaz 1+":        return "../fonts/amiga/TopazPlus_a500.F16";
    case "Amiga Topaz 2":         return "../fonts/amiga/Topaz_a1200.F16";
    case "Amiga Topaz 2+":        return "../fonts/amiga/TopazPlus_a1200.F16";
    case "Amiga P0T-NOoDLE":      return "../fonts/amiga/P0T-NOoDLE.F16";
    case "Amiga MicroKnight":     return "../fonts/amiga/MicroKnight.F16";
    case "Amiga MicroKnight+":    return "../fonts/amiga/MicroKnightPlus.F16";
    case "Amiga mOsOul":          return "../fonts/amiga/mO'sOul.F16";
    case "C64 PETSCII unshifted": return "../fonts/c64/unshifted.F08";
    case "C64 PETSCII shifted":   return "../fonts/c64/shifted.F08";
    case "Atari ATASCII":         return "../fonts/atari/atascii.F08";
    default:                      return "../fonts/ibm/CP437.F16";
    }
}

class Font {
    async load({name = "IBM VGA", bytes, use_9px_font = true}) {
        if (bytes) {
            this.name = "Custom";
        } else {
            this.name = name;
            let req = new Request(lookup_url(name));
            let resp = await fetch(req);
            bytes = new Uint8Array(await resp.arrayBuffer());
        }
        const font_height = bytes.length / 256;
        if (font_height % 1 != 0) {
            throw("Error loading font.");
        }
        this.height = font_height;
        this.bitmask = bytes;
        this.width = 8;
        this.length = 256;
        this.use_9px_font = use_9px_font;
        this.canvas = generate_font_canvas(this.bitmask, this.height, this.length);
        if (this.use_9px_font) {
            this.width += 1;
            this.canvas = add_ninth_bit_to_canvas(this.canvas, this.length);
        }
        this.glyphs = this.palette.map(rgb => coloured_glyphs(this.canvas, convert_ega_to_vga(rgb)));
        this.backgrounds = this.palette.map(rgb => coloured_background(this.width, this.height, convert_ega_to_vga(rgb)));
        this.cursor = coloured_background(this.width, 2, convert_ega_to_vga(bright_white));
    }

    draw(ctx, block, x, y) {
        if (block.bg_rgb) {
            ctx.drawImage(coloured_background(this.width, this.height, block.bg_rgb), x, y);
        } else {
            ctx.drawImage(this.backgrounds[block.bg], x, y);
        }
        if (block.fg_rgb) {
            ctx.drawImage(create_coloured_glyph({canvas: this.canvas, code: block.code, rgb: block.fg_rgb, width: this.width, height: this.height}), x, y);
        } else {
            ctx.drawImage(this.glyphs[block.fg], block.code * this.width, 0, this.width, this.height, x, y, this.width, this.height);
        }
    }

    draw_raw(ctx, block, x, y) {
        ctx.drawImage(create_coloured_glyph({canvas: this.canvas, code: block.code, rgb: convert_ega_to_vga(white), width: this.width, height: this.height}), x, y);
    }

    get_rgb(i) {
        return convert_ega_to_vga(this.palette[i]);
    }

    draw_bg(ctx, bg, x, y) {
        ctx.drawImage(this.backgrounds[bg], x, y);
    }

    draw_cursor(ctx, x, y) {
        ctx.drawImage(this.cursor, x, y);
    }

    constructor(palette = ega) {
        this.palette = palette;
    }
}

module.exports = {Font};

},{"./canvas":3,"./palette":7}],6:[function(require,module,exports){
const {Font} = require("./font");
const {create_canvas, join_canvases} = require("./canvas");
const {Ansi, encode_as_ansi} = require("./ansi");
const {BinaryText, encode_as_bin} = require("./binary_text");
const {XBin, encode_as_xbin} = require("./xbin");
const {ega, convert_ega_to_style} = require("./palette");
const path = require("path");
const {current_date, resize_canvas} = require("./textmode");
const {cp437_to_unicode, cp437_to_unicode_bytes, unicode_to_cp437} = require("./encodings");
const fs = require("fs");

function read_bytes(bytes, file) {
    switch (path.extname(file).toLowerCase()) {
        case ".bin": return new BinaryText(bytes);
        case ".xb": return new XBin(bytes);
        case ".ans":
        default:
        return new Ansi(bytes);
    }
}

async function read_file(file) {
    return new Promise((resolve) => {
        fs.readFile(file, (err, bytes) => {
            if (err) throw(`Error: ${file} not found!`);
            resolve(read_bytes(bytes, file));
        });
    });
}

async function next_frame() {
    return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

async function animate({file, ctx}) {
    const doc = await read_file(file);
    const font = new Font(doc.palette);
    await font.load({name: doc.font_name, bytes: doc.font_bytes, use_9px_font: doc.use_9px_font});
    for (let y = 0, py = 0, i = 0; y < doc.rows; y++, py += font.height) {
        for (let x = 0, px = 0; x < doc.columns; x++, px += font.width, i++) {
            const block = doc.data[i];
            if (block.bg >= 8 && !doc.ice_colors) {
                font.draw(ctx, {fg: block.fg, bg: block.bg - 8, code: block.code, fg_rgb: block.fg_rgb, bg_rgb: block.bg_rgb}, px, py);
            } else {
                font.draw(ctx, block, px, py);
            }
            if (i % 30 == 0) await next_frame();
        }
    }
}

function write_file(doc, file, {utf8 = false} = {}) {
    let bytes;
    switch (path.extname(file).toLowerCase()) {
        case ".bin":
        bytes = encode_as_bin(doc);
        break;
        case ".xb":
        bytes = encode_as_xbin(doc);
        break;
        case ".ans":
        default:
        bytes = encode_as_ansi(doc, {utf8});
    }
    fs.writeFileSync(file, bytes);
}

function create_canvases(width, height, maximum_height) {
    const number_of_canvases = Math.floor(height / maximum_height);
    const canvases = [];
    const ctxs = [];
    for (let i = 0; i < number_of_canvases; i++) {
        const {canvas, ctx} = create_canvas(width, maximum_height);
        canvases.push(canvas);
        ctxs.push(ctx);
    }
    const remainder_height = height % maximum_height;
    if (remainder_height) {
        const {canvas, ctx} = create_canvas(width, remainder_height);
        canvases.push(canvas);
        ctxs.push(ctx);
    }
    return {canvases, ctxs};
}

async function render(doc) {
    const font = new Font(doc.palette);
    await font.load({name: doc.font_name, bytes: doc.font_bytes, use_9px_font: doc.use_9px_font});
    const {canvas, ctx} = create_canvas(font.width * doc.columns, font.height * doc.rows);
    for (let y = 0, py = 0, i = 0; y < doc.rows; y++, py += font.height) {
        for (let x = 0, px = 0; x < doc.columns; x++, px += font.width, i++) {
            const block = doc.data[i];
            if (block.bg >= 8 && !doc.ice_colors) {
                font.draw(ctx, {fg: block.fg, bg: block.bg - 8, code: block.code, fg_rgb: block.fg_rgb, bg_rgb: block.bg_rgb}, px, py);
            } else {
                font.draw(ctx, block, px, py);
            }
        }
    }
    return {canvas, font};
}

function render_blocks(blocks, font) {
    const {canvas, ctx} = create_canvas(blocks.columns * font.width, blocks.rows * font.height);
    for (let y = 0, py = 0, i = 0; y < blocks.rows; y++, py += font.height) {
        for (let x = 0, px = 0; x < blocks.columns; x++, px += font.width, i++) {
            const block = blocks.data[i];
            if (!blocks.transparent || block.code != 32 || block.bg != 0) font.draw(ctx, block, px, py);
        }
    }
    return canvas;
}

function merge_blocks(under_blocks, over_blocks) {
    const merged_blocks = {columns: Math.max(under_blocks.columns, over_blocks.columns), rows: Math.max(under_blocks.rows, over_blocks.rows), data: new Array(Math.max(under_blocks.rows, over_blocks.rows) * Math.max(under_blocks.columns, over_blocks.columns)), transparent: false};
    for (let y = 0, i = 0; y < merged_blocks.rows; y++) {
        for (let x = 0; x < merged_blocks.columns; x++, i++) {
            const under_block = (y < under_blocks.rows && x < under_blocks.columns) ? under_blocks.data[y * under_blocks.columns + x] : undefined;
            const over_block = (y < over_blocks.rows && x < over_blocks.columns) ? over_blocks.data[y * over_blocks.columns + x] : undefined;
            if (over_block == undefined || (over_block.code == 32 && over_block.bg == 0)) {
                merged_blocks.data[i] = Object.assign(under_block);
            } else {
                merged_blocks.data[i] = Object.assign(over_block);
            }
        }
    }
    return merged_blocks;
}

function copy_canvases(sources) {
    return sources.map((source) => {
        const {canvas, ctx} = create_canvas(source.width, source.height);
        ctx.drawImage(source, 0, 0);
        return {canvas, ctx};
    });
}

async function render_split(doc, maximum_rows = 100) {
    const font = new Font(doc.palette);
    await font.load({name: doc.font_name, bytes: doc.font_bytes, use_9px_font: doc.use_9px_font});
    const {canvases, ctxs} = create_canvases(font.width * doc.columns, font.height * doc.rows, font.height * maximum_rows);
    for (let y = 0, py = 0, i = 0, canvas_i = 0; y < doc.rows; y++, py += font.height) {
        if (py == 100 * font.height) {
            py = 0;
            canvas_i += 1;
        }
        for (let x = 0, px = 0; x < doc.columns; x++, px += font.width, i++) {
            font.draw(ctxs[canvas_i], doc.data[i], px, py);
        }
    }
    const blink_on_collection = copy_canvases(canvases);
    const blink_off_collection = copy_canvases(canvases);
    for (let y = 0, py = 0, i = 0, canvas_i = 0; y < doc.rows; y++, py += font.height) {
        if (py == 100 * font.height) {
            py = 0;
            canvas_i += 1;
        }
        for (let x = 0, px = 0; x < doc.columns; x++, px += font.width, i++) {
            const block = doc.data[i];
            if (block.bg >= 8 && !block.bg_rgb) {
                font.draw_bg(blink_on_collection[canvas_i].ctx, block.bg - 8, px, py);
                font.draw(blink_off_collection[canvas_i].ctx, {fg: block.fg, bg: block.bg - 8, code: block.code, fg_rgb: block.fg_rgb, bg_rgb: block.bg_rgb}, px, py);
            }
        }
    }
    return {
        columns: doc.columns,
        rows: doc.rows,
        width: doc.columns * font.width,
        height: doc.rows * font.height,
        ice_color_collection: canvases,
        blink_on_collection: blink_on_collection.map((blink_on => blink_on.canvas)),
        blink_off_collection: blink_off_collection.map((blink_off => blink_off.canvas)),
        preview_collection: copy_canvases(canvases).map((collection => collection.canvas)),
        maximum_rows,
        font: font
    };
}

function render_at(render, x, y, block) {
    const i = Math.floor(y / render.maximum_rows);
    const px = x * render.font.width;
    const py = (y % render.maximum_rows) * render.font.height;
    render.font.draw(render.ice_color_collection[i].getContext("2d"), block, px, py);
    render.font.draw(render.preview_collection[i].getContext("2d"), block, px, py);
    if (block.bg < 8) {
        render.font.draw(render.blink_on_collection[i].getContext("2d"), block, px, py);
        render.font.draw(render.blink_off_collection[i].getContext("2d"), block, px, py);
    } else {
        render.font.draw_bg(render.blink_on_collection[i].getContext("2d"), block.bg - 8, px, py);
        render.font.draw(render.blink_off_collection[i].getContext("2d"), {code: block.code, fg: block.fg, bg: block.bg - 8}, px, py);
    }
}

function flip_code_x(code) {
    switch (code) {
        case 40: return 41;
        case 41: return 40;
        case 47: return 92;
        case 60: return 62;
        case 62: return 60;
        case 91: return 93;
        case 92: return 47;
        case 93: return 91;
        case 123: return 125;
        case 125: return 123;
        case 169: return 170;
        case 170: return 169;
        case 174: return 175;
        case 175: return 174;
        case 180: return 195;
        case 181: return 198;
        case 182: return 199;
        case 183: return 214;
        case 185: return 204;
        case 187: return 201;
        case 188: return 200;
        case 189: return 211;
        case 195: return 180;
        case 198: return 181;
        case 190: return 212;
        case 191: return 218;
        case 192: return 217;
        case 199: return 182;
        case 200: return 188;
        case 201: return 187;
        case 204: return 185;
        case 211: return 189;
        case 214: return 183;
        case 212: return 190;
        case 217: return 192;
        case 218: return 191;
        case 221: return 222;
        case 222: return 221;
        case 242: return 243;
        case 243: return 242;
        default: return code;
    }
}

function flip_x(blocks) {
    const new_data = Array(blocks.data.length);
    for (let y = 0, i = 0; y < blocks.rows; y++) {
        for (let x = 0; x < blocks.columns; x++, i++) {
            new_data[blocks.columns * y + blocks.columns - 1 - x] = Object.assign({...blocks.data[i], code: flip_code_x(blocks.data[i].code)});
        }
    }
    blocks.data = new_data;
    return blocks;
}

function flip_code_y(code) {
    switch (code) {
        case 183: return 189;
        case 184: return 190;
        case 187: return 188;
        case 188: return 187;
        case 189: return 183;
        case 190: return 184;
        case 191: return 217;
        case 192: return 218;
        case 193: return 194;
        case 194: return 193;
        case 200: return 201;
        case 201: return 200;
        case 202: return 203;
        case 203: return 202;
        case 207: return 209;
        case 208: return 210;
        case 209: return 207;
        case 210: return 208;
        case 211: return 214;
        case 212: return 213;
        case 213: return 212;
        case 214: return 211;
        case 217: return 191;
        case 218: return 192;
        case 220: return 223;
        case 223: return 220;
        default: return code;
    }
}

function flip_y(blocks) {
    const new_data = Array(blocks.data.length);
    for (let y = 0, i = 0; y < blocks.rows; y++) {
        for (let x = 0; x < blocks.columns; x++, i++) {
            new_data[blocks.columns * (blocks.rows - 1 - y) + x] = Object.assign({...blocks.data[i], code: flip_code_y(blocks.data[i].code)});
        }
    }
    blocks.data = new_data;
    return blocks;
}

function rotate_code(code) {
    // TODO: more cases; http://www.asciitable.com
    switch (code) {
        case 220: return 221;
        case 221: return 223;
        case 222: return 220;
        case 187: return 188;
        case 221: return 223;
        case 223: return 222;
        default: return code;
    }
}

function rotate(blocks) {
    const new_data = Array(blocks.data.length);
    const new_columns = blocks.rows, new_rows = blocks.columns;
    for (let y = 0, i = 0; y < new_rows; y++) {
        for (let x = 0; x < new_columns; x++, i++) {
            const j = (new_columns - 1 - x) * blocks.columns + y;
            new_data[i] = Object.assign({...blocks.data[j], code: rotate_code(blocks.data[j].code)});
        }
    }
    blocks.data = new_data;
    blocks.columns = new_columns;
    blocks.rows = new_rows;
    return blocks;
}

function new_document({columns = 80, rows = 100, title = "", author = "", group = "", date = "", palette = ega, font_name = "IBM VGA", ice_colors = false, use_9px_font = false, comments = "", data} = {}) {
    const doc = {columns, rows, title, author, group, date: (date != "") ? date : current_date(), palette, font_name, ice_colors, use_9px_font, comments};
    if (!data || data.length != columns * rows) {
        doc.data = new Array(columns * rows);
        for (let i = 0; i < doc.data.length; i++) doc.data[i] = {fg: 7, bg: 0, code: 32};
    } else {
        doc.data = data;
    }
    return doc;
}

function get_data_url(canvases) {
    return join_canvases(canvases).toDataURL("image/png");
}

function compress(doc) {
    const compressed_data = {code: [], fg: [], bg: []};
    for (let i = 0, code_repeat = 0, fg_repeat = 0, bg_repeat = 0; i < doc.data.length; i++) {
        const block = doc.data[i];
        if (i + 1 == doc.data.length) {
            compressed_data.code.push([block.code, code_repeat]);
            compressed_data.fg.push([block.fg, fg_repeat]);
            compressed_data.bg.push([block.bg, bg_repeat]);
        } else {
            const next_block = doc.data[i + 1];
            if (block.code != next_block.code) {
                compressed_data.code.push([block.code, code_repeat]);
                code_repeat = 0;
            } else {
                code_repeat += 1;
            }
            if (block.fg != next_block.fg) {
                compressed_data.fg.push([block.fg, fg_repeat]);
                fg_repeat = 0;
            } else {
                fg_repeat += 1;
            }
            if (block.bg != next_block.bg) {
                compressed_data.bg.push([block.bg, bg_repeat]);
                bg_repeat = 0;
            } else {
                bg_repeat += 1;
            }
        }
    }
    return {columns: doc.columns, rows: doc.rows, title: doc.title, author: doc.author, group: doc.group, date: doc.date, palette: doc.palette, font_name: doc.font_name, ice_colors: doc.ice_colors, use_9px_font: doc.use_9px_font, comments: doc.comments, compressed_data};
}

function uncompress(doc) {
    if (doc.compressed_data) {
        const codes = [];
        const fgs = [];
        const bgs = [];
        for (const code of doc.compressed_data.code) {
            for (let i = 0; i <= code[1]; i++) codes.push(code[0]);
        }
        for (const fg of doc.compressed_data.fg) {
            for (let i = 0; i <= fg[1]; i++) fgs.push(fg[0]);
        }
        for (const bg of doc.compressed_data.bg) {
            for (let i = 0; i <= bg[1]; i++) bgs.push(bg[0]);
        }
        doc.data = new Array(codes.length);
        for (let i = 0; i < doc.data.length; i++) doc.data[i] = {code: codes[i], fg: fgs[i], bg: bgs[i]};
        delete doc.compressed_data;
    }
    return doc;
}

function get_blocks(doc, sx, sy, dx, dy, opts) {
    dx = Math.min(doc.columns - 1, dx);
    dy = Math.min(doc.rows - 1, dy);
    const columns = dx - sx + 1;
    const rows = dy - sy + 1;
    const blocks = {columns, rows, data: new Array(columns * rows), ...opts};
    for (let y = sy, i = 0; y <= dy; y++) {
        for (let x = sx; x <= dx; x++, i++) {
            blocks.data[i] = Object.assign(doc.data[y * doc.columns + x]);
        }
    }
    return blocks;
}

function export_as_png(doc, render, file) {
    const base64_string = get_data_url(doc.ice_colors ? render.ice_color_collection : render.blink_off_collection).split(";base64,").pop();
    fs.writeFileSync(file, base64_string, "base64");
}

module.exports = {read_bytes, read_file, write_file, animate, render, render_split, render_at, new_document, resize_canvas, cp437_to_unicode, cp437_to_unicode_bytes, unicode_to_cp437, render_blocks, merge_blocks, flip_code_x, flip_x, flip_y, rotate, get_data_url, convert_ega_to_style, compress, uncompress, get_blocks, export_as_png};

},{"./ansi":1,"./binary_text":2,"./canvas":3,"./encodings":4,"./font":5,"./palette":7,"./textmode":8,"./xbin":9,"fs":14,"path":29}],7:[function(require,module,exports){
const black = {r: 0, g: 0, b: 0};
const blue = {r: 0, g: 0, b: 42};
const green = {r: 0, g: 42, b:   0};
const cyan = {r: 0, g: 42, b: 42};
const red = {r: 42, g: 0, b: 0};
const magenta = {r: 42, g: 0, b: 42};
const yellow = {r: 42, g: 21, b: 0};
const white = {r: 42, g: 42, b: 42};
const bright_black = {r: 21, g: 21, b: 21};
const bright_blue = {r: 21, g: 21, b: 63};
const bright_green = {r: 21, g: 63, b: 21};
const bright_cyan = {r: 21, g: 63, b: 63};
const bright_red = {r: 63, g: 21, b: 21};
const bright_magenta = {r: 63, g: 21, b: 63};
const bright_yellow = {r: 63, g: 63, b: 21};
const bright_white = {r: 63, g: 63, b: 63};

const ega = [black, blue, green, cyan, red, magenta, yellow, white, bright_black, bright_blue, bright_green, bright_cyan, bright_red, bright_magenta, bright_yellow, bright_white];

function get_rgba(rgb) {
    return new Uint8Array([rgb.r, rgb.g, rgb.b, 255]);
}

function convert_6bits_to_8bits(value) {
    return (value << 2) | ((value & 0x30) >> 4);
}

function convert_ega_to_vga(rgb) {
    return {
        r: convert_6bits_to_8bits(rgb.r),
        g: convert_6bits_to_8bits(rgb.g),
        b: convert_6bits_to_8bits(rgb.b)
    };
}

function convert_rgb_to_style(rgb) {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function convert_ega_to_style(rgb) {
    return convert_rgb_to_style(convert_ega_to_vga(rgb));
}

module.exports = {white, bright_white, ega, get_rgba, convert_ega_to_vga, convert_ega_to_style};

},{}],8:[function(require,module,exports){
(function (Buffer){
function bytes_to_blocks({columns, rows, bytes}) {
    const data = new Array(columns * rows);
    for (let i = 0, j = 0; i < data.length; i++, j++) {
        data[i] = {code: bytes[j++], bg: bytes[j] >> 4, fg: bytes[j] & 0xf};
    }
    return data;
}

class Sauce {
    constructor({columns, rows, title = "", author = "", group = "", date, filesize = 0, ice_colors = false, use_9px_font = false, font_name = "IBM VGA", comments = ""} = {}) {
        this.columns = columns;
        this.rows = rows;
        this.title = title;
        this.author = author;
        this.group = group;
        this.date = date;
        this.filesize = filesize;
        this.ice_colors = ice_colors;
        this.use_9px_font = use_9px_font;
        this.font_name = font_name;
        this.comments = comments;
    }
}

function add_text(bytes, pos, text, max_length) {
    for (let i = 0; i < max_length; i += 1) {
        if (i < text.length) {
            bytes[pos + i] = text.charCodeAt(i);
        } else {
            bytes[pos + i] = 32;
        }
    }
}

function current_date() {
    const date = new Date();
    const year = date.getFullYear().toString(10);
    const month = (date.getMonth() + 1).toString(10).padStart(2, "0");
    const day = date.getDate().toString(10).padStart(2, "0");
    return `${year}${month}${day}`;
}

const data_type_types = {CHARACTER: 1, BIN: 5, XBIN: 6};
const file_type_types = {NONE: 0, ANS_FILETYPE: 1};

function add_comments_bytes(comments, sauce_bytes) {
    const comment_bytes = Buffer.from(comments, "utf-8");
    const bytes = new Uint8Array(5 + comment_bytes.length);
    bytes.set(Buffer.from("COMNT", "utf-8"), 0);
    bytes.set(comment_bytes, 5);
    const merged_bytes = new Uint8Array(bytes.length + sauce_bytes.length);
    merged_bytes.set(bytes, 0);
    merged_bytes.set(sauce_bytes, bytes.length);
    return merged_bytes;
}

function add_sauce_bytes({doc, data_type, file_type, bytes: file_bytes}) {
    let bytes = new Uint8Array(128);
    add_text(bytes, 0, "SAUCE00", 7);
    bytes.set(Buffer.from(doc.title, "utf-8"), 7);
    bytes.set(Buffer.from(doc.author, "utf-8"), 42);
    bytes.set(Buffer.from(doc.group, "utf-8"), 62);
    add_text(bytes, 82, current_date(), 8);
    bytes[90] = file_bytes.length & 0xff;
    bytes[91] = (file_bytes.length >> 8) & 0xff;
    bytes[92] = (file_bytes.length >> 16) & 0xff;
    bytes[93] = file_bytes.length >> 24;
    bytes[94] = data_type;
    if (data_type == data_type_types.BIN) {
        bytes[95] = doc.columns / 2;
    } else {
        bytes[95] = file_type;
        bytes[96] = doc.columns & 0xff;
        bytes[97] = doc.columns >> 8;
        bytes[98] = doc.rows & 0xff;
        bytes[99] = doc.rows >> 8;
    }
    bytes[104] = doc.comments.length / 64;
    if (data_type != data_type_types.XBIN) {
        if (doc.ice_colors) {
            bytes[105] = 1;
        }
        if (doc.use_9px_font) {
            bytes[105] += 1 << 2;
        } else {
            bytes[105] += 1 << 1;
        }
        if (doc.font_name) add_text(bytes, 106, doc.font_name, doc.font_name.length);
    }
    if (doc.comments.length) bytes = add_comments_bytes(doc.comments, bytes);
    const merged_bytes = new Int8Array(file_bytes.length + 1 + bytes.length);
    merged_bytes.set(file_bytes, 0);
    merged_bytes[file_bytes.length] = 26;
    merged_bytes.set(bytes, file_bytes.length + 1);
    return merged_bytes;
}

function add_sauce_for_ans({doc, bytes}) {
    return add_sauce_bytes({doc, data_type: data_type_types.CHARACTER, file_type: file_type_types.ANS_FILETYPE, bytes});
}

function add_sauce_for_bin({doc, bytes}) {
    return add_sauce_bytes({doc, data_type: data_type_types.BIN, file_type: file_type_types.NONE, bytes});
}

function add_sauce_for_xbin({doc, bytes}) {
    return add_sauce_bytes({doc, data_type: data_type_types.XBIN, file_type: file_type_types.NONE, bytes});
}

function bytes_to_utf8(bytes, offset, size) {
    return bytes.subarray(offset, offset + size).toString("utf8");
}

function get_sauce(bytes) {
    if (bytes.length >= 128) {
        const sauce_bytes = bytes.slice(-128);
        if (bytes_to_utf8(sauce_bytes, 0, 5) == "SAUCE" && bytes_to_utf8(sauce_bytes, 5, 2) == "00") {
            const title = bytes_to_utf8(sauce_bytes, 7, 35);
            const author = bytes_to_utf8(sauce_bytes, 42, 20);
            const group = bytes_to_utf8(sauce_bytes, 62, 20);
            const date = bytes_to_utf8(sauce_bytes, 82, 8);
            let filesize = (sauce_bytes[93] << 24) + (sauce_bytes[92] << 16) + (sauce_bytes[91] << 8) + sauce_bytes[90];
            const datatype = sauce_bytes[94];
            let columns, rows;
            if (datatype == 5) {
                columns = sauce_bytes[95] * 2;
                rows = filesize / columns / 2;
            } else {
                columns = (sauce_bytes[97] << 8) + sauce_bytes[96];
                rows = (sauce_bytes[99] << 8) + sauce_bytes[98];
            }
            const number_of_comments = sauce_bytes[104];
            const comments = bytes.subarray(bytes.length - (number_of_comments * 64) - 128, bytes.length - 128).toString("utf-8");
            const flags = sauce_bytes[105];
            const ice_colors = (flags & 0x01) == 1;
            const use_9px_font = (flags >> 1 & 0x02) == 2;
            let font_name = bytes_to_utf8(sauce_bytes, 106, 22).replace(/\0/g, "");
            if (font_name == "") font_name = "IBM VGA";
            if (filesize == 0) {
                filesize = bytes.length = 128;
                if (number_of_comments) filesize -= number_of_comments * 64 + 5;
            }
            return new Sauce({columns, rows, title, author, group, date, filesize, ice_colors, use_9px_font, font_name, comments});
        }
    }
    const sauce = new Sauce();
    sauce.filesize = bytes.length;
    return sauce;
}

class Textmode {
    constructor(bytes) {
        const sauce = get_sauce(bytes);
        this.columns = sauce.columns;
        this.rows = sauce.rows;
        this.title = sauce.title;
        this.author = sauce.author;
        this.group = sauce.group;
        this.date = sauce.date;
        this.filesize = sauce.filesize;
        this.ice_colors = sauce.ice_colors;
        this.use_9px_font = sauce.use_9px_font;
        this.font_name = sauce.font_name;
        this.comments = sauce.comments;
        this.bytes = bytes.subarray(0, this.filesize);
    }
}

function resize_canvas(doc, columns, rows) {
    const min_rows = Math.min(doc.rows, rows);
    const min_columns = Math.min(doc.columns, columns);
    const new_data = new Array(columns * rows);
    for (let i = 0; i < new_data.length; i++) {
        new_data[i] = ({code: 32, fg: 7, bg: 0});
    }
    for (let y = 0; y < min_rows; y++) {
        for (let x = 0; x < min_columns; x++) {
            new_data[y * columns + x] = doc.data[y * doc.columns + x];
        }
    }
    doc.data = new_data;
    doc.columns = columns;
    doc.rows = rows;
}

module.exports = {bytes_to_blocks, bytes_to_utf8, current_date, Textmode, add_sauce_for_ans, add_sauce_for_bin, add_sauce_for_xbin, resize_canvas};

}).call(this,require("buffer").Buffer)
},{"buffer":15}],9:[function(require,module,exports){
const {ega} = require("./palette");
const {bytes_to_utf8, bytes_to_blocks, Textmode, add_sauce_for_xbin} = require("./textmode");
const repeating = {NONE: 0, CHARACTERS: 1, ATTRIBUTES: 2, BOTH_CHARACTERS_AND_ATTRIBUTES: 3};
const {encode_as_bin} = require("./binary_text");

function uncompress({bytes, columns, rows}) {
    const data = new Array(columns * rows);
    for (let i = 0, j = 0; i < bytes.length;) {
        const value = bytes[i++];
        const count = value & 63;
        switch (value >> 6) {
            case repeating.NONE:
            for (let k = 0; k <= count; i += 2, j++, k++) {
                data[j] = {code: bytes[i], bg: bytes[i + 1] >> 4, fg: bytes[i + 1] & 0xf};
            }
            break;
            case repeating.CHARACTERS:
            for (let k = 0, code = bytes[i++]; k <= count; i++, k++, j++) {
                data[j] = {code, bg: bytes[i] >> 4, fg: bytes[i] & 0xf};
            }
            break;
            case repeating.ATTRIBUTES:
            for (let k = 0, bg = bytes[i] >> 4, fg = bytes[i++] & 0xf; k <= count; i++, j++, k++) {
                data[j] = {code: bytes[i], bg, fg};
            }
            break;
            case repeating.BOTH_CHARACTERS_AND_ATTRIBUTES:
            for (let k = 0, code = bytes[i++], bg = bytes[i] >> 4, fg = bytes[i++] & 0xf; k <= count; j++, k++) {
                data[j] = {code, bg, fg};
            }
            break;
        }
    }
    return data;
}

class XBin extends Textmode {
    constructor(bytes) {
        super(bytes);
        if (bytes_to_utf8(this.bytes, 0, 4) != "XBIN" | this.bytes[4] != 0x1A) {
            throw("Error whilst attempting to load XBin file: Unexpected header.");
        }
        this.columns = (this.bytes[6] << 8) + this.bytes[5];
        this.rows = (this.bytes[8] << 8) + this.bytes[7];
        this.font_height = this.bytes[9];
        const flags = this.bytes[10];
        const palette_flag = (flags & 1) == 1;
        const font_flag = (flags >> 1 & 1) == 1;
        const compress_flag = (flags >> 2 & 1) == 1;
        this.ice_colors = (flags >> 3 & 1) == 1;
        const font_512_flag = (flags >> 4 & 1) == 1;
        if (font_512_flag) {
            throw("Error whilst attempting to load XBin file: Unsupported font size.");
        }
        let i = 11;
        if (palette_flag) {
            const palette_bytes = this.bytes.subarray(11, 11 + 48);
            this.palette = new Array(16);
            for (let i = 0, j = 0; i < 16; i++, j += 3) {
                this.palette[i] = {r: palette_bytes[j], g: palette_bytes[j + 1], b: palette_bytes[j + 2]};
            }
            i += 48;
        } else {
            this.palette = ega;
        }
        if (font_flag) {
            this.font_bytes = this.bytes.subarray(i, i + 256 * this.font_height);
            i += 256 * this.font_height;
        }
        if (compress_flag) {
            this.data = uncompress({columns: this.columns, rows: this.rows, bytes: this.bytes.subarray(i, i + this.filesize)});
        } else {
            this.data = bytes_to_blocks({columns: this.columns, rows: this.rows, bytes: this.bytes.subarray(i, i + this.filesize)});
        }
    }
}

function encode_as_xbin(doc) {
    let bin_bytes = encode_as_bin(doc);
    let header = [88, 66, 73, 78, 26, doc.columns & 255, doc.columns >> 8, doc.rows & 255, doc.rows >> 8, doc.font_height, 0];
    if (doc.palette) {
        header[10] += 1;
        const palette_bytes = [];
        for (const rgb of doc.palette) {
            palette_bytes.push(rgb.r);
            palette_bytes.push(rgb.g);
            palette_bytes.push(rgb.b);
        }
        header = header.concat(palette_bytes);
    }
    if (doc.font_bytes) {
        header[10] += 1 << 1;
        const font_bytes = [];
        for (const value of doc.font_bytes) {
            font_bytes.push(value);
        }
        header = header.concat(font_bytes);
    }
    if (doc.ice_colors) {
        header[10] += 1 << 3;
    }
    let bytes = new Uint8Array(header.length + bin_bytes.length);
    bytes.set(header, 0);
    bytes.set(bin_bytes, header.length);
    return add_sauce_for_xbin({doc, bytes});
}

module.exports = {XBin, encode_as_xbin};

},{"./binary_text":2,"./palette":7,"./textmode":8}],10:[function(require,module,exports){
const doc = require("./web_doc");
require("./web_canvas");
const linkify = require("linkifyjs/string");
const mobile = (navigator.userAgent.match(/Android/i) || navigator.userAgent.match(/webOS/i) || navigator.userAgent.match(/iPhone/i) || navigator.userAgent.match(/iPad/i) || navigator.userAgent.match(/iPod/i) || navigator.userAgent.match(/BlackBerry/i) || navigator.userAgent.match(/Windows Phone/i));

function sauce(title, author, group, comments) {
    document.getElementById("title").innerText = title;
    document.getElementById("author").innerText = author;
    document.getElementById("group").innerText = group;
    document.getElementById("comments").innerHTML = linkify(comments, {className: "", nl2br: true});
}

doc.on("new_document", () => sauce(doc.title, doc.author, doc.group, doc.comments));
doc.on("sauce", sauce);

document.addEventListener("DOMContentLoaded", (event) => {
    doc.connect_to_server(`${window.location.hostname}${window.location.pathname}`, "");
    if (mobile) document.body.classList.add("mobile");
}, true);

},{"./web_canvas":11,"./web_doc":12,"linkifyjs/string":28}],11:[function(require,module,exports){
const doc = require("./web_doc");
let interval, render;
let mouse_button = false;

function $(name) {
    return document.getElementById(name);
}

function hide(id) {
    $(id).classList.add("hidden");
}

function show(id) {
    $(id).classList.remove("hidden");
}

function start_blinking() {
    let vis_toggle = false;
    $("ice_color_container").style.display = "none";
    $("blink_off_container").style.removeProperty("display");
    if (interval) clearInterval(interval);
    interval = setInterval(() => {
        if (vis_toggle) {
            $("blink_on_container").style.display = "none";
            $("blink_off_container").style.removeProperty("display");
        } else {
            $("blink_off_container").style.display = "none";
            $("blink_on_container").style.removeProperty("display");
        }
        vis_toggle = !vis_toggle;
    }, 300);
}

function stop_blinking() {
    if (interval) clearInterval(interval);
    $("ice_color_container").style.removeProperty("display");
    $("blink_off_container").style.display = "none";
    $("blink_on_container").style.display = "none";
}

function update_frame() {
    const viewport = $("viewport");
    const view_rect = viewport.getBoundingClientRect();
    const view_frame = $("view_frame");
    if (render) {
        const scale_factor = render.width / 260;
        const width = Math.min(Math.ceil(view_rect.width / scale_factor), 260);
        const height = Math.min(Math.ceil(view_rect.height / scale_factor), render.height / scale_factor);
        const top = Math.ceil(viewport.scrollTop / scale_factor);
        const left = Math.ceil(viewport.scrollLeft / scale_factor);
        const preview = $("preview");
        view_frame.style.width = `${width}px`;
        view_frame.style.height = `${height}px`;
        view_frame.style.top = `${top}px`;
        view_frame.style.left = `${20 + left}px`;
        if (top < preview.scrollTop) preview.scrollTop = top;
        const preview_height = preview.getBoundingClientRect().height;
        if (top > preview_height + preview.scrollTop - height - 2) preview.scrollTop = top - preview_height + height + 2;
    }
}

function add(new_render) {
    hide("view_frame");
    const ice_color_container = $("ice_color_container");
    const blink_off_container = $("blink_off_container");
    const blink_on_container = $("blink_on_container");
    const preview = $("preview");
    if (render) {
        for (const canvas of render.ice_color_collection) ice_color_container.removeChild(canvas);
        for (const canvas of render.blink_off_collection) blink_off_container.removeChild(canvas);
        for (const canvas of render.blink_on_collection) blink_on_container.removeChild(canvas);
        for (const canvas of render.preview_collection) preview.removeChild(canvas);
    }
    render = new_render;
    $("canvas_container").style.width = `${render.width}px`;
    $("canvas_container").style.height = `${render.height}px`;
    for (const canvas of render.ice_color_collection) ice_color_container.appendChild(canvas);
    for (const canvas of render.blink_off_collection) blink_off_container.appendChild(canvas);
    for (const canvas of render.blink_on_collection) blink_on_container.appendChild(canvas);
    for (const canvas of render.preview_collection) preview.appendChild(canvas);
    show("view_frame");
    update_frame();
}

function update_with_mouse_pos(client_x, client_y) {
    const preview = $("preview");
    const viewport = $("viewport");
    const preview_rect = preview.getBoundingClientRect();
    const viewport_rect = viewport.getBoundingClientRect();
    const x = client_x - preview_rect.left - 20 + preview.scrollLeft;
    const y = client_y - preview_rect.top + preview.scrollTop;
    const scale_factor = render.width / 260;
    const half_view_width = viewport_rect.width / scale_factor / 2;
    const half_view_height = viewport_rect.height / scale_factor / 2;
    viewport.scrollLeft = Math.floor((x - half_view_width) * scale_factor);
    viewport.scrollTop = Math.floor((y - half_view_height) * scale_factor);
    update_frame();
}

function mouse_down(event) {
    if (event.button == 0) {
        mouse_button = true;
        update_with_mouse_pos(event.clientX, event.clientY);
    }
}

function mouse_move(event) {
    if (mouse_button) update_with_mouse_pos(event.clientX, event.clientY);
}

function unregister_button(event) {
    if (mouse_button) mouse_button = false;
}

window.addEventListener("DOMContentLoaded", (event) => {
    $("viewport").addEventListener("scroll", event => update_frame(), true);
    window.addEventListener("resize", event => update_frame(), true);
    $("preview").addEventListener("mousedown", mouse_down, true);
    $("preview").addEventListener("mousemove", mouse_move, true);
    preview.addEventListener("mouseup", unregister_button, true);
    preview.addEventListener("mouseout", unregister_button, true);
}, true);

doc.on("render", () => add(doc.render));
doc.on("ice_color", (value) => {
    if (value) {
        start_blinking();
    } else {
        stop_blinking();
    }
});
doc.on("use_9px_font", () => add(doc.render));
doc.on("goto_row", (row_no) => goto_row(row_no));
module.export = {update_frame};

},{"./web_doc":12}],12:[function(require,module,exports){
const libtextmode = require("../libtextmode/libtextmode");
const events = require("events");
let doc, render;
const actions =  {CONNECTED: 0, REFUSED: 1, JOIN: 2, LEAVE: 3, CURSOR: 4, SELECTION: 5, RESIZE_SELECTION: 6, OPERATION: 7, HIDE_CURSOR: 8, DRAW: 9, CHAT: 10, STATUS: 11, SAUCE: 12, ICE_COLORS: 13, USE_9PX_FONT: 14, CHANGE_FONT: 15, SET_CANVAS_SIZE: 16, PASTE_AS_SELECTION: 17, ROTATE: 18, FLIP_X: 19, FLIP_Y: 20};
let connection;

class Connection extends events.EventEmitter {
    open() {
        this.ws.send(JSON.stringify({type: actions.CONNECTED, data: {nick: undefined, group: undefined, pass: ""}}));
    }

    disconnected()  {
        this.connected = false;
        this.emit("disconnected");
    }

    message(message) {
        const {type, data} = message;
        if (!this.ready) {
            if (type == actions.CONNECTED) {
                this.connected = true;
                this.id = data.id;
                this.status = data.status;
                this.ready = true;
                this.emit("connected", libtextmode.uncompress(data.doc));
                for (const message of this.queued_messages) this.message(message);
                this.ws.addEventListener("close", () => this.disconnected());
            } else if (type == actions.REFUSED) {
                this.emit("refused");
            } else {
                this.queued_messages.push(message);
            }
        } else {
            switch (type) {
                case actions.DRAW:
                    doc.data[data.y * doc.columns + data.x] = Object.assign(data.block);
                    libtextmode.render_at(render, data.x, data.y, data.block);
                    break;
                case actions.SAUCE:
                    this.emit("sauce", data.title, data.author, data.group, data.comments);
                    break;
                case actions.ICE_COLORS:
                    this.emit("ice_colors", data.value);
                    break;
                case actions.USE_9PX_FONT:
                    this.emit("use_9px_font", data.value);
                    break;
                case actions.CHANGE_FONT:
                    this.emit("change_font", data.font_name);
                    break;
                case actions.SET_CANVAS_SIZE:
                    this.emit("set_canvas_size", data.columns, data.rows);
                    break;
            }
        }
    }

    constructor(server, pass, web = false) {
        super();
        this.connected = false;
        this.server = server;
        this.pass = pass;
        try {
            const {groups} = (/(?<host>[^\/]+)\/?(?<path>[^\/]*)\/?/).exec(server);
            this.host = groups.host;
            this.path = groups.path;
            this.web = web;
            this.queued_messages = [];
            this.ready = false;
            this.ws = new WebSocket(`ws://${encodeURI(groups.host)}:8000/${encodeURI(groups.path)}`);
            this.ws.addEventListener("open", () => this.open(pass));
            this.ws.addEventListener("error", () => this.emit("unable_to_connect"));
            this.ws.addEventListener("message", (resp) => this.message(JSON.parse(resp.data)));
        } catch (err) {
            this.emit("unable_to_connect");
        }
    }
}

class TextModeDoc extends events.EventEmitter {
    async start_rendering() {
        render = await libtextmode.render_split(doc);
        this.emit("render");
    }

    ready() {
        if (!this.init) {
            this.emit("ready");
            this.init = true;
        }
    }

    connect_to_server(server, pass) {
        this.emit("connecting");
        connection = new Connection(server, pass);
        connection.on("connected", async (remote_doc) => {
            this.emit("connected");
            doc = remote_doc;
            await this.start_rendering();
            this.emit("new_document");
            this.ready();
        });
        connection.on("refused", () => this.emit("refused"));
        connection.on("disconnected", () => this.emit("disconnected"));
        connection.on("unable_to_connect", () => this.emit("unable_to_connect"));
        connection.on("ice_colors", (value) => {
            doc.ice_colors = value;
            this.emit("ice_colors", doc.ice_colors);
        });
        connection.on("use_9px_font", (value) => {
            doc.use_9px_font = value;
            this.start_rendering().then(() => this.emit("use_9px_font", doc.use_9px_font));
        });
        connection.on("change_font", (font_name) => {
            doc.font_name = font_name;
            this.start_rendering().then(() => this.emit("change_font", doc.font_name));
        });
        connection.on("sauce", (title, author, group, comments) => {
            doc.title = title;
            doc.author = author;
            doc.group = group;
            doc.comments = comments;
            this.emit("sauce", title, author, group, comments);
        });
        connection.on("set_canvas_size", (columns, rows) => {
            this.undo_history.reset_undos();
            libtextmode.resize_canvas(doc, columns, rows);
            this.start_rendering();
        });
    }

    get connection() {return connection;}
    get render() {return render;}
    get font() {return render.font;}
    get columns() {return doc.columns;}
    get rows() {return doc.rows;}
    get title() {return doc.title;}
    get author() {return doc.author;}
    get group() {return doc.group;}
    get comments() {return doc.comments;}
    get palette() {return doc.palette;}
    get font_name() {return doc.font_name;}
    get ice_colors() {return doc.ice_colors;}
    get use_9px_font() {return doc.use_9px_font;}
    get data() {return doc.data;}

    constructor() {
        super();
        this.init = false;
    }
}

module.exports = new TextModeDoc();

},{"../libtextmode/libtextmode":6,"events":16}],13:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  for (var i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(
      uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)
    ))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],14:[function(require,module,exports){

},{}],15:[function(require,module,exports){
(function (Buffer){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = { __proto__: Uint8Array.prototype, foo: function () { return 42 } }
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species != null &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value)
  }

  if (value == null) {
    throw TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
      'or Array-like Object. Received type ' + (typeof value)
    )
  }

  if (isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    )
  }

  var valueOf = value.valueOf && value.valueOf()
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length)
  }

  var b = fromObject(value)
  if (b) return b

  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
      typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(
      value[Symbol.toPrimitive]('string'), encodingOrOffset, length
    )
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
    'or Array-like Object. Received type ' + (typeof value)
  )
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0)
    }
    return fromArrayLike(obj)
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data)
  }
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true &&
    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
}

Buffer.compare = function compare (a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength)
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength)
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError(
      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
    )
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
      'Received type ' + typeof string
    )
  }

  var len = string.length
  var mustMatch = (arguments.length > 2 && arguments[2] === true)
  if (!mustMatch && len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
        }
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim()
  if (this.length > max) str += ' ... '
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength)
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError(
      'The "target" argument must be one of type Buffer or Uint8Array. ' +
      'Received type ' + (typeof target)
    )
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
          : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : Buffer.from(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance (obj, type) {
  return obj instanceof type ||
    (obj != null && obj.constructor != null && obj.constructor.name != null &&
      obj.constructor.name === type.name)
}
function numberIsNaN (obj) {
  // For IE11 support
  return obj !== obj // eslint-disable-line no-self-compare
}

}).call(this,require("buffer").Buffer)
},{"base64-js":13,"buffer":15,"ieee754":17}],16:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var objectCreate = Object.create || objectCreatePolyfill
var objectKeys = Object.keys || objectKeysPolyfill
var bind = Function.prototype.bind || functionBindPolyfill

function EventEmitter() {
  if (!this._events || !Object.prototype.hasOwnProperty.call(this, '_events')) {
    this._events = objectCreate(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

var hasDefineProperty;
try {
  var o = {};
  if (Object.defineProperty) Object.defineProperty(o, 'x', { value: 0 });
  hasDefineProperty = o.x === 0;
} catch (err) { hasDefineProperty = false }
if (hasDefineProperty) {
  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function() {
      return defaultMaxListeners;
    },
    set: function(arg) {
      // check whether the input is a positive number (whose value is zero or
      // greater and not a NaN).
      if (typeof arg !== 'number' || arg < 0 || arg !== arg)
        throw new TypeError('"defaultMaxListeners" must be a positive number');
      defaultMaxListeners = arg;
    }
  });
} else {
  EventEmitter.defaultMaxListeners = defaultMaxListeners;
}

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    if (arguments.length > 1)
      er = arguments[1];
    if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Unhandled "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
      // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
      // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = objectCreate(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
          listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
            existing.length + ' "' + String(type) + '" listeners ' +
            'added. Use emitter.setMaxListeners() to ' +
            'increase limit.');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        if (typeof console === 'object' && console.warn) {
          console.warn('%s: %s', w.name, w.message);
        }
      }
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    switch (arguments.length) {
      case 0:
        return this.listener.call(this.target);
      case 1:
        return this.listener.call(this.target, arguments[0]);
      case 2:
        return this.listener.call(this.target, arguments[0], arguments[1]);
      case 3:
        return this.listener.call(this.target, arguments[0], arguments[1],
            arguments[2]);
      default:
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i)
          args[i] = arguments[i];
        this.listener.apply(this.target, args);
    }
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = bind.call(onceWrapper, state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = objectCreate(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else
          spliceOne(list, position);

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = objectCreate(null);
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = objectCreate(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = objectKeys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = objectCreate(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (!events)
    return [];

  var evlistener = events[type];
  if (!evlistener)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function objectCreatePolyfill(proto) {
  var F = function() {};
  F.prototype = proto;
  return new F;
}
function objectKeysPolyfill(obj) {
  var keys = [];
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) {
    keys.push(k);
  }
  return k;
}
function functionBindPolyfill(context) {
  var fn = this;
  return function () {
    return fn.apply(context, arguments);
  };
}

},{}],17:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],18:[function(require,module,exports){
'use strict';

exports.__esModule = true;

var _linkify = require('./linkify');

var linkify = _interopRequireWildcard(_linkify);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var tokenize = linkify.tokenize,
    options = linkify.options; /**
                               	Convert strings of text into linkable HTML text
                               */

var Options = options.Options;


function escapeText(text) {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(href) {
	return href.replace(/"/g, '&quot;');
}

function attributesToString(attributes) {
	if (!attributes) {
		return '';
	}
	var result = [];

	for (var attr in attributes) {
		var val = attributes[attr] + '';
		result.push(attr + '="' + escapeAttr(val) + '"');
	}
	return result.join(' ');
}

function linkifyStr(str) {
	var opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

	opts = new Options(opts);

	var tokens = tokenize(str);
	var result = [];

	for (var i = 0; i < tokens.length; i++) {
		var token = tokens[i];

		if (token.type === 'nl' && opts.nl2br) {
			result.push('<br>\n');
			continue;
		} else if (!token.isLink || !opts.check(token)) {
			result.push(escapeText(token.toString()));
			continue;
		}

		var _opts$resolve = opts.resolve(token),
		    formatted = _opts$resolve.formatted,
		    formattedHref = _opts$resolve.formattedHref,
		    tagName = _opts$resolve.tagName,
		    className = _opts$resolve.className,
		    target = _opts$resolve.target,
		    attributes = _opts$resolve.attributes;

		var link = '<' + tagName + ' href="' + escapeAttr(formattedHref) + '"';

		if (className) {
			link += ' class="' + escapeAttr(className) + '"';
		}

		if (target) {
			link += ' target="' + escapeAttr(target) + '"';
		}

		if (attributes) {
			link += ' ' + attributesToString(attributes);
		}

		link += '>' + escapeText(formatted) + '</' + tagName + '>';
		result.push(link);
	}

	return result.join('');
}

if (!String.prototype.linkify) {
	try {
		Object.defineProperty(String.prototype, 'linkify', {
			set: function set() {},
			get: function get() {
				return function linkify(opts) {
					return linkifyStr(this, opts);
				};
			}
		});
	} catch (e) {
		// IE 8 doesn't like Object.defineProperty on non-DOM objects
		if (!String.prototype.linkify) {
			String.prototype.linkify = function (opts) {
				return linkifyStr(this, opts);
			};
		}
	}
}

exports.default = linkifyStr;
},{"./linkify":19}],19:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports.tokenize = exports.test = exports.scanner = exports.parser = exports.options = exports.inherits = exports.find = undefined;

var _class = require('./linkify/utils/class');

var _options = require('./linkify/utils/options');

var options = _interopRequireWildcard(_options);

var _scanner = require('./linkify/core/scanner');

var scanner = _interopRequireWildcard(_scanner);

var _parser = require('./linkify/core/parser');

var parser = _interopRequireWildcard(_parser);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

if (!Array.isArray) {
	Array.isArray = function (arg) {
		return Object.prototype.toString.call(arg) === '[object Array]';
	};
}

/**
	Converts a string into tokens that represent linkable and non-linkable bits
	@method tokenize
	@param {String} str
	@return {Array} tokens
*/
var tokenize = function tokenize(str) {
	return parser.run(scanner.run(str));
};

/**
	Returns a list of linkable items in the given string.
*/
var find = function find(str) {
	var type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

	var tokens = tokenize(str);
	var filtered = [];

	for (var i = 0; i < tokens.length; i++) {
		var token = tokens[i];
		if (token.isLink && (!type || token.type === type)) {
			filtered.push(token.toObject());
		}
	}

	return filtered;
};

/**
	Is the given string valid linkable text of some sort
	Note that this does not trim the text for you.

	Optionally pass in a second `type` param, which is the type of link to test
	for.

	For example,

		test(str, 'email');

	Will return `true` if str is a valid email.
*/
var test = function test(str) {
	var type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

	var tokens = tokenize(str);
	return tokens.length === 1 && tokens[0].isLink && (!type || tokens[0].type === type);
};

// Scanner and parser provide states and tokens for the lexicographic stage
// (will be used to add additional link types)
exports.find = find;
exports.inherits = _class.inherits;
exports.options = options;
exports.parser = parser;
exports.scanner = scanner;
exports.test = test;
exports.tokenize = tokenize;
},{"./linkify/core/parser":20,"./linkify/core/scanner":21,"./linkify/utils/class":26,"./linkify/utils/options":27}],20:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports.start = exports.run = exports.TOKENS = exports.State = undefined;

var _state = require('./state');

var _multi = require('./tokens/multi');

var MULTI_TOKENS = _interopRequireWildcard(_multi);

var _text = require('./tokens/text');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

/**
	Not exactly parser, more like the second-stage scanner (although we can
	theoretically hotswap the code here with a real parser in the future... but
	for a little URL-finding utility abstract syntax trees may be a little
	overkill).

	URL format: http://en.wikipedia.org/wiki/URI_scheme
	Email format: http://en.wikipedia.org/wiki/Email_address (links to RFC in
	reference)

	@module linkify
	@submodule parser
	@main parser
*/

var makeState = function makeState(tokenClass) {
	return new _state.TokenState(tokenClass);
};

// The universal starting state.
var S_START = makeState();

// Intermediate states for URLs. Note that domains that begin with a protocol
// are treated slighly differently from those that don't.
var S_PROTOCOL = makeState(); // e.g., 'http:'
var S_MAILTO = makeState(); // 'mailto:'
var S_PROTOCOL_SLASH = makeState(); // e.g., '/', 'http:/''
var S_PROTOCOL_SLASH_SLASH = makeState(); // e.g., '//', 'http://'
var S_DOMAIN = makeState(); // parsed string ends with a potential domain name (A)
var S_DOMAIN_DOT = makeState(); // (A) domain followed by DOT
var S_TLD = makeState(_multi.URL); // (A) Simplest possible URL with no query string
var S_TLD_COLON = makeState(); // (A) URL followed by colon (potential port number here)
var S_TLD_PORT = makeState(_multi.URL); // TLD followed by a port number
var S_URL = makeState(_multi.URL); // Long URL with optional port and maybe query string
var S_URL_NON_ACCEPTING = makeState(); // URL followed by some symbols (will not be part of the final URL)
var S_URL_OPENBRACE = makeState(); // URL followed by {
var S_URL_OPENBRACKET = makeState(); // URL followed by [
var S_URL_OPENANGLEBRACKET = makeState(); // URL followed by <
var S_URL_OPENPAREN = makeState(); // URL followed by (
var S_URL_OPENBRACE_Q = makeState(_multi.URL); // URL followed by { and some symbols that the URL can end it
var S_URL_OPENBRACKET_Q = makeState(_multi.URL); // URL followed by [ and some symbols that the URL can end it
var S_URL_OPENANGLEBRACKET_Q = makeState(_multi.URL); // URL followed by < and some symbols that the URL can end it
var S_URL_OPENPAREN_Q = makeState(_multi.URL); // URL followed by ( and some symbols that the URL can end it
var S_URL_OPENBRACE_SYMS = makeState(); // S_URL_OPENBRACE_Q followed by some symbols it cannot end it
var S_URL_OPENBRACKET_SYMS = makeState(); // S_URL_OPENBRACKET_Q followed by some symbols it cannot end it
var S_URL_OPENANGLEBRACKET_SYMS = makeState(); // S_URL_OPENANGLEBRACKET_Q followed by some symbols it cannot end it
var S_URL_OPENPAREN_SYMS = makeState(); // S_URL_OPENPAREN_Q followed by some symbols it cannot end it
var S_EMAIL_DOMAIN = makeState(); // parsed string starts with local email info + @ with a potential domain name (C)
var S_EMAIL_DOMAIN_DOT = makeState(); // (C) domain followed by DOT
var S_EMAIL = makeState(_multi.EMAIL); // (C) Possible email address (could have more tlds)
var S_EMAIL_COLON = makeState(); // (C) URL followed by colon (potential port number here)
var S_EMAIL_PORT = makeState(_multi.EMAIL); // (C) Email address with a port
var S_MAILTO_EMAIL = makeState(_multi.MAILTOEMAIL); // Email that begins with the mailto prefix (D)
var S_MAILTO_EMAIL_NON_ACCEPTING = makeState(); // (D) Followed by some non-query string chars
var S_LOCALPART = makeState(); // Local part of the email address
var S_LOCALPART_AT = makeState(); // Local part of the email address plus @
var S_LOCALPART_DOT = makeState(); // Local part of the email address plus '.' (localpart cannot end in .)
var S_NL = makeState(_multi.NL); // single new line

// Make path from start to protocol (with '//')
S_START.on(_text.NL, S_NL).on(_text.PROTOCOL, S_PROTOCOL).on(_text.MAILTO, S_MAILTO).on(_text.SLASH, S_PROTOCOL_SLASH);

S_PROTOCOL.on(_text.SLASH, S_PROTOCOL_SLASH);
S_PROTOCOL_SLASH.on(_text.SLASH, S_PROTOCOL_SLASH_SLASH);

// The very first potential domain name
S_START.on(_text.TLD, S_DOMAIN).on(_text.DOMAIN, S_DOMAIN).on(_text.LOCALHOST, S_TLD).on(_text.NUM, S_DOMAIN);

// Force URL for protocol followed by anything sane
S_PROTOCOL_SLASH_SLASH.on(_text.TLD, S_URL).on(_text.DOMAIN, S_URL).on(_text.NUM, S_URL).on(_text.LOCALHOST, S_URL);

// Account for dots and hyphens
// hyphens are usually parts of domain names
S_DOMAIN.on(_text.DOT, S_DOMAIN_DOT);
S_EMAIL_DOMAIN.on(_text.DOT, S_EMAIL_DOMAIN_DOT);

// Hyphen can jump back to a domain name

// After the first domain and a dot, we can find either a URL or another domain
S_DOMAIN_DOT.on(_text.TLD, S_TLD).on(_text.DOMAIN, S_DOMAIN).on(_text.NUM, S_DOMAIN).on(_text.LOCALHOST, S_DOMAIN);

S_EMAIL_DOMAIN_DOT.on(_text.TLD, S_EMAIL).on(_text.DOMAIN, S_EMAIL_DOMAIN).on(_text.NUM, S_EMAIL_DOMAIN).on(_text.LOCALHOST, S_EMAIL_DOMAIN);

// S_TLD accepts! But the URL could be longer, try to find a match greedily
// The `run` function should be able to "rollback" to the accepting state
S_TLD.on(_text.DOT, S_DOMAIN_DOT);
S_EMAIL.on(_text.DOT, S_EMAIL_DOMAIN_DOT);

// Become real URLs after `SLASH` or `COLON NUM SLASH`
// Here PSS and non-PSS converge
S_TLD.on(_text.COLON, S_TLD_COLON).on(_text.SLASH, S_URL);
S_TLD_COLON.on(_text.NUM, S_TLD_PORT);
S_TLD_PORT.on(_text.SLASH, S_URL);
S_EMAIL.on(_text.COLON, S_EMAIL_COLON);
S_EMAIL_COLON.on(_text.NUM, S_EMAIL_PORT);

// Types of characters the URL can definitely end in
var qsAccepting = [_text.DOMAIN, _text.AT, _text.LOCALHOST, _text.NUM, _text.PLUS, _text.POUND, _text.PROTOCOL, _text.SLASH, _text.TLD, _text.UNDERSCORE, _text.SYM, _text.AMPERSAND];

// Types of tokens that can follow a URL and be part of the query string
// but cannot be the very last characters
// Characters that cannot appear in the URL at all should be excluded
var qsNonAccepting = [_text.COLON, _text.DOT, _text.QUERY, _text.PUNCTUATION, _text.CLOSEBRACE, _text.CLOSEBRACKET, _text.CLOSEANGLEBRACKET, _text.CLOSEPAREN, _text.OPENBRACE, _text.OPENBRACKET, _text.OPENANGLEBRACKET, _text.OPENPAREN];

// These states are responsible primarily for determining whether or not to
// include the final round bracket.

// URL, followed by an opening bracket
S_URL.on(_text.OPENBRACE, S_URL_OPENBRACE).on(_text.OPENBRACKET, S_URL_OPENBRACKET).on(_text.OPENANGLEBRACKET, S_URL_OPENANGLEBRACKET).on(_text.OPENPAREN, S_URL_OPENPAREN);

// URL with extra symbols at the end, followed by an opening bracket
S_URL_NON_ACCEPTING.on(_text.OPENBRACE, S_URL_OPENBRACE).on(_text.OPENBRACKET, S_URL_OPENBRACKET).on(_text.OPENANGLEBRACKET, S_URL_OPENANGLEBRACKET).on(_text.OPENPAREN, S_URL_OPENPAREN);

// Closing bracket component. This character WILL be included in the URL
S_URL_OPENBRACE.on(_text.CLOSEBRACE, S_URL);
S_URL_OPENBRACKET.on(_text.CLOSEBRACKET, S_URL);
S_URL_OPENANGLEBRACKET.on(_text.CLOSEANGLEBRACKET, S_URL);
S_URL_OPENPAREN.on(_text.CLOSEPAREN, S_URL);
S_URL_OPENBRACE_Q.on(_text.CLOSEBRACE, S_URL);
S_URL_OPENBRACKET_Q.on(_text.CLOSEBRACKET, S_URL);
S_URL_OPENANGLEBRACKET_Q.on(_text.CLOSEANGLEBRACKET, S_URL);
S_URL_OPENPAREN_Q.on(_text.CLOSEPAREN, S_URL);
S_URL_OPENBRACE_SYMS.on(_text.CLOSEBRACE, S_URL);
S_URL_OPENBRACKET_SYMS.on(_text.CLOSEBRACKET, S_URL);
S_URL_OPENANGLEBRACKET_SYMS.on(_text.CLOSEANGLEBRACKET, S_URL);
S_URL_OPENPAREN_SYMS.on(_text.CLOSEPAREN, S_URL);

// URL that beings with an opening bracket, followed by a symbols.
// Note that the final state can still be `S_URL_OPENBRACE_Q` (if the URL only
// has a single opening bracket for some reason).
S_URL_OPENBRACE.on(qsAccepting, S_URL_OPENBRACE_Q);
S_URL_OPENBRACKET.on(qsAccepting, S_URL_OPENBRACKET_Q);
S_URL_OPENANGLEBRACKET.on(qsAccepting, S_URL_OPENANGLEBRACKET_Q);
S_URL_OPENPAREN.on(qsAccepting, S_URL_OPENPAREN_Q);
S_URL_OPENBRACE.on(qsNonAccepting, S_URL_OPENBRACE_SYMS);
S_URL_OPENBRACKET.on(qsNonAccepting, S_URL_OPENBRACKET_SYMS);
S_URL_OPENANGLEBRACKET.on(qsNonAccepting, S_URL_OPENANGLEBRACKET_SYMS);
S_URL_OPENPAREN.on(qsNonAccepting, S_URL_OPENPAREN_SYMS);

// URL that begins with an opening bracket, followed by some symbols
S_URL_OPENBRACE_Q.on(qsAccepting, S_URL_OPENBRACE_Q);
S_URL_OPENBRACKET_Q.on(qsAccepting, S_URL_OPENBRACKET_Q);
S_URL_OPENANGLEBRACKET_Q.on(qsAccepting, S_URL_OPENANGLEBRACKET_Q);
S_URL_OPENPAREN_Q.on(qsAccepting, S_URL_OPENPAREN_Q);
S_URL_OPENBRACE_Q.on(qsNonAccepting, S_URL_OPENBRACE_Q);
S_URL_OPENBRACKET_Q.on(qsNonAccepting, S_URL_OPENBRACKET_Q);
S_URL_OPENANGLEBRACKET_Q.on(qsNonAccepting, S_URL_OPENANGLEBRACKET_Q);
S_URL_OPENPAREN_Q.on(qsNonAccepting, S_URL_OPENPAREN_Q);

S_URL_OPENBRACE_SYMS.on(qsAccepting, S_URL_OPENBRACE_Q);
S_URL_OPENBRACKET_SYMS.on(qsAccepting, S_URL_OPENBRACKET_Q);
S_URL_OPENANGLEBRACKET_SYMS.on(qsAccepting, S_URL_OPENANGLEBRACKET_Q);
S_URL_OPENPAREN_SYMS.on(qsAccepting, S_URL_OPENPAREN_Q);
S_URL_OPENBRACE_SYMS.on(qsNonAccepting, S_URL_OPENBRACE_SYMS);
S_URL_OPENBRACKET_SYMS.on(qsNonAccepting, S_URL_OPENBRACKET_SYMS);
S_URL_OPENANGLEBRACKET_SYMS.on(qsNonAccepting, S_URL_OPENANGLEBRACKET_SYMS);
S_URL_OPENPAREN_SYMS.on(qsNonAccepting, S_URL_OPENPAREN_SYMS);

// Account for the query string
S_URL.on(qsAccepting, S_URL);
S_URL_NON_ACCEPTING.on(qsAccepting, S_URL);

S_URL.on(qsNonAccepting, S_URL_NON_ACCEPTING);
S_URL_NON_ACCEPTING.on(qsNonAccepting, S_URL_NON_ACCEPTING);

// Email address-specific state definitions
// Note: We are not allowing '/' in email addresses since this would interfere
// with real URLs

// For addresses with the mailto prefix
// 'mailto:' followed by anything sane is a valid email
S_MAILTO.on(_text.TLD, S_MAILTO_EMAIL).on(_text.DOMAIN, S_MAILTO_EMAIL).on(_text.NUM, S_MAILTO_EMAIL).on(_text.LOCALHOST, S_MAILTO_EMAIL);

// Greedily get more potential valid email values
S_MAILTO_EMAIL.on(qsAccepting, S_MAILTO_EMAIL).on(qsNonAccepting, S_MAILTO_EMAIL_NON_ACCEPTING);
S_MAILTO_EMAIL_NON_ACCEPTING.on(qsAccepting, S_MAILTO_EMAIL).on(qsNonAccepting, S_MAILTO_EMAIL_NON_ACCEPTING);

// For addresses without the mailto prefix
// Tokens allowed in the localpart of the email
var localpartAccepting = [_text.DOMAIN, _text.NUM, _text.PLUS, _text.POUND, _text.QUERY, _text.UNDERSCORE, _text.SYM, _text.AMPERSAND, _text.TLD];

// Some of the tokens in `localpartAccepting` are already accounted for here and
// will not be overwritten (don't worry)
S_DOMAIN.on(localpartAccepting, S_LOCALPART).on(_text.AT, S_LOCALPART_AT);
S_TLD.on(localpartAccepting, S_LOCALPART).on(_text.AT, S_LOCALPART_AT);
S_DOMAIN_DOT.on(localpartAccepting, S_LOCALPART);

// Okay we're on a localpart. Now what?
// TODO: IP addresses and what if the email starts with numbers?
S_LOCALPART.on(localpartAccepting, S_LOCALPART).on(_text.AT, S_LOCALPART_AT) // close to an email address now
.on(_text.DOT, S_LOCALPART_DOT);
S_LOCALPART_DOT.on(localpartAccepting, S_LOCALPART);
S_LOCALPART_AT.on(_text.TLD, S_EMAIL_DOMAIN).on(_text.DOMAIN, S_EMAIL_DOMAIN).on(_text.LOCALHOST, S_EMAIL);
// States following `@` defined above

var run = function run(tokens) {
	var len = tokens.length;
	var cursor = 0;
	var multis = [];
	var textTokens = [];

	while (cursor < len) {
		var state = S_START;
		var secondState = null;
		var nextState = null;
		var multiLength = 0;
		var latestAccepting = null;
		var sinceAccepts = -1;

		while (cursor < len && !(secondState = state.next(tokens[cursor]))) {
			// Starting tokens with nowhere to jump to.
			// Consider these to be just plain text
			textTokens.push(tokens[cursor++]);
		}

		while (cursor < len && (nextState = secondState || state.next(tokens[cursor]))) {

			// Get the next state
			secondState = null;
			state = nextState;

			// Keep track of the latest accepting state
			if (state.accepts()) {
				sinceAccepts = 0;
				latestAccepting = state;
			} else if (sinceAccepts >= 0) {
				sinceAccepts++;
			}

			cursor++;
			multiLength++;
		}

		if (sinceAccepts < 0) {

			// No accepting state was found, part of a regular text token
			// Add all the tokens we looked at to the text tokens array
			for (var i = cursor - multiLength; i < cursor; i++) {
				textTokens.push(tokens[i]);
			}
		} else {

			// Accepting state!

			// First close off the textTokens (if available)
			if (textTokens.length > 0) {
				multis.push(new _multi.TEXT(textTokens));
				textTokens = [];
			}

			// Roll back to the latest accepting state
			cursor -= sinceAccepts;
			multiLength -= sinceAccepts;

			// Create a new multitoken
			var MULTI = latestAccepting.emit();
			multis.push(new MULTI(tokens.slice(cursor - multiLength, cursor)));
		}
	}

	// Finally close off the textTokens (if available)
	if (textTokens.length > 0) {
		multis.push(new _multi.TEXT(textTokens));
	}

	return multis;
};

exports.State = _state.TokenState;
exports.TOKENS = MULTI_TOKENS;
exports.run = run;
exports.start = S_START;
},{"./state":22,"./tokens/multi":24,"./tokens/text":25}],21:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports.start = exports.run = exports.TOKENS = exports.State = undefined;

var _state = require('./state');

var _text = require('./tokens/text');

var TOKENS = _interopRequireWildcard(_text);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var tlds = 'aaa|aarp|abarth|abb|abbott|abbvie|abc|able|abogado|abudhabi|ac|academy|accenture|accountant|accountants|aco|active|actor|ad|adac|ads|adult|ae|aeg|aero|aetna|af|afamilycompany|afl|africa|ag|agakhan|agency|ai|aig|aigo|airbus|airforce|airtel|akdn|al|alfaromeo|alibaba|alipay|allfinanz|allstate|ally|alsace|alstom|am|americanexpress|americanfamily|amex|amfam|amica|amsterdam|analytics|android|anquan|anz|ao|aol|apartments|app|apple|aq|aquarelle|ar|arab|aramco|archi|army|arpa|art|arte|as|asda|asia|associates|at|athleta|attorney|au|auction|audi|audible|audio|auspost|author|auto|autos|avianca|aw|aws|ax|axa|az|azure|ba|baby|baidu|banamex|bananarepublic|band|bank|bar|barcelona|barclaycard|barclays|barefoot|bargains|baseball|basketball|bauhaus|bayern|bb|bbc|bbt|bbva|bcg|bcn|bd|be|beats|beauty|beer|bentley|berlin|best|bestbuy|bet|bf|bg|bh|bharti|bi|bible|bid|bike|bing|bingo|bio|biz|bj|black|blackfriday|blanco|blockbuster|blog|bloomberg|blue|bm|bms|bmw|bn|bnl|bnpparibas|bo|boats|boehringer|bofa|bom|bond|boo|book|booking|boots|bosch|bostik|boston|bot|boutique|box|br|bradesco|bridgestone|broadway|broker|brother|brussels|bs|bt|budapest|bugatti|build|builders|business|buy|buzz|bv|bw|by|bz|bzh|ca|cab|cafe|cal|call|calvinklein|cam|camera|camp|cancerresearch|canon|capetown|capital|capitalone|car|caravan|cards|care|career|careers|cars|cartier|casa|case|caseih|cash|casino|cat|catering|catholic|cba|cbn|cbre|cbs|cc|cd|ceb|center|ceo|cern|cf|cfa|cfd|cg|ch|chanel|channel|chase|chat|cheap|chintai|chloe|christmas|chrome|chrysler|church|ci|cipriani|circle|cisco|citadel|citi|citic|city|cityeats|ck|cl|claims|cleaning|click|clinic|clinique|clothing|cloud|club|clubmed|cm|cn|co|coach|codes|coffee|college|cologne|com|comcast|commbank|community|company|compare|computer|comsec|condos|construction|consulting|contact|contractors|cooking|cookingchannel|cool|coop|corsica|country|coupon|coupons|courses|cr|credit|creditcard|creditunion|cricket|crown|crs|cruise|cruises|csc|cu|cuisinella|cv|cw|cx|cy|cymru|cyou|cz|dabur|dad|dance|data|date|dating|datsun|day|dclk|dds|de|deal|dealer|deals|degree|delivery|dell|deloitte|delta|democrat|dental|dentist|desi|design|dev|dhl|diamonds|diet|digital|direct|directory|discount|discover|dish|diy|dj|dk|dm|dnp|do|docs|doctor|dodge|dog|doha|domains|dot|download|drive|dtv|dubai|duck|dunlop|duns|dupont|durban|dvag|dvr|dz|earth|eat|ec|eco|edeka|edu|education|ee|eg|email|emerck|energy|engineer|engineering|enterprises|epost|epson|equipment|er|ericsson|erni|es|esq|estate|esurance|et|etisalat|eu|eurovision|eus|events|everbank|exchange|expert|exposed|express|extraspace|fage|fail|fairwinds|faith|family|fan|fans|farm|farmers|fashion|fast|fedex|feedback|ferrari|ferrero|fi|fiat|fidelity|fido|film|final|finance|financial|fire|firestone|firmdale|fish|fishing|fit|fitness|fj|fk|flickr|flights|flir|florist|flowers|fly|fm|fo|foo|food|foodnetwork|football|ford|forex|forsale|forum|foundation|fox|fr|free|fresenius|frl|frogans|frontdoor|frontier|ftr|fujitsu|fujixerox|fun|fund|furniture|futbol|fyi|ga|gal|gallery|gallo|gallup|game|games|gap|garden|gb|gbiz|gd|gdn|ge|gea|gent|genting|george|gf|gg|ggee|gh|gi|gift|gifts|gives|giving|gl|glade|glass|gle|global|globo|gm|gmail|gmbh|gmo|gmx|gn|godaddy|gold|goldpoint|golf|goo|goodhands|goodyear|goog|google|gop|got|gov|gp|gq|gr|grainger|graphics|gratis|green|gripe|grocery|group|gs|gt|gu|guardian|gucci|guge|guide|guitars|guru|gw|gy|hair|hamburg|hangout|haus|hbo|hdfc|hdfcbank|health|healthcare|help|helsinki|here|hermes|hgtv|hiphop|hisamitsu|hitachi|hiv|hk|hkt|hm|hn|hockey|holdings|holiday|homedepot|homegoods|homes|homesense|honda|honeywell|horse|hospital|host|hosting|hot|hoteles|hotels|hotmail|house|how|hr|hsbc|ht|htc|hu|hughes|hyatt|hyundai|ibm|icbc|ice|icu|id|ie|ieee|ifm|ikano|il|im|imamat|imdb|immo|immobilien|in|industries|infiniti|info|ing|ink|institute|insurance|insure|int|intel|international|intuit|investments|io|ipiranga|iq|ir|irish|is|iselect|ismaili|ist|istanbul|it|itau|itv|iveco|iwc|jaguar|java|jcb|jcp|je|jeep|jetzt|jewelry|jio|jlc|jll|jm|jmp|jnj|jo|jobs|joburg|jot|joy|jp|jpmorgan|jprs|juegos|juniper|kaufen|kddi|ke|kerryhotels|kerrylogistics|kerryproperties|kfh|kg|kh|ki|kia|kim|kinder|kindle|kitchen|kiwi|km|kn|koeln|komatsu|kosher|kp|kpmg|kpn|kr|krd|kred|kuokgroup|kw|ky|kyoto|kz|la|lacaixa|ladbrokes|lamborghini|lamer|lancaster|lancia|lancome|land|landrover|lanxess|lasalle|lat|latino|latrobe|law|lawyer|lb|lc|lds|lease|leclerc|lefrak|legal|lego|lexus|lgbt|li|liaison|lidl|life|lifeinsurance|lifestyle|lighting|like|lilly|limited|limo|lincoln|linde|link|lipsy|live|living|lixil|lk|loan|loans|locker|locus|loft|lol|london|lotte|lotto|love|lpl|lplfinancial|lr|ls|lt|ltd|ltda|lu|lundbeck|lupin|luxe|luxury|lv|ly|ma|macys|madrid|maif|maison|makeup|man|management|mango|map|market|marketing|markets|marriott|marshalls|maserati|mattel|mba|mc|mckinsey|md|me|med|media|meet|melbourne|meme|memorial|men|menu|meo|merckmsd|metlife|mg|mh|miami|microsoft|mil|mini|mint|mit|mitsubishi|mk|ml|mlb|mls|mm|mma|mn|mo|mobi|mobile|mobily|moda|moe|moi|mom|monash|money|monster|mopar|mormon|mortgage|moscow|moto|motorcycles|mov|movie|movistar|mp|mq|mr|ms|msd|mt|mtn|mtr|mu|museum|mutual|mv|mw|mx|my|mz|na|nab|nadex|nagoya|name|nationwide|natura|navy|nba|nc|ne|nec|net|netbank|netflix|network|neustar|new|newholland|news|next|nextdirect|nexus|nf|nfl|ng|ngo|nhk|ni|nico|nike|nikon|ninja|nissan|nissay|nl|no|nokia|northwesternmutual|norton|now|nowruz|nowtv|np|nr|nra|nrw|ntt|nu|nyc|nz|obi|observer|off|office|okinawa|olayan|olayangroup|oldnavy|ollo|om|omega|one|ong|onl|online|onyourside|ooo|open|oracle|orange|org|organic|origins|osaka|otsuka|ott|ovh|pa|page|panasonic|panerai|paris|pars|partners|parts|party|passagens|pay|pccw|pe|pet|pf|pfizer|pg|ph|pharmacy|phd|philips|phone|photo|photography|photos|physio|piaget|pics|pictet|pictures|pid|pin|ping|pink|pioneer|pizza|pk|pl|place|play|playstation|plumbing|plus|pm|pn|pnc|pohl|poker|politie|porn|post|pr|pramerica|praxi|press|prime|pro|prod|productions|prof|progressive|promo|properties|property|protection|pru|prudential|ps|pt|pub|pw|pwc|py|qa|qpon|quebec|quest|qvc|racing|radio|raid|re|read|realestate|realtor|realty|recipes|red|redstone|redumbrella|rehab|reise|reisen|reit|reliance|ren|rent|rentals|repair|report|republican|rest|restaurant|review|reviews|rexroth|rich|richardli|ricoh|rightathome|ril|rio|rip|rmit|ro|rocher|rocks|rodeo|rogers|room|rs|rsvp|ru|rugby|ruhr|run|rw|rwe|ryukyu|sa|saarland|safe|safety|sakura|sale|salon|samsclub|samsung|sandvik|sandvikcoromant|sanofi|sap|sapo|sarl|sas|save|saxo|sb|sbi|sbs|sc|sca|scb|schaeffler|schmidt|scholarships|school|schule|schwarz|science|scjohnson|scor|scot|sd|se|search|seat|secure|security|seek|select|sener|services|ses|seven|sew|sex|sexy|sfr|sg|sh|shangrila|sharp|shaw|shell|shia|shiksha|shoes|shop|shopping|shouji|show|showtime|shriram|si|silk|sina|singles|site|sj|sk|ski|skin|sky|skype|sl|sling|sm|smart|smile|sn|sncf|so|soccer|social|softbank|software|sohu|solar|solutions|song|sony|soy|space|spiegel|spot|spreadbetting|sr|srl|srt|st|stada|staples|star|starhub|statebank|statefarm|statoil|stc|stcgroup|stockholm|storage|store|stream|studio|study|style|su|sucks|supplies|supply|support|surf|surgery|suzuki|sv|swatch|swiftcover|swiss|sx|sy|sydney|symantec|systems|sz|tab|taipei|talk|taobao|target|tatamotors|tatar|tattoo|tax|taxi|tc|tci|td|tdk|team|tech|technology|tel|telecity|telefonica|temasek|tennis|teva|tf|tg|th|thd|theater|theatre|tiaa|tickets|tienda|tiffany|tips|tires|tirol|tj|tjmaxx|tjx|tk|tkmaxx|tl|tm|tmall|tn|to|today|tokyo|tools|top|toray|toshiba|total|tours|town|toyota|toys|tr|trade|trading|training|travel|travelchannel|travelers|travelersinsurance|trust|trv|tt|tube|tui|tunes|tushu|tv|tvs|tw|tz|ua|ubank|ubs|uconnect|ug|uk|unicom|university|uno|uol|ups|us|uy|uz|va|vacations|vana|vanguard|vc|ve|vegas|ventures|verisign|versicherung|vet|vg|vi|viajes|video|vig|viking|villas|vin|vip|virgin|visa|vision|vista|vistaprint|viva|vivo|vlaanderen|vn|vodka|volkswagen|volvo|vote|voting|voto|voyage|vu|vuelos|wales|walmart|walter|wang|wanggou|warman|watch|watches|weather|weatherchannel|webcam|weber|website|wed|wedding|weibo|weir|wf|whoswho|wien|wiki|williamhill|win|windows|wine|winners|wme|wolterskluwer|woodside|work|works|world|wow|ws|wtc|wtf|xbox|xerox|xfinity|xihuan|xin|xn--11b4c3d|xn--1ck2e1b|xn--1qqw23a|xn--2scrj9c|xn--30rr7y|xn--3bst00m|xn--3ds443g|xn--3e0b707e|xn--3hcrj9c|xn--3oq18vl8pn36a|xn--3pxu8k|xn--42c2d9a|xn--45br5cyl|xn--45brj9c|xn--45q11c|xn--4gbrim|xn--54b7fta0cc|xn--55qw42g|xn--55qx5d|xn--5su34j936bgsg|xn--5tzm5g|xn--6frz82g|xn--6qq986b3xl|xn--80adxhks|xn--80ao21a|xn--80aqecdr1a|xn--80asehdb|xn--80aswg|xn--8y0a063a|xn--90a3ac|xn--90ae|xn--90ais|xn--9dbq2a|xn--9et52u|xn--9krt00a|xn--b4w605ferd|xn--bck1b9a5dre4c|xn--c1avg|xn--c2br7g|xn--cck2b3b|xn--cg4bki|xn--clchc0ea0b2g2a9gcd|xn--czr694b|xn--czrs0t|xn--czru2d|xn--d1acj3b|xn--d1alf|xn--e1a4c|xn--eckvdtc9d|xn--efvy88h|xn--estv75g|xn--fct429k|xn--fhbei|xn--fiq228c5hs|xn--fiq64b|xn--fiqs8s|xn--fiqz9s|xn--fjq720a|xn--flw351e|xn--fpcrj9c3d|xn--fzc2c9e2c|xn--fzys8d69uvgm|xn--g2xx48c|xn--gckr3f0f|xn--gecrj9c|xn--gk3at1e|xn--h2breg3eve|xn--h2brj9c|xn--h2brj9c8c|xn--hxt814e|xn--i1b6b1a6a2e|xn--imr513n|xn--io0a7i|xn--j1aef|xn--j1amh|xn--j6w193g|xn--jlq61u9w7b|xn--jvr189m|xn--kcrx77d1x4a|xn--kprw13d|xn--kpry57d|xn--kpu716f|xn--kput3i|xn--l1acc|xn--lgbbat1ad8j|xn--mgb9awbf|xn--mgba3a3ejt|xn--mgba3a4f16a|xn--mgba7c0bbn0a|xn--mgbaakc7dvf|xn--mgbaam7a8h|xn--mgbab2bd|xn--mgbai9azgqp6j|xn--mgbayh7gpa|xn--mgbb9fbpob|xn--mgbbh1a|xn--mgbbh1a71e|xn--mgbc0a9azcg|xn--mgbca7dzdo|xn--mgberp4a5d4ar|xn--mgbgu82a|xn--mgbi4ecexp|xn--mgbpl2fh|xn--mgbt3dhd|xn--mgbtx2b|xn--mgbx4cd0ab|xn--mix891f|xn--mk1bu44c|xn--mxtq1m|xn--ngbc5azd|xn--ngbe9e0a|xn--ngbrx|xn--node|xn--nqv7f|xn--nqv7fs00ema|xn--nyqy26a|xn--o3cw4h|xn--ogbpf8fl|xn--p1acf|xn--p1ai|xn--pbt977c|xn--pgbs0dh|xn--pssy2u|xn--q9jyb4c|xn--qcka1pmc|xn--qxam|xn--rhqv96g|xn--rovu88b|xn--rvc1e0am3e|xn--s9brj9c|xn--ses554g|xn--t60b56a|xn--tckwe|xn--tiq49xqyj|xn--unup4y|xn--vermgensberater-ctb|xn--vermgensberatung-pwb|xn--vhquv|xn--vuq861b|xn--w4r85el8fhu5dnra|xn--w4rs40l|xn--wgbh1c|xn--wgbl6a|xn--xhq521b|xn--xkc2al3hye2a|xn--xkc2dl3a5ee0h|xn--y9a3aq|xn--yfro4i67o|xn--ygbi2ammx|xn--zfr164b|xperia|xxx|xyz|yachts|yahoo|yamaxun|yandex|ye|yodobashi|yoga|yokohama|you|youtube|yt|yun|za|zappos|zara|zero|zip|zippo|zm|zone|zuerich|zw'.split('|'); // macro, see gulpfile.js

/**
	The scanner provides an interface that takes a string of text as input, and
	outputs an array of tokens instances that can be used for easy URL parsing.

	@module linkify
	@submodule scanner
	@main scanner
*/

var NUMBERS = '0123456789'.split('');
var ALPHANUM = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');
var WHITESPACE = [' ', '\f', '\r', '\t', '\v', '\xA0', '\u1680', '\u180E']; // excluding line breaks

var domainStates = []; // states that jump to DOMAIN on /[a-z0-9]/
var makeState = function makeState(tokenClass) {
	return new _state.CharacterState(tokenClass);
};

// Frequently used states
var S_START = makeState();
var S_NUM = makeState(_text.NUM);
var S_DOMAIN = makeState(_text.DOMAIN);
var S_DOMAIN_HYPHEN = makeState(); // domain followed by 1 or more hyphen characters
var S_WS = makeState(_text.WS);

// States for special URL symbols
S_START.on('@', makeState(_text.AT)).on('.', makeState(_text.DOT)).on('+', makeState(_text.PLUS)).on('#', makeState(_text.POUND)).on('?', makeState(_text.QUERY)).on('/', makeState(_text.SLASH)).on('_', makeState(_text.UNDERSCORE)).on(':', makeState(_text.COLON)).on('{', makeState(_text.OPENBRACE)).on('[', makeState(_text.OPENBRACKET)).on('<', makeState(_text.OPENANGLEBRACKET)).on('(', makeState(_text.OPENPAREN)).on('}', makeState(_text.CLOSEBRACE)).on(']', makeState(_text.CLOSEBRACKET)).on('>', makeState(_text.CLOSEANGLEBRACKET)).on(')', makeState(_text.CLOSEPAREN)).on('&', makeState(_text.AMPERSAND)).on([',', ';', '!', '"', '\''], makeState(_text.PUNCTUATION));

// Whitespace jumps
// Tokens of only non-newline whitespace are arbitrarily long
S_START.on('\n', makeState(_text.NL)).on(WHITESPACE, S_WS);

// If any whitespace except newline, more whitespace!
S_WS.on(WHITESPACE, S_WS);

// Generates states for top-level domains
// Note that this is most accurate when tlds are in alphabetical order
for (var i = 0; i < tlds.length; i++) {
	var newStates = (0, _state.stateify)(tlds[i], S_START, _text.TLD, _text.DOMAIN);
	domainStates.push.apply(domainStates, newStates);
}

// Collect the states generated by different protocls
var partialProtocolFileStates = (0, _state.stateify)('file', S_START, _text.DOMAIN, _text.DOMAIN);
var partialProtocolFtpStates = (0, _state.stateify)('ftp', S_START, _text.DOMAIN, _text.DOMAIN);
var partialProtocolHttpStates = (0, _state.stateify)('http', S_START, _text.DOMAIN, _text.DOMAIN);
var partialProtocolMailtoStates = (0, _state.stateify)('mailto', S_START, _text.DOMAIN, _text.DOMAIN);

// Add the states to the array of DOMAINeric states
domainStates.push.apply(domainStates, partialProtocolFileStates);
domainStates.push.apply(domainStates, partialProtocolFtpStates);
domainStates.push.apply(domainStates, partialProtocolHttpStates);
domainStates.push.apply(domainStates, partialProtocolMailtoStates);

// Protocol states
var S_PROTOCOL_FILE = partialProtocolFileStates.pop();
var S_PROTOCOL_FTP = partialProtocolFtpStates.pop();
var S_PROTOCOL_HTTP = partialProtocolHttpStates.pop();
var S_MAILTO = partialProtocolMailtoStates.pop();
var S_PROTOCOL_SECURE = makeState(_text.DOMAIN);
var S_FULL_PROTOCOL = makeState(_text.PROTOCOL); // Full protocol ends with COLON
var S_FULL_MAILTO = makeState(_text.MAILTO); // Mailto ends with COLON

// Secure protocols (end with 's')
S_PROTOCOL_FTP.on('s', S_PROTOCOL_SECURE).on(':', S_FULL_PROTOCOL);

S_PROTOCOL_HTTP.on('s', S_PROTOCOL_SECURE).on(':', S_FULL_PROTOCOL);

domainStates.push(S_PROTOCOL_SECURE);

// Become protocol tokens after a COLON
S_PROTOCOL_FILE.on(':', S_FULL_PROTOCOL);
S_PROTOCOL_SECURE.on(':', S_FULL_PROTOCOL);
S_MAILTO.on(':', S_FULL_MAILTO);

// Localhost
var partialLocalhostStates = (0, _state.stateify)('localhost', S_START, _text.LOCALHOST, _text.DOMAIN);
domainStates.push.apply(domainStates, partialLocalhostStates);

// Everything else
// DOMAINs make more DOMAINs
// Number and character transitions
S_START.on(NUMBERS, S_NUM);
S_NUM.on('-', S_DOMAIN_HYPHEN).on(NUMBERS, S_NUM).on(ALPHANUM, S_DOMAIN); // number becomes DOMAIN

S_DOMAIN.on('-', S_DOMAIN_HYPHEN).on(ALPHANUM, S_DOMAIN);

// All the generated states should have a jump to DOMAIN
for (var _i = 0; _i < domainStates.length; _i++) {
	domainStates[_i].on('-', S_DOMAIN_HYPHEN).on(ALPHANUM, S_DOMAIN);
}

S_DOMAIN_HYPHEN.on('-', S_DOMAIN_HYPHEN).on(NUMBERS, S_DOMAIN).on(ALPHANUM, S_DOMAIN);

// Set default transition
S_START.defaultTransition = makeState(_text.SYM);

/**
	Given a string, returns an array of TOKEN instances representing the
	composition of that string.

	@method run
	@param {String} str Input string to scan
	@return {Array} Array of TOKEN instances
*/
var run = function run(str) {

	// The state machine only looks at lowercase strings.
	// This selective `toLowerCase` is used because lowercasing the entire
	// string causes the length and character position to vary in some in some
	// non-English strings. This happens only on V8-based runtimes.
	var lowerStr = str.replace(/[A-Z]/g, function (c) {
		return c.toLowerCase();
	});
	var len = str.length;
	var tokens = []; // return value

	var cursor = 0;

	// Tokenize the string
	while (cursor < len) {
		var state = S_START;
		var nextState = null;
		var tokenLength = 0;
		var latestAccepting = null;
		var sinceAccepts = -1;

		while (cursor < len && (nextState = state.next(lowerStr[cursor]))) {
			state = nextState;

			// Keep track of the latest accepting state
			if (state.accepts()) {
				sinceAccepts = 0;
				latestAccepting = state;
			} else if (sinceAccepts >= 0) {
				sinceAccepts++;
			}

			tokenLength++;
			cursor++;
		}

		if (sinceAccepts < 0) {
			continue;
		} // Should never happen

		// Roll back to the latest accepting state
		cursor -= sinceAccepts;
		tokenLength -= sinceAccepts;

		// Get the class for the new token
		var TOKEN = latestAccepting.emit(); // Current token class

		// No more jumps, just make a new token
		tokens.push(new TOKEN(str.substr(cursor - tokenLength, tokenLength)));
	}

	return tokens;
};

var start = S_START;
exports.State = _state.CharacterState;
exports.TOKENS = TOKENS;
exports.run = run;
exports.start = start;
},{"./state":22,"./tokens/text":25}],22:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports.stateify = exports.TokenState = exports.CharacterState = undefined;

var _class = require('../utils/class');

function createStateClass() {
	return function (tClass) {
		this.j = [];
		this.T = tClass || null;
	};
}

/**
	A simple state machine that can emit token classes

	The `j` property in this class refers to state jumps. It's a
	multidimensional array where for each element:

	* index [0] is a symbol or class of symbols to transition to.
	* index [1] is a State instance which matches

	The type of symbol will depend on the target implementation for this class.
	In Linkify, we have a two-stage scanner. Each stage uses this state machine
	but with a slighly different (polymorphic) implementation.

	The `T` property refers to the token class.

	TODO: Can the `on` and `next` methods be combined?

	@class BaseState
*/
var BaseState = createStateClass();
BaseState.prototype = {
	defaultTransition: false,

	/**
 	@method constructor
 	@param {Class} tClass Pass in the kind of token to emit if there are
 		no jumps after this state and the state is accepting.
 */

	/**
 	On the given symbol(s), this machine should go to the given state
 		@method on
 	@param {Array|Mixed} symbol
 	@param {BaseState} state Note that the type of this state should be the
 		same as the current instance (i.e., don't pass in a different
 		subclass)
 */
	on: function on(symbol, state) {
		if (symbol instanceof Array) {
			for (var i = 0; i < symbol.length; i++) {
				this.j.push([symbol[i], state]);
			}
			return this;
		}
		this.j.push([symbol, state]);
		return this;
	},


	/**
 	Given the next item, returns next state for that item
 	@method next
 	@param {Mixed} item Should be an instance of the symbols handled by
 		this particular machine.
 	@return {State} state Returns false if no jumps are available
 */
	next: function next(item) {
		for (var i = 0; i < this.j.length; i++) {
			var jump = this.j[i];
			var symbol = jump[0]; // Next item to check for
			var state = jump[1]; // State to jump to if items match

			// compare item with symbol
			if (this.test(item, symbol)) {
				return state;
			}
		}

		// Nowhere left to jump!
		return this.defaultTransition;
	},


	/**
 	Does this state accept?
 	`true` only of `this.T` exists
 		@method accepts
 	@return {Boolean}
 */
	accepts: function accepts() {
		return !!this.T;
	},


	/**
 	Determine whether a given item "symbolizes" the symbol, where symbol is
 	a class of items handled by this state machine.
 		This method should be overriden in extended classes.
 		@method test
 	@param {Mixed} item Does this item match the given symbol?
 	@param {Mixed} symbol
 	@return {Boolean}
 */
	test: function test(item, symbol) {
		return item === symbol;
	},


	/**
 	Emit the token for this State (just return it in this case)
 	If this emits a token, this instance is an accepting state
 	@method emit
 	@return {Class} T
 */
	emit: function emit() {
		return this.T;
	}
};

/**
	State machine for string-based input

	@class CharacterState
	@extends BaseState
*/
var CharacterState = (0, _class.inherits)(BaseState, createStateClass(), {
	/**
 	Does the given character match the given character or regular
 	expression?
 		@method test
 	@param {String} char
 	@param {String|RegExp} charOrRegExp
 	@return {Boolean}
 */
	test: function test(character, charOrRegExp) {
		return character === charOrRegExp || charOrRegExp instanceof RegExp && charOrRegExp.test(character);
	}
});

/**
	State machine for input in the form of TextTokens

	@class TokenState
	@extends BaseState
*/
var TokenState = (0, _class.inherits)(BaseState, createStateClass(), {

	/**
  * Similar to `on`, but returns the state the results in the transition from
  * the given item
  * @method jump
  * @param {Mixed} item
  * @param {Token} [token]
  * @return state
  */
	jump: function jump(token) {
		var tClass = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

		var state = this.next(new token('')); // dummy temp token
		if (state === this.defaultTransition) {
			// Make a new state!
			state = new this.constructor(tClass);
			this.on(token, state);
		} else if (tClass) {
			state.T = tClass;
		}
		return state;
	},


	/**
 	Is the given token an instance of the given token class?
 		@method test
 	@param {TextToken} token
 	@param {Class} tokenClass
 	@return {Boolean}
 */
	test: function test(token, tokenClass) {
		return token instanceof tokenClass;
	}
});

/**
	Given a non-empty target string, generates states (if required) for each
	consecutive substring of characters in str starting from the beginning of
	the string. The final state will have a special value, as specified in
	options. All other "in between" substrings will have a default end state.

	This turns the state machine into a Trie-like data structure (rather than a
	intelligently-designed DFA).

	Note that I haven't really tried these with any strings other than
	DOMAIN.

	@param {String} str
	@param {CharacterState} start State to jump from the first character
	@param {Class} endToken Token class to emit when the given string has been
		matched and no more jumps exist.
	@param {Class} defaultToken "Filler token", or which token type to emit when
		we don't have a full match
	@return {Array} list of newly-created states
*/
function stateify(str, start, endToken, defaultToken) {
	var i = 0,
	    len = str.length,
	    state = start,
	    newStates = [],
	    nextState = void 0;

	// Find the next state without a jump to the next character
	while (i < len && (nextState = state.next(str[i]))) {
		state = nextState;
		i++;
	}

	if (i >= len) {
		return [];
	} // no new tokens were added

	while (i < len - 1) {
		nextState = new CharacterState(defaultToken);
		newStates.push(nextState);
		state.on(str[i], nextState);
		state = nextState;
		i++;
	}

	nextState = new CharacterState(endToken);
	newStates.push(nextState);
	state.on(str[len - 1], nextState);

	return newStates;
}

exports.CharacterState = CharacterState;
exports.TokenState = TokenState;
exports.stateify = stateify;
},{"../utils/class":26}],23:[function(require,module,exports){
"use strict";

exports.__esModule = true;
function createTokenClass() {
	return function (value) {
		if (value) {
			this.v = value;
		}
	};
}

exports.createTokenClass = createTokenClass;
},{}],24:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports.URL = exports.TEXT = exports.NL = exports.EMAIL = exports.MAILTOEMAIL = exports.Base = undefined;

var _createTokenClass = require('./create-token-class');

var _class = require('../../utils/class');

var _text = require('./text');

/******************************************************************************
	Multi-Tokens
	Tokens composed of arrays of TextTokens
******************************************************************************/

// Is the given token a valid domain token?
// Should nums be included here?
function isDomainToken(token) {
	return token instanceof _text.DOMAIN || token instanceof _text.TLD;
}

/**
	Abstract class used for manufacturing tokens of text tokens. That is rather
	than the value for a token being a small string of text, it's value an array
	of text tokens.

	Used for grouping together URLs, emails, hashtags, and other potential
	creations.

	@class MultiToken
	@abstract
*/
var MultiToken = (0, _createTokenClass.createTokenClass)();

MultiToken.prototype = {
	/**
 	String representing the type for this token
 	@property type
 	@default 'TOKEN'
 */
	type: 'token',

	/**
 	Is this multitoken a link?
 	@property isLink
 	@default false
 */
	isLink: false,

	/**
 	Return the string this token represents.
 	@method toString
 	@return {String}
 */
	toString: function toString() {
		var result = [];
		for (var i = 0; i < this.v.length; i++) {
			result.push(this.v[i].toString());
		}
		return result.join('');
	},


	/**
 	What should the value for this token be in the `href` HTML attribute?
 	Returns the `.toString` value by default.
 		@method toHref
 	@return {String}
 */
	toHref: function toHref() {
		return this.toString();
	},


	/**
 	Returns a hash of relevant values for this token, which includes keys
 	* type - Kind of token ('url', 'email', etc.)
 	* value - Original text
 	* href - The value that should be added to the anchor tag's href
 		attribute
 		@method toObject
 	@param {String} [protocol] `'http'` by default
 	@return {Object}
 */
	toObject: function toObject() {
		var protocol = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'http';

		return {
			type: this.type,
			value: this.toString(),
			href: this.toHref(protocol)
		};
	}
};

/**
	Represents an arbitrarily mailto email address with the prefix included
	@class MAILTO
	@extends MultiToken
*/
var MAILTOEMAIL = (0, _class.inherits)(MultiToken, (0, _createTokenClass.createTokenClass)(), {
	type: 'email',
	isLink: true
});

/**
	Represents a list of tokens making up a valid email address
	@class EMAIL
	@extends MultiToken
*/
var EMAIL = (0, _class.inherits)(MultiToken, (0, _createTokenClass.createTokenClass)(), {
	type: 'email',
	isLink: true,
	toHref: function toHref() {
		return 'mailto:' + this.toString();
	}
});

/**
	Represents some plain text
	@class TEXT
	@extends MultiToken
*/
var TEXT = (0, _class.inherits)(MultiToken, (0, _createTokenClass.createTokenClass)(), { type: 'text' });

/**
	Multi-linebreak token - represents a line break
	@class NL
	@extends MultiToken
*/
var NL = (0, _class.inherits)(MultiToken, (0, _createTokenClass.createTokenClass)(), { type: 'nl' });

/**
	Represents a list of tokens making up a valid URL
	@class URL
	@extends MultiToken
*/
var URL = (0, _class.inherits)(MultiToken, (0, _createTokenClass.createTokenClass)(), {
	type: 'url',
	isLink: true,

	/**
 	Lowercases relevant parts of the domain and adds the protocol if
 	required. Note that this will not escape unsafe HTML characters in the
 	URL.
 		@method href
 	@param {String} protocol
 	@return {String}
 */
	toHref: function toHref() {
		var protocol = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'http';

		var hasProtocol = false;
		var hasSlashSlash = false;
		var tokens = this.v;
		var result = [];
		var i = 0;

		// Make the first part of the domain lowercase
		// Lowercase protocol
		while (tokens[i] instanceof _text.PROTOCOL) {
			hasProtocol = true;
			result.push(tokens[i].toString().toLowerCase());
			i++;
		}

		// Skip slash-slash
		while (tokens[i] instanceof _text.SLASH) {
			hasSlashSlash = true;
			result.push(tokens[i].toString());
			i++;
		}

		// Lowercase all other characters in the domain
		while (isDomainToken(tokens[i])) {
			result.push(tokens[i].toString().toLowerCase());
			i++;
		}

		// Leave all other characters as they were written
		for (; i < tokens.length; i++) {
			result.push(tokens[i].toString());
		}

		result = result.join('');

		if (!(hasProtocol || hasSlashSlash)) {
			result = protocol + '://' + result;
		}

		return result;
	},
	hasProtocol: function hasProtocol() {
		return this.v[0] instanceof _text.PROTOCOL;
	}
});

exports.Base = MultiToken;
exports.MAILTOEMAIL = MAILTOEMAIL;
exports.EMAIL = EMAIL;
exports.NL = NL;
exports.TEXT = TEXT;
exports.URL = URL;
},{"../../utils/class":26,"./create-token-class":23,"./text":25}],25:[function(require,module,exports){
'use strict';

exports.__esModule = true;
exports.AMPERSAND = exports.CLOSEPAREN = exports.CLOSEANGLEBRACKET = exports.CLOSEBRACKET = exports.CLOSEBRACE = exports.OPENPAREN = exports.OPENANGLEBRACKET = exports.OPENBRACKET = exports.OPENBRACE = exports.WS = exports.TLD = exports.SYM = exports.UNDERSCORE = exports.SLASH = exports.MAILTO = exports.PROTOCOL = exports.QUERY = exports.POUND = exports.PLUS = exports.NUM = exports.NL = exports.LOCALHOST = exports.PUNCTUATION = exports.DOT = exports.COLON = exports.AT = exports.DOMAIN = exports.Base = undefined;

var _createTokenClass = require('./create-token-class');

var _class = require('../../utils/class');

/******************************************************************************
	Text Tokens
	Tokens composed of strings
******************************************************************************/

/**
	Abstract class used for manufacturing text tokens.
	Pass in the value this token represents

	@class TextToken
	@abstract
*/
var TextToken = (0, _createTokenClass.createTokenClass)();
TextToken.prototype = {
	toString: function toString() {
		return this.v + '';
	}
};

function inheritsToken(value) {
	var props = value ? { v: value } : {};
	return (0, _class.inherits)(TextToken, (0, _createTokenClass.createTokenClass)(), props);
}

/**
	A valid domain token
	@class DOMAIN
	@extends TextToken
*/
var DOMAIN = inheritsToken();

/**
	@class AT
	@extends TextToken
*/
var AT = inheritsToken('@');

/**
	Represents a single colon `:` character

	@class COLON
	@extends TextToken
*/
var COLON = inheritsToken(':');

/**
	@class DOT
	@extends TextToken
*/
var DOT = inheritsToken('.');

/**
	A character class that can surround the URL, but which the URL cannot begin
	or end with. Does not include certain English punctuation like parentheses.

	@class PUNCTUATION
	@extends TextToken
*/
var PUNCTUATION = inheritsToken();

/**
	The word localhost (by itself)
	@class LOCALHOST
	@extends TextToken
*/
var LOCALHOST = inheritsToken();

/**
	Newline token
	@class NL
	@extends TextToken
*/
var NL = inheritsToken('\n');

/**
	@class NUM
	@extends TextToken
*/
var NUM = inheritsToken();

/**
	@class PLUS
	@extends TextToken
*/
var PLUS = inheritsToken('+');

/**
	@class POUND
	@extends TextToken
*/
var POUND = inheritsToken('#');

/**
	Represents a web URL protocol. Supported types include

	* `http:`
	* `https:`
	* `ftp:`
	* `ftps:`

	@class PROTOCOL
	@extends TextToken
*/
var PROTOCOL = inheritsToken();

/**
	Represents the start of the email URI protocol

	@class MAILTO
	@extends TextToken
*/
var MAILTO = inheritsToken('mailto:');

/**
	@class QUERY
	@extends TextToken
*/
var QUERY = inheritsToken('?');

/**
	@class SLASH
	@extends TextToken
*/
var SLASH = inheritsToken('/');

/**
	@class UNDERSCORE
	@extends TextToken
*/
var UNDERSCORE = inheritsToken('_');

/**
	One ore more non-whitespace symbol.
	@class SYM
	@extends TextToken
*/
var SYM = inheritsToken();

/**
	@class TLD
	@extends TextToken
*/
var TLD = inheritsToken();

/**
	Represents a string of consecutive whitespace characters

	@class WS
	@extends TextToken
*/
var WS = inheritsToken();

/**
	Opening/closing bracket classes
*/

var OPENBRACE = inheritsToken('{');
var OPENBRACKET = inheritsToken('[');
var OPENANGLEBRACKET = inheritsToken('<');
var OPENPAREN = inheritsToken('(');
var CLOSEBRACE = inheritsToken('}');
var CLOSEBRACKET = inheritsToken(']');
var CLOSEANGLEBRACKET = inheritsToken('>');
var CLOSEPAREN = inheritsToken(')');

var AMPERSAND = inheritsToken('&');

exports.Base = TextToken;
exports.DOMAIN = DOMAIN;
exports.AT = AT;
exports.COLON = COLON;
exports.DOT = DOT;
exports.PUNCTUATION = PUNCTUATION;
exports.LOCALHOST = LOCALHOST;
exports.NL = NL;
exports.NUM = NUM;
exports.PLUS = PLUS;
exports.POUND = POUND;
exports.QUERY = QUERY;
exports.PROTOCOL = PROTOCOL;
exports.MAILTO = MAILTO;
exports.SLASH = SLASH;
exports.UNDERSCORE = UNDERSCORE;
exports.SYM = SYM;
exports.TLD = TLD;
exports.WS = WS;
exports.OPENBRACE = OPENBRACE;
exports.OPENBRACKET = OPENBRACKET;
exports.OPENANGLEBRACKET = OPENANGLEBRACKET;
exports.OPENPAREN = OPENPAREN;
exports.CLOSEBRACE = CLOSEBRACE;
exports.CLOSEBRACKET = CLOSEBRACKET;
exports.CLOSEANGLEBRACKET = CLOSEANGLEBRACKET;
exports.CLOSEPAREN = CLOSEPAREN;
exports.AMPERSAND = AMPERSAND;
},{"../../utils/class":26,"./create-token-class":23}],26:[function(require,module,exports){
"use strict";

exports.__esModule = true;
exports.inherits = inherits;
function inherits(parent, child) {
	var props = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

	var extended = Object.create(parent.prototype);
	for (var p in props) {
		extended[p] = props[p];
	}
	extended.constructor = child;
	child.prototype = extended;
	return child;
}
},{}],27:[function(require,module,exports){
'use strict';

exports.__esModule = true;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var defaults = {
	defaultProtocol: 'http',
	events: null,
	format: noop,
	formatHref: noop,
	nl2br: false,
	tagName: 'a',
	target: typeToTarget,
	validate: true,
	ignoreTags: [],
	attributes: null,
	className: 'linkified' // Deprecated value - no default class will be provided in the future
};

exports.defaults = defaults;
exports.Options = Options;
exports.contains = contains;


function Options(opts) {
	opts = opts || {};

	this.defaultProtocol = opts.hasOwnProperty('defaultProtocol') ? opts.defaultProtocol : defaults.defaultProtocol;
	this.events = opts.hasOwnProperty('events') ? opts.events : defaults.events;
	this.format = opts.hasOwnProperty('format') ? opts.format : defaults.format;
	this.formatHref = opts.hasOwnProperty('formatHref') ? opts.formatHref : defaults.formatHref;
	this.nl2br = opts.hasOwnProperty('nl2br') ? opts.nl2br : defaults.nl2br;
	this.tagName = opts.hasOwnProperty('tagName') ? opts.tagName : defaults.tagName;
	this.target = opts.hasOwnProperty('target') ? opts.target : defaults.target;
	this.validate = opts.hasOwnProperty('validate') ? opts.validate : defaults.validate;
	this.ignoreTags = [];

	// linkAttributes and linkClass is deprecated
	this.attributes = opts.attributes || opts.linkAttributes || defaults.attributes;
	this.className = opts.hasOwnProperty('className') ? opts.className : opts.linkClass || defaults.className;

	// Make all tags names upper case
	var ignoredTags = opts.hasOwnProperty('ignoreTags') ? opts.ignoreTags : defaults.ignoreTags;
	for (var i = 0; i < ignoredTags.length; i++) {
		this.ignoreTags.push(ignoredTags[i].toUpperCase());
	}
}

Options.prototype = {
	/**
  * Given the token, return all options for how it should be displayed
  */
	resolve: function resolve(token) {
		var href = token.toHref(this.defaultProtocol);
		return {
			formatted: this.get('format', token.toString(), token),
			formattedHref: this.get('formatHref', href, token),
			tagName: this.get('tagName', href, token),
			className: this.get('className', href, token),
			target: this.get('target', href, token),
			events: this.getObject('events', href, token),
			attributes: this.getObject('attributes', href, token)
		};
	},


	/**
  * Returns true or false based on whether a token should be displayed as a
  * link based on the user options. By default,
  */
	check: function check(token) {
		return this.get('validate', token.toString(), token);
	},


	// Private methods

	/**
  * Resolve an option's value based on the value of the option and the given
  * params.
  * @param {String} key Name of option to use
  * @param operator will be passed to the target option if it's method
  * @param {MultiToken} token The token from linkify.tokenize
  */
	get: function get(key, operator, token) {
		var optionValue = void 0,
		    option = this[key];
		if (!option) {
			return option;
		}

		switch (typeof option === 'undefined' ? 'undefined' : _typeof(option)) {
			case 'function':
				return option(operator, token.type);
			case 'object':
				optionValue = option.hasOwnProperty(token.type) ? option[token.type] : defaults[key];
				return typeof optionValue === 'function' ? optionValue(operator, token.type) : optionValue;
		}

		return option;
	},
	getObject: function getObject(key, operator, token) {
		var option = this[key];
		return typeof option === 'function' ? option(operator, token.type) : option;
	}
};

/**
 * Quick indexOf replacement for checking the ignoreTags option
 */
function contains(arr, value) {
	for (var i = 0; i < arr.length; i++) {
		if (arr[i] === value) {
			return true;
		}
	}
	return false;
}

function noop(val) {
	return val;
}

function typeToTarget(href, type) {
	return type === 'url' ? '_blank' : null;
}
},{}],28:[function(require,module,exports){
module.exports = require('./lib/linkify-string').default;

},{"./lib/linkify-string":18}],29:[function(require,module,exports){
(function (process){
// .dirname, .basename, and .extname methods are extracted from Node.js v8.11.1,
// backported and transplited with Babel, with backwards-compat fixes

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function (path) {
  if (typeof path !== 'string') path = path + '';
  if (path.length === 0) return '.';
  var code = path.charCodeAt(0);
  var hasRoot = code === 47 /*/*/;
  var end = -1;
  var matchedSlash = true;
  for (var i = path.length - 1; i >= 1; --i) {
    code = path.charCodeAt(i);
    if (code === 47 /*/*/) {
        if (!matchedSlash) {
          end = i;
          break;
        }
      } else {
      // We saw the first non-path separator
      matchedSlash = false;
    }
  }

  if (end === -1) return hasRoot ? '/' : '.';
  if (hasRoot && end === 1) {
    // return '//';
    // Backwards-compat fix:
    return '/';
  }
  return path.slice(0, end);
};

function basename(path) {
  if (typeof path !== 'string') path = path + '';

  var start = 0;
  var end = -1;
  var matchedSlash = true;
  var i;

  for (i = path.length - 1; i >= 0; --i) {
    if (path.charCodeAt(i) === 47 /*/*/) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else if (end === -1) {
      // We saw the first non-path separator, mark this as the end of our
      // path component
      matchedSlash = false;
      end = i + 1;
    }
  }

  if (end === -1) return '';
  return path.slice(start, end);
}

// Uses a mixed approach for backwards-compatibility, as ext behavior changed
// in new Node.js versions, so only basename() above is backported here
exports.basename = function (path, ext) {
  var f = basename(path);
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};

exports.extname = function (path) {
  if (typeof path !== 'string') path = path + '';
  var startDot = -1;
  var startPart = 0;
  var end = -1;
  var matchedSlash = true;
  // Track the state of characters (if any) we see before our first dot and
  // after any path separator we find
  var preDotState = 0;
  for (var i = path.length - 1; i >= 0; --i) {
    var code = path.charCodeAt(i);
    if (code === 47 /*/*/) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          startPart = i + 1;
          break;
        }
        continue;
      }
    if (end === -1) {
      // We saw the first non-path separator, mark this as the end of our
      // extension
      matchedSlash = false;
      end = i + 1;
    }
    if (code === 46 /*.*/) {
        // If this is our first dot, mark it as the start of our extension
        if (startDot === -1)
          startDot = i;
        else if (preDotState !== 1)
          preDotState = 1;
    } else if (startDot !== -1) {
      // We saw a non-dot and non-path separator before our dot, so we should
      // have a good chance at having a non-empty extension
      preDotState = -1;
    }
  }

  if (startDot === -1 || end === -1 ||
      // We saw a non-dot character immediately before the dot
      preDotState === 0 ||
      // The (right-most) trimmed path component is exactly '..'
      preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
    return '';
  }
  return path.slice(startDot, end);
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))
},{"_process":30}],30:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}]},{},[10]);
