const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fileInput = document.getElementById("fileInput");
const tileType = document.getElementById("tileType");
const tilesTraufeInput = document.getElementById("tilesTraufe");
const tilesOrtgangInput = document.getElementById("tilesOrtgang");
const drawGeneratorBtn = document.getElementById("drawGeneratorBtn");
const clearGeneratorBtn = document.getElementById("clearGeneratorBtn");
const moduleOpacityInput = document.getElementById("moduleOpacity");
const roofTypeSelect = document.getElementById("roofType");
const resetBtn = document.getElementById("resetBtn");
const info = document.getElementById("info");

const image = new Image();
let imageLoaded = false;

let polygon = [];
let polygonClosed = false;
let generatorQuad = null;
let draggingIndex = -1;
let fixedModuleCols = 0;
let fixedModuleRows = 0;
let scaleMtoPx = 1;

const MODULE_W = 1.134;
const MODULE_H = 1.765;
const GAP = 0.02;
const MARGIN = 0.3;
const HANDLE_RADIUS = 6;

// ...
