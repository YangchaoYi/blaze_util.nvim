"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const console_1 = require("console");
// get fs module for creating write streams
const fs_1 = __importDefault(require("fs"));
const node_readline_1 = __importDefault(require("node:readline"));
const node_process_1 = require("node:process");
// import XRegExp from 'xregexp';
// import { VimValue } from 'neovim/lib/types/VimValue';
// make a new logger
const myLogger = new console_1.Console({
    stdout: fs_1.default.createWriteStream(__dirname + "/normalStdout.txt"),
    stderr: fs_1.default.createWriteStream(__dirname + "/errStdErr.txt"),
});
var exec = require('child_process').exec;
function execute(command, callback) {
    exec(command, function (error, stdout, stderr) {
        if (error) {
            myLogger.log(error);
        }
        if (stderr) {
            myLogger.log(stderr);
        }
        callback(stdout);
    });
}
;
class TestCase {
    constructor(name, start_index, end_index) {
        this.name = name;
        this.start_index = start_index;
        this.end_index = end_index;
    }
}
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
function findAllTestCase(file) {
    let regex_match_result;
    let test_cases = [];
    const test_case_pattern = /TEST\w*\((\w+),[\s\S]*?(\w+)\)[\s\S]*?(?=\{)/g;
    while ((regex_match_result = test_case_pattern.exec(file)) !== null) {
        test_cases.push(new TestCase(`${regex_match_result[1]}.${regex_match_result[2]}`, test_case_pattern.lastIndex - regex_match_result[0].length, test_case_pattern.lastIndex));
    }
    for (let test_case_index in test_cases) {
        // myLogger.log(test_cases[test_case_index]);
        // according the regex pattern above, the end index should point to a "{".
        let parentheses_count = 1;
        let index = test_cases[test_case_index].end_index;
        // myLogger.log(file.substring(index, index + 10));
        while (index < file.length && parentheses_count != 0) {
            index = index + 1;
            if (file[index] == "}") {
                parentheses_count = parentheses_count - 1;
            }
            if (file[index] == "{") {
                parentheses_count = parentheses_count + 1;
            }
        }
        if (parentheses_count == 0) {
            // myLogger.log(`last index: ${index}`);
            test_cases[test_case_index].end_index = index;
        }
    }
    return test_cases;
}
function getPos(file, current_line, current_column) {
    let index = 0;
    let line = 1;
    let column = 0;
    while (index < file.length) {
        if (file[index] == '\n') {
            line = line + 1;
            column = 0;
        }
        else {
            column = column + 1;
        }
        if (current_line == line && current_column == column) {
            return index;
        }
        index = index + 1;
    }
    return -1;
}
async function findTestCase(file_path, current_line, current_column) {
    let google3_index = file_path.indexOf("google3");
    if (google3_index == -1) {
        return "";
    }
    const path = require('path');
    const file_name = path.parse(file_path).name;
    if (!file_name.endsWith("test")) {
        return "";
    }
    try {
        const file_buffer = fs_1.default.readFileSync(file_path);
        const file_content = file_buffer.toString();
        const test_cases = findAllTestCase(file_content);
        // myLogger.log(test_cases);
        const pos = getPos(file_content, current_line, current_column);
        // myLogger.log(pos);
        for (let test_case of test_cases) {
            if (pos >= test_case.start_index && pos <= test_case.end_index) {
                return test_case.name;
            }
        }
    }
    catch (err) {
        // If the error does't exist, then we go to the parent dir.
        myLogger.log(err);
    }
    return "";
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
    plugin.registerCommand('TestCurrentCase', async () => {
        try {
            // Finds the test target.
            let getcwd = await plugin.nvim.commandOutput("echo expand('%:p')");
            const [blaze_target] = await findTarget(getcwd);
            if (blaze_target == "") {
                return;
            }
            if (!blaze_target.endsWith("test")) {
                await plugin.nvim.outWrite('Error: current file is not a test file.\n');
                return;
            }
            // Finds the test case.
            let current_line = Number(await plugin.nvim.commandOutput("echo line('.')"));
            let current_column = Number(await plugin.nvim.commandOutput("echo col('.')"));
            // myLogger.log(`current_line: ${current_line}`)
            const test_case = await findTestCase(getcwd, current_line, current_column);
            // myLogger.log(`test_case: ${test_case}`);
            if (test_case == "") {
                await plugin.nvim.outWrite('Error: did not find the test case.\n');
                return;
            }
            // Sends command to vim to test the test case.
            await plugin.nvim.command(`below sp | below terminal blaze test -c opt ${blaze_target} --test_filter=${test_case}`);
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
            await plugin.nvim.command(`edit +${build_rule_line_number}  ${build_file_path}`);
        }
        catch (err) {
            myLogger.log(err);
        }
    }, { sync: false });
    plugin.registerCommand('OpenFilesAtRev', async () => {
        try {
            // let google3_index = file_path.indexOf("google3");
            let vim_working_dir = await plugin.nvim.commandOutput("echo getcwd()");
            (0, node_process_1.chdir)(vim_working_dir);
            // myLogger.log(vim_working_dir);
            execute("hg list", async (stdout) => {
                // myLogger.log(stdout);
                let file_list = stdout.split('\n');
                file_list.forEach(async (file) => {
                    if (file != "") {
                        // myLogger.log(file);
                        await plugin.nvim.command("badd " + file);
                    }
                });
                await plugin.nvim.command("call DeleteEmptyBuffers()");
            });
        }
        catch (err) {
            myLogger.log(err);
        }
    }, { sync: false });
    plugin.registerCommand('DeleteAllBuffer', async () => {
        try {
            let modified_buffer = await plugin.nvim.commandOutput("echo getbufinfo({'bufmodified': 1})");
            // myLogger.log(modified_buffer);
            let modified_buffer_list = modified_buffer.match(/{(.|[\s\S])*?}/g);
            // myLogger.log(modified_buffer_list);
            if (modified_buffer_list != null) {
                myLogger.log("send error message to nvim");
                await plugin.nvim.outWrite('Error: some buffers are modified but not saved.\n');
                // return;
            }
            await plugin.nvim.command('%bd');
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