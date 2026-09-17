  var S = 60, MARGIN = 60, TAU = Math.PI * 2;
  var state = {
    cols: 7, rows: 7, offset: false, defaultPct: 71, fillet: 0.3, guideOpacity: 0.6, bevel: 1,
    shapeColor: '#111111', bgColor: '#ffffff', sym: 'none',
    nodes: {},          // key -> { pct, filled }
    contours: [],       // { id, tangents, closed:true, single?, notches:[], holes:[] }
    reference: null, nextId: 1, tool: 'lassoAdd', selected: null
  };
  var undoStack = [], redoStack = [];
  var $ = function(id){ return document.getElementById(id); };
  var svg = $('canvas'), frame = $('frame'), wrap = $('wrap');
  var touchEditing = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  svg.classList.toggle('touch-edit', touchEditing);
  function setStatus(m){ $('status').textContent = m || ''; }

  function createCanvas(){ return document.createElement('canvas'); }
