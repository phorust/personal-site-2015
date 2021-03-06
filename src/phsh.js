var Directory = modules.filesys.Directory;
var File      = modules.filesys.File;
var Link      = modules.filesys.Link;
var cleanPath = modules.filesys.cleanPath;
var fshome    = modules.filesys.fshome;
var fsroot    = modules.filesys.fsroot;
var getByPath = modules.filesys.getByPath;
var PROMPT    = modules.term.PROMPT;
var WIDTH     = modules.term.WIDTH;
var minimize  = modules.term.minimize;
var showAbout = modules.kml_new.showAbout;

var commandsRun  = [];
var commandIndex = -1; // counts backwards
var cwd;
var lastwd;

/* Shell internal functions */
function init() {
  cwd = fshome;
  lastwd = fshome;
  updatePrompt();
}

function print(s: string, noNewline?: boolean, noPrompt?: boolean) {
  noPrompt || printOldPrompt();
  noNewline || $('#textarea').append('<span class="cmdoutput">' + s + '</span><br>');
}

function printf(tokens: Array<Object>, columns?: number, noPrompt?: boolean) {
  var maxTokenLen = 0;
  var columnWidth;
  var columnsPerRow;
  for (var token of tokens) {
    maxTokenLen = Math.max(maxTokenLen, token.text.length);
  }
  columnWidth = maxTokenLen + 1;
  columnsPerRow = Math.max(1, Math.trunc(WIDTH / columnWidth));

  // null columns is auto
  columns || (columns = columnsPerRow);

  var toPrint = '';
  noPrompt || printOldPrompt();

  for (var i = 0; i < tokens.length; i++) {
    var withPadding = tokens[i].markup;
    for (var j = tokens[i].text.length; j < columnWidth; j++) {
      withPadding += ' ';
    }

    if (i > 0 && i % columns == 0) {
      toPrint += '<br>';
    }
    toPrint += withPadding;
  }
  $('#textarea').append(toPrint + '<br>');
}

function cycleCommand(n) {
  var toDisplay;
  commandIndex -= n;
  commandIndex = Math.min(commandIndex, commandsRun.length - 1);
  commandIndex = Math.max(0, commandIndex);
  toDisplay = commandsRun.length - 1 - commandIndex;
  $('#lastline > input').val(commandsRun[toDisplay]);
}

function updatePrompt(path?: string) {
  path || (path = cwd.getPath());
  path = cleanPath(path);
  $('.prompt_path').last().text(path);

  // If the terminal is hidden, width() is 0
  var promptPathStringWidth = $('.prompt_path').last().width() || 8;
  var promptCharacterWidth  = ($('.prompt_arrow').width() || 8) * 3;
  $('#lastline > input').width(
    $('#output').width() - promptPathStringWidth - promptCharacterWidth
  );
}

function printOldPrompt() {
  $('#textarea').append(
    PROMPT + $('#lastline > input').val() + '<br>'
  );
  $('#textarea .prompt_path').last().text(
    $('.prompt_path').last().text()
  );
}

function processInput() {
  var input  = $('#lastline > input').val();
  var tokens = input.split(' ').filter(s => { return s !== ""; }); // other whitespace?

  if (input !== '') {
    switch (tokens[0]) {
      case 'cat':
        cat(tokens);
        break;
      case 'cd':
        cd(tokens);
        break;
      case 'clear':
        clear(tokens);
        break;
      case 'echo':
        echo(tokens);
        break;
      case 'exit':
        exit(tokens);
        break;
      case 'll':
        tokens.splice(1, 0, '-l');
        // purposeful lack of break;
      case 'ls':
        ls(tokens);
        break;
      case 'logout':
        exit(tokens);
        break;
      case 'node':
        node(tokens);
        break;
      case 'pwd':
        pwd(tokens);
        break;
      case 'reset':
        reset(tokens);
        break;
      // case 'touch':
      //   touch(tokens);
      //   break;
      case 'uptime':
        uptime(tokens);
        break;
      case 'w':
      case 'who': // not really the same
        print('who');
        break;
      case 'whoami':
        print('phorust');
        break;
      case 'where':
        print('test4');
        break;
      case 'which':
        print('test5');
        break;
      default:
        print('phsh: command not found: ' + tokens[0]);
    }

    commandsRun.push(input);
    $('#lastline > input').val('');
    updatePrompt();
  } else {
    print('', true);
  }
}

