/* Markdown formatting operations on a <textarea>, plus the geometry needed to
 * float a toolbar next to the selection.
 *
 * Every edit goes through document.execCommand('insertText'). That is
 * deprecated but it is the only way to change a textarea's value while keeping
 * Chromium's native undo stack: setRangeText() silently destroys it, and a
 * formatting button that breaks Ctrl+Z is worse than no button at all.
 */
(function () {
  const WORD = /[\w'’-]/;

  function replace(textarea, start, end, text) {
    textarea.focus();
    textarea.setSelectionRange(start, end);
    if (!document.execCommand('insertText', false, text)) {
      // Fallback for the day execCommand finally goes away. Undo suffers,
      // but the edit still lands and the note still saves.
      textarea.setRangeText(text, start, end, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function wordAt(value, index) {
    let start = index;
    let end = index;
    while (start > 0 && WORD.test(value[start - 1])) start -= 1;
    while (end < value.length && WORD.test(value[end])) end += 1;
    return [start, end];
  }

  function lineAt(value, index) {
    const start = value.lastIndexOf('\n', index - 1) + 1;
    const end = value.indexOf('\n', index) === -1 ? value.length : value.indexOf('\n', index);
    return [start, end];
  }

  // Is the selection already surrounded by these markers?
  function wrappedOutside(value, start, end, marker) {
    if (start < marker.length) return false;
    if (value.slice(start - marker.length, start) !== marker) return false;
    if (value.slice(end, end + marker.length) !== marker) return false;
    // `*` must not match the inner half of `**`, or italic would peel bold.
    if (marker === '*' && value.slice(start - 2, start) === '**' && value.slice(end, end + 2) === '**') {
      return false;
    }
    return true;
  }

  function wrappedInside(selected, marker) {
    if (selected.length < marker.length * 2) return false;
    if (!selected.startsWith(marker) || !selected.endsWith(marker)) return false;
    if (marker === '*' && selected.startsWith('**') && selected.endsWith('**')) return false;
    return true;
  }

  function toggleWrap(textarea, marker) {
    const { value } = textarea;
    let start = textarea.selectionStart;
    let end = textarea.selectionEnd;
    // With no selection, act on the word under the caret — pressing Ctrl+B
    // mid-word should bold the word, not insert empty markers.
    if (start === end) [start, end] = wordAt(value, start);
    const selected = value.slice(start, end);

    if (wrappedOutside(value, start, end, marker)) {
      replace(textarea, start - marker.length, end + marker.length, selected);
      textarea.setSelectionRange(start - marker.length, end - marker.length);
      return;
    }
    if (wrappedInside(selected, marker)) {
      const inner = selected.slice(marker.length, -marker.length);
      replace(textarea, start, end, inner);
      textarea.setSelectionRange(start, start + inner.length);
      return;
    }
    replace(textarea, start, end, marker + selected + marker);
    textarea.setSelectionRange(start + marker.length, end + marker.length);
  }

  // none -> # -> ## -> ### -> none
  function cycleHeading(textarea) {
    const [start, end] = lineAt(textarea.value, textarea.selectionStart);
    const line = textarea.value.slice(start, end);
    const match = /^(#{1,3})\s+/.exec(line);

    let next;
    if (!match) next = `# ${line}`;
    else if (match[1].length < 3) next = `${'#'.repeat(match[1].length + 1)} ${line.slice(match[0].length)}`;
    else next = line.slice(match[0].length);

    replace(textarea, start, end, next);
    textarea.setSelectionRange(start + next.length, start + next.length);
  }

  function toggleTask(textarea) {
    const [start, end] = lineAt(textarea.value, textarea.selectionStart);
    const line = textarea.value.slice(start, end);

    let next;
    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) next = line.replace(/^(\s*[-*+]\s+)\[[ xX]\]\s+/, '$1');
    else if (/^\s*[-*+]\s+/.test(line)) next = line.replace(/^(\s*[-*+]\s+)/, '$1[ ] ');
    else next = `- [ ] ${line}`;

    replace(textarea, start, end, next);
    textarea.setSelectionRange(start + next.length, start + next.length);
  }

  function insertLink(textarea) {
    const { value } = textarea;
    let start = textarea.selectionStart;
    let end = textarea.selectionEnd;
    if (start === end) [start, end] = wordAt(value, start);

    const text = value.slice(start, end) || 'link';
    replace(textarea, start, end, `[${text}](https://)`);
    // Leave the URL selected so it can be typed straight over.
    const url = start + text.length + 3;
    textarea.setSelectionRange(url, url + 'https://'.length);
  }

  // -------------------------------------------------------------- geometry

  const MIRROR = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
    'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'tabSize',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  ];

  // A textarea exposes no per-character coordinates, so measure a hidden div
  // that wraps text identically and read the offset of a marker span.
  function caretRect(textarea, index) {
    const style = window.getComputedStyle(textarea);
    const mirror = document.createElement('div');
    for (const prop of MIRROR) mirror.style[prop] = style[prop];
    Object.assign(mirror.style, {
      position: 'absolute',
      top: '0',
      left: '-9999px',
      visibility: 'hidden',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'break-word',
      boxSizing: 'border-box',
      border: '0',
      width: `${textarea.clientWidth}px`,
    });

    mirror.textContent = textarea.value.slice(0, index);
    const marker = document.createElement('span');
    marker.textContent = textarea.value.slice(index, index + 1) || '.';
    mirror.appendChild(marker);

    document.body.appendChild(mirror);
    const { offsetTop, offsetLeft, offsetHeight } = marker;
    document.body.removeChild(mirror);

    const box = textarea.getBoundingClientRect();
    return {
      left: box.left + offsetLeft - textarea.scrollLeft,
      top: box.top + offsetTop - textarea.scrollTop,
      height: offsetHeight,
    };
  }

  window.NoteFormat = {
    toggleWrap, cycleHeading, toggleTask, insertLink, caretRect, wordAt, lineAt,
  };
})();
