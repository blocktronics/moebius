const {palette_4bit, base_palette_index, index_to_ansi, rgb_to_ansi} = require("./palette");
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
    }

    clear() {
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

    put({fg = 7, bg = 0, code = ascii.SPACE} = {}) {
        const i = this.y * this.columns + this.x;
        if (i >= this.data.length) this.fill(1000);
        this.data[i] = {code, fg: index_to_ansi(fg), bg: index_to_ansi(bg)};
        this.x += 1;
        if (this.x == this.columns) this.new_line();
        if (this.y + 1 > this.rows) this.rows += 1;
        this.adjust_screen();
    }

    literal(code) {
        if (this.inverse) {
            this.put({
                code,
                fg: (this.blink && this.bg < 8) ? this.bg + 8 : this.bg,
                bg: (this.bold && this.fg < 8) ? this.fg + 8 : this.fg,
            });
        } else {
            this.put({
                code,
                fg: (this.bold && this.fg < 8) ? this.fg + 8 : this.fg,
                bg: (this.blink && this.bg < 8) ? this.bg + 8 : this.bg,
            });
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
}

const erase_display_types = {UNTIL_END_OF_SCREEN: 0, FROM_START_OF_SCREEN: 1, CLEAR_SCREEN: 2};
const erase_line_types = {UNTIL_END_OF_LINE: 0, FROM_START_OF_LINE: 1, CLEAR_LINE: 2};
const sgr_types = {RESET_ATTRIBUTES: 0, BOLD_ON: 1, BLINK_ON: 5, INVERSE_ON: 7, BOLD_OFF: 22, BLINK_OFF: 21, BLINK_OFF_ALT: 22, INVERSE_OFF: 27, CHANGE_FG_START: 30, CHANGE_FG_END: 37, CHANGE_BG_START: 40, CHANGE_BG_END: 47};
const true_color_type = {BACKGROUND: 0, FOREGROUND: 1};

class Ansi extends Textmode {
    constructor(bytes) {
        super(bytes);
        this.palette = [...palette_4bit];
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
                        } else if (value >= sgr_types.CHANGE_BG_START && value <= sgr_types.CHANGE_BG_END) {
                            screen.bg = value - sgr_types.CHANGE_BG_START;
                        } else {
                            switch (value) {
                                case sgr_types.RESET_ATTRIBUTES: screen.reset_attributes(); break;
                                case sgr_types.BOLD_ON: screen.bold = true; break;
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
                        const index = this.resolve_palette({r: sequence.values[1], g: sequence.values[2], b: sequence.values[3]})
                        switch (sequence.values[0]) {
                            case true_color_type.BACKGROUND: screen.bg = index; break;
                            case true_color_type.FOREGROUND: screen.fg = index; break;
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

        this.data = screen.trim_data();
    }
}

function bin_to_ansi_colour(bin_colour) {
    switch (bin_colour) {
        case 1: return 4;
        case 3: return 6;
        case 4: return 1;
        case 6: return 3;
        case 9: return 12;
        case 11: return 14;
        case 12: return 9;
        case 14: return 11;
        default: return bin_colour;
    }
}

function to_bytes(string) {
    return Array.from(string).map((b) => b.charCodeAt(0))
}

const ansi_code_mapping = { 10: 9, 13: 14, 26: 16, 27: 17 };
function sanitized_ansi_code(code) {
    return ansi_code_mapping[code] || code;
}

function build_ansi_palette(palette, bit_depth) {
    switch(bit_depth) {
        case 4: return palette.map((rgb, i) => `5;${index_to_ansi(i)}`);
        case 8: return palette.map((rgb) => `5;${index_to_ansi(rgb_to_ansi(rgb, 8))}`);
        case 24: return palette.map((rgb, i) => `2;${i < 16 ? index_to_ansi(i) : Object.values(rgb).join(';')}`);
        default:
            return palette.map((rgb, i) => {
                if (rgb === palette_4bit[i]) return index_to_ansi(i);

                let resolved_index = base_palette_index(rgb);
                return (resolved_index < 0) ? to_bytes(Object.values(rgb).join(';')) : index_to_ansi(resolved_index);
            })
    }
}

function encode_as_ansi(doc, save_without_sauce, { utf8 = false, bit_depth = 24 } = {}) {
    if (utf8) return encode_as_utf8ansi(doc, bit_depth)

    let output = [27, 91, 48, 109];

    let palette_map = build_ansi_palette(doc.palette, false);
    let current_bold = false;
    let current_blink = false;
    let current_fg = 7;
    let current_bg = 0;

    const push_sgr = (sgr, sgr_tc) => {
        if (sgr.length) output.push(27, 91, ...to_bytes(sgr.join(';')), 109);
        for (let entry of sgr_tc) output.push(27, 91, ...entry, 116);
    }

    for (let i = 0; i < doc.data.length; i++) {
        let { code, fg, bg } = doc.data[i];

        code = sanitized_ansi_code(code);
        fg = palette_map[fg];
        bg = palette_map[bg];

        let sgr = [];
        let sgr_tc = [];
        let bold = false;
        let blink = false;
        let fg_tc = Array.isArray(fg);
        let bg_tc = Array.isArray(bg);

        if (fg_tc) {
            sgr_tc.push([49, 59, ...fg]);
            current_fg = fg;
        }

        if (bg_tc) {
            sgr_tc.push([48, 59, ...bg]);
            current_bg = bg;
        }

        if (fg > 7 && fg < 16) {
            bold = true;
            fg = fg - 8;
        }

        if (bg > 7 && bg < 16) {
            blink = true;
            bg = bg - 8;
        }

        if ((!fg_tc && current_bold && !bold) || (!bg_tc && current_blink && !blink)) {
            sgr.push(0);
            current_fg = 7;
            current_bg = 0;
            current_bold = false;
            current_blink = false;
        }

        if (!fg_tc) {
            if (bold && !current_bold) {
                sgr.push(1);
                current_bold = true;
            }
        }

        if (!bg_tc) {
            if (blink && !current_blink) {
                sgr.push(5);
                current_blink = true;
            }
        }

        if (fg !== current_fg) {
            sgr.push(30 + fg);
            current_fg = fg;
        }

        if (bg !== current_bg) {
            sgr.push(40 + bg)
            current_bg = bg;
        }

        push_sgr(sgr, sgr_tc);
        output.push(code);
    }

    const bytes = new Uint8Array(output);
    return (save_without_sauce) ? bytes : add_sauce_for_ans({doc, bytes});
}

function encode_as_utf8ansi(doc, bit_depth) {
    let output = [27, 91, 48, 109];

    let palette_map = build_ansi_palette(doc.palette, bit_depth, { utf8: true });
    let current_sgr = {};
    let current_fg = 7;
    let current_bg = 0;

    const sgr = (seq) => {
        for (let [layer, ansi] of Object.entries(seq)) {
            if (ansi) output.push(27, ...(current_sgr[layer] = to_bytes(ansi)));
            else delete current_sgr[layer];
        }
    }

    for (let i = 0; i < doc.data.length; i++) {
        let { code, fg, bg } = doc.data[i];

        if (fg !== current_fg) {
            sgr({ clear: null, fg: `[38;${palette_map[fg]}m` })
            current_fg = fg;
        }

        if (bg !== current_bg) {
            sgr({ clear: null, bg: bg === 0 ? '[49m' : `[48;${palette_map[bg]}m` })
            current_bg = bg;
        }

        if (i && i % doc.columns === 0) {
            output.push(...to_bytes('[0m\r\n'))
            for (let bytes of Object.values(current_sgr)) output.push(27, ...bytes)
            current_sgr = {};
        }

        output.push(...cp437_to_unicode_bytes(code));
    }

    sgr({ clear: '[0m\r\n' })

    return new Uint8Array(output);
}

module.exports = {Ansi, encode_as_ansi};