// TODO: wtf this looks great why is it not being used
function processFlags(tokens, flags) {
  // O(nm) where n is num flags and m is sum lengths of tokens
  var found = new Set();
  for (var token of tokens) {
    if (token[0] === '-') {
      // --long-form-options
      if (token[1] === '-') {
        if (flags.indexOf(token) !== -1) {
          found.add(token);
        }
      }
      // -lAGh, short form options which can be concat together
      for (var flag of flags) {
        if (found.has(flag)) { continue; }
        if (token.indexOf(flag) !== -1) {
          found.add(flag);
        }
      }
    }
  }

  return Array.from(found);
}

function suggestCommand() {
  // TODO
}

/**
 * If your command has to do with the filesystem, which it probably does,
 * it shouldn't look for files from argv on its own, but instead use this.
 *
 * If any of the callbacks return false, processing of tokens ceases.
 */
function tokensToFileSysObjs(tokens               : Array<string>,
                             fileCallback         : Function,
                             notFileCallback      : Function,
                             dirCallback          : Function,
                             notDirCallback       : Function,
                             doesNotExistCallback : Function) {
  var _fileFound = file => {
    if (file instanceof Directory) {
      if (!dirCallback(file, token)) { return; }
    } else {
      if (!notDirCallback(file, token)) { return; }
    }
    if (file instanceof File) {
      if (!fileCallback(file, token)) { return; }
    } else {
      if (!notFileCallback(file, token)) { return; }
    }
    return true;
  };

  var files = cwd.list();

  // in local dir
  for (var token of tokens) {
    if (token[0] == '/' || token[0] == '~') {
      // Absolute path or relative to home
      var file = getByPath(token);
      if (file) {
        if (!_fileFound(file)) { return; }
      } else {
        if (!doesNotExistCallback(files[token], token)) { return; }
      }
    } else if (files[token]) {
      // Local path
      if (!_fileFound(files[token])) { return; }
    } else if (token === '.') {
      if (!dirCallback(cwd, token)) { return; }
    } else if (token === '..') {
      if (!dirCallback(cwd.parentdir || cwd, token)) { return; }
    } else {
      if (!doesNotExistCallback(files[token], token)) { return; }
    }
  }
}


/* Commands. TODO: move to new file */
function cat(argv) {
  print('', true);
  if (argv.length <= 1) {
    // real cat enters an interactive mode but...
    return;
  }
  var _cat_file = (fsobj: FileSysObj, token: string) => {
    print(fsobj.contents, false, true);
    return true;
  }
  var _cat_dir = (fsobj: FileSysObj, token: string) => {
    print(`cat: ${token}: Is a directory`, false, true);
    return true;
  }
  var _cat_dne = (fsobj: FileSysObj, token: string) => {
    print(`cat: ${token}: No such file or directory`, false, true);
    return true;
  }

  tokensToFileSysObjs(argv.slice(1, argv.length),
                      _cat_file,
                      _=>{return true;},
                      _cat_dir,
                      _=>{return true;},
                      _cat_dne);
}

/**
 * Change directory.
 *
 * There's some weird behavior zsh displays:
 * in a sub dir of ~
 *   > cd ~ doesnotexist
 *   cd: no such file or directory: doesnotexist/<pathToCurDirFrom ~>
 * in not a sub dir of ~
 *   > cd ~ doesnotexist
 *   cd: string not in pwd: /Users/phorust
 * Other cases not yet correctly implemented:
 * multiple args
 *   > cd .. doesnotexist
 *   cd: string not in pwd: ..
 */
