// Six note colours. `dot` is the saturated swatch shown in the picker;
// `bar` is the desaturated version used for the title bar, so a wall of
// open notes reads as a palette rather than a set of traffic lights.
const PALETTE = [
  { id: 'amber',  name: 'Amber',  dot: '#e0a92b', bar: '#8a6a1e' },
  { id: 'rose',   name: 'Rose',   dot: '#e0455f', bar: '#8c2f3e' },
  { id: 'blue',   name: 'Blue',   dot: '#2f7ce0', bar: '#2a5788' },
  { id: 'green',  name: 'Green',  dot: '#35a45b', bar: '#2f6340' },
  { id: 'purple', name: 'Purple', dot: '#8b52d6', bar: '#573283' },
  { id: 'slate',  name: 'Slate',  dot: '#7a7a82', bar: '#4a4a52' },
];

const DEFAULT_COLOR = 'amber';

// The title bar keeps its colour in both themes; only the body follows Windows.
const THEMES = {
  dark:  { bg: '#1e1e20', fg: '#e9e9ec', muted: '#9a9aa2', line: '#34343a', chip: '#2a2a2e' },
  light: { bg: '#fdfdfb', fg: '#26262a', muted: '#6b6b72', line: '#e6e6e1', chip: '#f1f1ec' },
};

function colorOf(id) {
  return PALETTE.find((c) => c.id === id) || PALETTE[0];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PALETTE, THEMES, DEFAULT_COLOR, colorOf };
}
