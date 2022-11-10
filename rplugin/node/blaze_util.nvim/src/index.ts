import { NvimPlugin } from 'neovim';
import { Console } from 'console';
// get fs module for creating write streams
import fs from 'fs';
import readline from 'node:readline';
import { chdir } from 'node:process';
// import { VimValue } from 'neovim/lib/types/VimValue';

// make a new logger
const myLogger = new Console({
  stdout: fs.createWriteStream(__dirname + "/normalStdout.txt"),
  stderr: fs.createWriteStream(__dirname + "/errStdErr.txt"),
});

var exec = require('child_process').exec;
function execute(command : string, callback : Function) {
  exec(command, function(error : any, stdout : any, stderr : any) {
    if (error) {
      myLogger.log(error);
    }
    if (stderr) {
      myLogger.log(stderr);
    }
    callback(stdout);
  });
};

// Given a file usr/ycyi/.../google3/ads/ragnarok/abc.cc
// Returns //ads/ragnarok:abc_target
async function findTarget(file_path : string) : Promise<[string, string, number]> {
  let google3_index = file_path.indexOf("google3");
  let google3_base_path : string = "";
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
      const fileStream = fs.createReadStream(build_file_path);
      const read_line = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      let current_target_name : string = "";
      let find_target_file : boolean = false;
      let build_rule_line_number : number = 0;
      let current_line : number = 0;
      for await (const line of read_line) {
        // Finds the build rule.
        current_line = current_line + 1;
        if (line.match(/^\w+\(/)) {
          current_target_name = "";
          build_rule_line_number = current_line;
        };
        // Finds the target file.
        if (line.match(file_name)) {
          find_target_file = true;
        };
        // Fines the target name of the current build rule.
        if (line.match("^ *name *=")) {
          let target_name_match = line.match(/"([\w|\-|\.]+)"/);
          if (target_name_match) {
            current_target_name = target_name_match.at(1) as string;
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
    } catch (err) {
      // If the error does't exist, then we go to the parent dir.
      myLogger.log(err);
      current_dir = path.resolve(current_dir, '..');
    }
  }
  return ["", "", -1];
}

async function findTestCase(file_path : string, current_line : number) : Promise<string> {
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
    // fileContents = fs.readFileSync('foo.bar');
    // const file = fs.readFileSync(build_file_path);
    const fileStream = fs.createReadStream(file_path);
    const read_line = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let test_class : string = "";
    let test_case : string = "";
    let loop_line : number = 0;
    for await (const line of read_line) {
      loop_line = loop_line + 1;
      // myLogger.log(`loop_line: ${loop_line}`)
      let match_test_case = line.match(/^TEST\w+\((\w+), *?(\w+)\)/);
      if (match_test_case) {
        test_class = match_test_case[1];
        test_case = match_test_case[2];
      };
      if (loop_line == current_line) {
        // myLogger.log(`matched loop_line: ${loop_line}`)
        if (test_class == "" || test_case == "") {
          return "";
        }
        return `${test_class}.${test_case}`;
      }
      // myLogger.log(`Line from file: ${line}`);
    }
  } catch (err) {
    // If the error does't exist, then we go to the parent dir.
    myLogger.log(err);
  }
  return "";
}

export default function(plugin : NvimPlugin) : void {
  plugin.setOptions({ dev: true });

  plugin.registerCommand('EchoMessage', async () => {
    try {
      await plugin.nvim.outWrite('Dayman (ah-ah-ah) \n');
    } catch (err) {
      // console.error(err);
    }
  }, { sync: false });

  plugin.registerCommand('Test', async () => {
    try {
      // await plugin.nvim.outWrite('Dayman (ah-ah-ah) \n');
      let getcwd : string = await plugin.nvim.commandOutput("echo expand('%:p')");
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
    } catch (err) {
      myLogger.log(err);
    }
  }, { sync: false });

  plugin.registerCommand('TestCurrentCase', async () => {
    try {
      // Finds the test target.
      let getcwd : string = await plugin.nvim.commandOutput("echo expand('%:p')");
      const [blaze_target] = await findTarget(getcwd);
      if (blaze_target == "") {
        return;
      }
      if (!blaze_target.endsWith("test")) {
        await plugin.nvim.outWrite('Error: current file is not a test file.\n');
        return;
      }

      // Finds the test case.
      let current_line : number = Number(await plugin.nvim.commandOutput("echo line('.')"));
      // myLogger.log(`current_line: ${current_line}`)
      const test_case = await findTestCase(getcwd, current_line);
      // myLogger.log(`test_case: ${test_case}`);
      if (test_case == "") {
        await plugin.nvim.outWrite('Error: did not find the test case.\n');
        return;
      }

      // Sends command to vim to test the test case.
      await plugin.nvim.command(`below sp | below terminal blaze test -c opt ${blaze_target} --test_filter=${test_case}`);
      await plugin.nvim.command("execute(\"normal \\<c-w>\\<c-p>\")");
    } catch (err) {
      myLogger.log(err);
    }
  }, { sync: false });

  plugin.registerCommand('Build', async () => {
    try {
      // await plugin.nvim.outWrite('Dayman (ah-ah-ah) \n');
      let getcwd : string = await plugin.nvim.commandOutput("echo expand('%:p')");
      const [blaze_target] = await findTarget(getcwd);
      if (blaze_target == "") {
        return;
      }
      await plugin.nvim.command("below sp | below terminal blaze build -c opt " + blaze_target);
      await plugin.nvim.command("execute(\"normal \\<c-w>\\<c-p>\")");
    } catch (err) {
      myLogger.log(err);
    }
  }, { sync: false });

  plugin.registerCommand('GoBuildRule', async () => {
    try {
      // await plugin.nvim.outWrite('Dayman (ah-ah-ah) \n');
      let getcwd : string = await plugin.nvim.commandOutput("echo expand('%:p')");
      const [blaze_target, build_file_path, build_rule_line_number] = await findTarget(getcwd);
      if (blaze_target == "") {
        return;
      }
      await plugin.nvim.command(`edit +${build_rule_line_number}  ${build_file_path}`);
    } catch (err) {
      myLogger.log(err);
    }
  }, { sync: false });

  plugin.registerCommand('OpenFilesAtRev', async () => {
    try {
      // let google3_index = file_path.indexOf("google3");
      let vim_working_dir = await plugin.nvim.commandOutput("echo getcwd()")
      chdir(vim_working_dir);
      // myLogger.log(vim_working_dir);
      execute("hg list", async (stdout : string) => {
        // myLogger.log(stdout);
        let file_list : Array<string> = stdout.split('\n');
        file_list.forEach(async (file : string) => {
          if (file != "") {
            // myLogger.log(file);
            await plugin.nvim.command("badd " + file);
          }
        });
        await plugin.nvim.command("call DeleteEmptyBuffers()");
      });
    } catch (err) {
      myLogger.log(err);
    }
  }, { sync: false });

  plugin.registerCommand('DeleteAllBuffer', async () => {
    try {
      let modified_buffer : string = await plugin.nvim.commandOutput("echo getbufinfo({'bufmodified': 1})");
      // myLogger.log(modified_buffer);
      let modified_buffer_list : Array<string> | null = modified_buffer.match(/{(.|[\s\S])*?}/g)
      // myLogger.log(modified_buffer_list);
      if (modified_buffer_list != null) {
        myLogger.log("send error message to nvim");
        await plugin.nvim.outWrite('Error: some buffers are modified but not saved.\n');
        // return;
      }
      await plugin.nvim.command('%bd');
    } catch (err) {
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
};