function cd(argv) {
  // Special path codes
  if (argv[1] === '-') {
    [lastwd, cwd] = [cwd, lastwd];
    print(cwd.getPath());
    return;
  } else if (argv[1] === '..') {
    lastwd = cwd;
    cwd = cwd.parentdir || cwd;
    return print('', true);
  } else if (argv[1] === '.') {
    return print('', true);
  }

  var _cd_file = (fsobj: FileSysObj, token: string) => {
    return print(`cd: not a directory: ${token}`);
  }
  var _cd_dir = (fsobj: FileSysObj, token: string) => {
    lastwd = cwd;
    cwd = fsobj;
    return print('', true);
  }
  var _cd_dne = (fsobj: FileSysObj, token: string) => {
    return print(`cd: no such file or directory: ${token}`);
  }
  var _cd_not_dir = _cd_file;
  if (argv.length === 1) {
    _cd_dir(fshome, '');
  } else {
    tokensToFileSysObjs(argv.slice(1, 2),
                        _cd_file,
                        _=>{},
                        _cd_dir,
                        _cd_not_dir,
                        _cd_dne);
  }
}

function clear(argv) {
  $('#textarea').html('');
}

function echo(argv) {
  if (argv[1]) {
    if (argv[1][0] == '$') {
      switch (argv[1]) {
        case '$HOME':
          print('/home/phorust');
          break;
        case '$TERM':
          print('phorust-term');
          break;
        case '$USER':
          print('phorust');
          break;
        case '$EDITOR':
          print('vim');
          break;
        case '$SHELL':
          print('/bin/phsh');
          break;
        case '$PATH':
          print('/home/phorust/bin:/usr/bin:/usr/sbin');
          break;
      }
    } else {
      // handle "" later
      var toPrint = '';
      for(var i = 1; i < argv.length; i++) {
        toPrint += argv[i] + ' ';
      }
      print(toPrint);
    }
  }
}

function exit(argv) {
  minimize();
  showAbout();
  clear();
  init();
}

function ls(argv) {
  var _ls_file = (fsobj: FileSysObj, token: string) => {
    print(`${token}`, false, true);
    if (argv.length > 2) {
      print('', false, true);
    }
    return true;
  }
  var _ls_dir = (dir: Directory, token: string) => {
    var files = dir.list();
    var toPrint = [];
    if (argv.length > 2) {
      print(`${token}:`, false, true);
    }
    for (var filename of Object.keys(files).sort()) {
      var innermarkup = filename;
      if (files[filename] instanceof Link) {
        innermarkup = `<a target="_blank" href="${files[filename].link}">${filename}</a>`;
      }
      var markup = `<span class='${files[filename].getCSSClass()}'>${innermarkup}</span>`;
      toPrint.push({ text: filename,
                     markup });
    }
    printf(toPrint, false, true);
    if (argv.length > 2) {
      print('', false, true);
    }
    return true;
  }
  var _ls_dne = (fsobj: FileSysObj, token: string) => {
    print(`ls: ${token}: No such file or directory`, false, true);
    if (argv.length > 2) {
      print('', false, true);
    }
    return true;
  }

  if (argv.length === 1) {
    // get prompt w/o newline
    print('', true);
    _ls_dir(cwd, '');
  } else {
    print('', true);
    tokensToFileSysObjs(argv.slice(1, argv.length),
                        _ls_file,
                        _=>{return true;},
                        _ls_dir,
                        _=>{return true;},
                        _ls_dne);
  }
}

function node() {
  // babel.run('var test = "hello world";');
  // babel.run('console.log(test);');
}

function pwd(tokens) {
  print(cwd.getPath());
}

function reset(tokens) {
  clear();
  init();
}

function uptime(argv) {
  var secs = (Date.now() - startTime) / 1000;
  var mins = Math.round(secs / 60);
  var secs = Math.round(secs % 60);
  if (mins < 10) {
    mins = '0' + mins;
  }
  if (secs < 10) {
    secs = '0' + secs;
  }
  print(mins + ':' + secs);
}


$(document).ready(_ => {
  init();

  $('#lastline').on('keyup', e => {
    e.preventDefault();
    switch (e.keyCode) {
      case 38: // up
        cycleCommand(-1);
        break;
      case 40: // down
        cycleCommand(1);
        break;
      case 13: // enter
        processInput();
        $('#output').scrollTop($('#textarea').height());
        commandIndex = -1;
        break;
      default:
        return;
    }
  });
  $('#lastline').on('keydown', e => {
    // grab before input focus leaves
    switch (e.keyCode) {
      case 9:
        e.preventDefault();
        suggestCommand();
        break;
      default:
        return;
    }
  });
});

module.exports('phsh', {});
