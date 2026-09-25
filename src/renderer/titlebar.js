/* The title in a window's title bar, renamed in place — shared by notes and
 * widgets.
 *
 * Double-click the title (or right-click → Rename…) and it becomes a text
 * field: Enter or clicking away saves, Esc cancels, an empty title falls back
 * to the default. A note with no title shows a faint "Add title" so the
 * feature can be found; a widget falls back to its type's name.
 */
(function () {
  const MAX = 80;

  /**
   * @param {{ el: HTMLElement, placeholder: string, fallback?: string, onSave(title: string): void }} options
   */
  function setup({ el, placeholder, fallback = '', onSave }) {
    let value = '';
    let editing = false;

    function show() {
      el.textContent = value || fallback || placeholder;
      el.classList.toggle('empty', !value && !fallback);
    }

    function edit() {
      if (editing) return;
      editing = true;
      const input = document.createElement('input');
      input.className = 'title-input';
      input.value = value;
      input.placeholder = fallback || placeholder;
      input.maxLength = MAX;
      input.spellcheck = false;
      input.setAttribute('aria-label', 'Title');
      el.replaceWith(input);
      input.focus();
      input.select();

      const finish = (save) => {
        if (!editing) return;
        editing = false;
        if (save) {
          const next = input.value.replace(/\s+/g, ' ').trim();
          if (next !== value) {
            value = next;
            onSave(value);
          }
        }
        input.replaceWith(el);
        show();
      };

      // Handled here and stopped here: Esc must not also leave a note's edit
      // mode, and Enter must not reach the note.
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
        e.stopPropagation();
      });
      input.addEventListener('blur', () => finish(true));
    }

    el.title = 'Double-click to rename';
    el.addEventListener('dblclick', edit);
    show();

    return {
      set(next) {
        value = next || '';
        if (!editing) show();
      },
      edit,
    };
  }

  window.TitleBar = { setup };
})();
