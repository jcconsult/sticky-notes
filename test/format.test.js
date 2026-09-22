/* Tests for the Markdown formatting engine.
 *
 * format.js only touches the DOM through a textarea and document.execCommand,
 * so a small stub is enough to run the whole thing under plain Node — no test
 * framework, no headless browser.
 *
 *   npm test
 */
const path = require('path');

let focused = null;

function makeTextarea(value, start, end) {
  return {
    value,
    selectionStart: start,
    selectionEnd: end === undefined ? start : end,
    focus() { focused = this; },
    setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; },
    setRangeText() { throw new Error('execCommand fallback should not be reached'); },
    dispatchEvent() {},
  };
}

global.document = {
  execCommand(_command, _ui, text) {
    const ta = focused;
    ta.value = ta.value.slice(0, ta.selectionStart) + text + ta.value.slice(ta.selectionEnd);
    const caret = ta.selectionStart + text.length;
    ta.selectionStart = caret;
    ta.selectionEnd = caret;
    return true;
  },
};
global.window = {};

require(path.join(__dirname, '..', 'src', 'renderer', 'format.js'));
const F = global.window.NoteFormat;

let pass = 0;
let fail = 0;

function check(label, got, want) {
  if (got === want) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}`);
    console.log(`         got:  ${JSON.stringify(got)}`);
    console.log(`         want: ${JSON.stringify(want)}`);
  }
}

// --- bold / italic ---------------------------------------------------------

let ta = makeTextarea('hello world', 6, 11);
F.toggleWrap(ta, '**');
check('bold a selected word', ta.value, 'hello **world**');

ta = makeTextarea('hello **world**', 8, 13);
F.toggleWrap(ta, '**');
check('unbold from inside the markers', ta.value, 'hello world');

// The case that makes a naive implementation wrong: italic on bold text must
// nest, not strip one asterisk from each side.
ta = makeTextarea('**world**', 2, 7);
F.toggleWrap(ta, '*');
check('italic on bold nests, not peels', ta.value, '***world***');

ta = makeTextarea('*world*', 1, 6);
F.toggleWrap(ta, '*');
check('un-italic plain italic', ta.value, 'world');

ta = makeTextarea('one two three', 5, 5);
F.toggleWrap(ta, '**');
check('bold with no selection uses the word under the caret', ta.value, 'one **two** three');

ta = makeTextarea('a b', 0, 3);
F.toggleWrap(ta, '`');
check('inline code', ta.value, '`a b`');

ta = makeTextarea('~~gone~~', 2, 6);
F.toggleWrap(ta, '~~');
check('un-strikethrough', ta.value, 'gone');

// --- headings --------------------------------------------------------------

ta = makeTextarea('Title', 2);
F.cycleHeading(ta);
check('heading: none -> h1', ta.value, '# Title');
F.cycleHeading(ta);
check('heading: h1 -> h2', ta.value, '## Title');
F.cycleHeading(ta);
check('heading: h2 -> h3', ta.value, '### Title');
F.cycleHeading(ta);
check('heading: h3 -> none', ta.value, 'Title');

ta = makeTextarea('first\nsecond\nthird', 8);
F.cycleHeading(ta);
check('heading only touches its own line', ta.value, 'first\n# second\nthird');

// --- checklists ------------------------------------------------------------

ta = makeTextarea('Buy milk', 3);
F.toggleTask(ta);
check('task: plain -> unchecked', ta.value, '- [ ] Buy milk');
F.toggleTask(ta);
check('task: unchecked -> plain bullet', ta.value, '- Buy milk');

ta = makeTextarea('- [x] Done', 8);
F.toggleTask(ta);
check('task: checked -> plain bullet', ta.value, '- Done');

ta = makeTextarea('a\n- item\nb', 4);
F.toggleTask(ta);
check('task: an existing bullet gains a box', ta.value, 'a\n- [ ] item\nb');

// --- links -----------------------------------------------------------------

ta = makeTextarea('see docs here', 4, 8);
F.insertLink(ta);
check('link wraps the selection', ta.value, 'see [docs](https://) here');
check(
  'link leaves the url selected to type over',
  ta.value.slice(ta.selectionStart, ta.selectionEnd),
  'https://',
);

ta = makeTextarea('', 0, 0);
F.insertLink(ta);
check('link with nothing selected', ta.value, '[link](https://)');

// --- helpers ---------------------------------------------------------------

check('wordAt', JSON.stringify(F.wordAt('one two', 5)), '[4,7]');
check('lineAt', JSON.stringify(F.lineAt('a\nbb\nc', 3)), '[2,4]');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
