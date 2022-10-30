"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const console_1 = require("console");
// get fs module for creating write streams
const fs_1 = __importDefault(require("fs"));
const node_readline_1 = __importDefault(require("node:readline"));
// import { VimValue } from 'neovim/lib/types/VimValue';
// make a new logger
const myLogger = new console_1.Console({
    stdout: fs_1.default.createWriteStream(__dirname + "/normalStdout.txt"),
    stderr: fs_1.default.createWriteStream(__dirname + "/errStdErr.txt"),
});
// Given a file usr/ycyi/.../google3/ads/ragnarok/abc.cc
// Returns //ads/ragnarok:abc_target
async function findTarget(file_path) {
    let google3_index = file_path.indexOf("google3");
    let google3_base_path = "";
    if (google3_index == -1) {
        return ["", "", -1];
    }
    google3_base_path = file_path.substring(0, google3_index + 8 /*google3/*/);
    // myLogger.log("google3_base_path: " + google3_base_path);
    const path = require('path');
    let file_name = path.basename(file_path);
    // myLogger.log("file_name: " + file_name);
    let current_dir = path.dirname(file_path);
    let last_dir = file_path;
    while (current_dir != last_dir) {
        let build_file_path = current_dir + "/BUILD";
        try {
            // fileContents = fs.readFileSync('foo.bar');
            // const file = fs.readFileSync(build_file_path);
            const fileStream = fs_1.default.createReadStream(build_file_path);
            const read_line = node_readline_1.default.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            let current_target_name = "";
            let find_target_file = false;
            let build_rule_line_number = 0;
            let current_line = 0;
            for await (const line of read_line) {
                // Finds the build rule.
                current_line = current_line + 1;
                if (line.match(/^\w+\(/)) {
                    current_target_name = "";
                    build_rule_line_number = current_line;
                }
                ;
                // Finds the target file.
                if (line.match(file_name)) {
                    find_target_file = true;
                }
                ;
                // Fines the target name of the current build rule.
                if (line.match("^ *name *=")) {
                    let target_name_match = line.match(/"([\w|\-|\.]+)"/);
                    if (target_name_match) {
                        current_target_name = target_name_match.at(1);
                    }
                }
                // If the the current build rule contains the target file and we've got
                // the target name of the currnet build rule, return the full path to
                // the blaze target.
                if (current_target_name != "" && find_target_file) {
                    let google3_relative_path = path.relative(google3_base_path, current_dir);
                    let target = "//" + google3_relative_path + ":" + current_target_name;
                    // myLogger.log(target);
                    return [target, build_file_path, build_rule_line_number];
                }
                // myLogger.log(`Line from file: ${line}`);
            }
            break;
        }
        catch (err) {
            // If the error does't exist, then we go to the parent dir.
            myLogger.log(err);
            current_dir = path.resolve(current_dir, '..');
        }
    }
    return ["", "", -1];
}
function default_1(plugin) {
    plugin.setOptions({ dev: true });
    plugin.registerCommand('EchoMessage', async () => {
        try {
            await plugin.nvim.outWrite('Dayman (ah-ah-ah) \n');
        }
        catch (err) {
            // console.error(err);
        }
    }, { sync: false });
    plugin.registerCommand('Test', async () => {
        try {
            // await plugin.nvim.outWrite('Dayman (ah-ah-ah) \n');
            let getcwd = await plugin.nvim.commandOutput("echo expand('%:p')");
            const [blaze_target] = await findTarget(getcwd);
            if (blaze_target == "") {
                return;
            }
            if (!blaze_target.endsWith("test")) {
                await plugin.nvim.outWrite('Error: current file is not a test file.\n');
                return;
            }
            await plugin.nvim.command("below sp | below terminal blaze test -c opt " + blaze_target);
            await plugin.nvim.command("execute(\"normal \\<c-w>\\<c-p>\")");
        }
        catch (err) {
            myLogger.log(err);
        }
    }, { sync: false });
    plugin.registerCommand('Build', async () => {
        try {
            // await plugin.nvim.outWrite('Dayman (ah-ah-ah) \n');
            let getcwd = await plugin.nvim.commandOutput("echo expand('%:p')");
            const [blaze_target] = await findTarget(getcwd);
            if (blaze_target == "") {
                return;
            }
            await plugin.nvim.command("below sp | below terminal blaze build -c opt " + blaze_target);
            await plugin.nvim.command("execute(\"normal \\<c-w>\\<c-p>\")");
        }
        catch (err) {
            myLogger.log(err);
        }
    }, { sync: false });
    plugin.registerCommand('GoBuildRule', async () => {
        try {
            // await plugin.nvim.outWrite('Dayman (ah-ah-ah) \n');
            let getcwd = await plugin.nvim.commandOutput("echo expand('%:p')");
            const [blaze_target, build_file_path, build_rule_line_number] = await findTarget(getcwd);
            if (blaze_target == "") {
                return;
            }
            await plugin.nvim.command("edit " + build_file_path);
            await plugin.nvim.command('execute("normal ' + build_rule_line_number + 'G")');
        }
        catch (err) {
            myLogger.log(err);
        }
    }, { sync: false });
    // plugin.registerFunction('SetLines', async () => {
    //   await plugin.nvim.setLine('May I offer you an egg in these troubling times');
    //   // return console.log('Line should be set');
    // }, { sync: false })
    // plugin.registerAutocmd('BufEnter', async () => {
    //   await plugin.nvim.buffer.append('BufEnter for a JS File?')
    // }, { sync: false, pattern: '*.js', eval: 'expand("<afile>")' })
}
exports.default = default_1;
;
//# sourceMappingURL=index.js.map