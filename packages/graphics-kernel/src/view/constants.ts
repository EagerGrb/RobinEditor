
export const PCB_COLORS = {
  LAYERS: {
    TOP_LAYER: '#FF0000',    // Red
    BOTTOM_LAYER: '#0000FF', // Blue
    TOP_SILK: '#FFFF00',     // Yellow
    BOTTOM_SILK: '#00FF00',  // Green
    MECH: '#FF00FF',         // Purple
    BOARD_OUTLINE: '#FF00FF'
  },
  PAD: {
    THROUGH_HOLE: '#FFFFFF', // Hole center color
    PLATING_BAR: '#C0C0C0'   // Plating ring
  },
  SELECTION: '#FFFFFF',      // Selection highlight
  HOVER: 'rgba(255, 255, 255, 0.3)',
  ERROR: '#FFFF00',          // DRC Error
  GHOST: 'rgba(255, 255, 255, 0.5)' // Ghosting
};

export const LINE_WIDTHS = {
  GRID_MAJOR: 1,
  GRID_MINOR: 0.5,
  OUTLINE: 2,
  SELECTION_OUTLINE: 2
};
