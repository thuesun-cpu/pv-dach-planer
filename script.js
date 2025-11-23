const fileInput = document.getElementById("fileInput");
const resetBtn = document.getElementById("resetBtn");
const pointInfo = document.getElementById("pointInfo");
const imageWrapper = document.getElementById("imageWrapper");
const roofImage = document.getElementById("roofImage");
const overlay = document.getElementById("overlay");

let points = [];
let imgLoaded = false;

fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    roofImage.src = reader.result;
    points = [];
    imgLoaded = true;
    resetBtn.disabled = false;
    pointInfo.textContent = "";
    clearOverlay();
  };
  reader.readAsDataURL(file);
});

roofImage.addEventListener("load", () => {
  // Größe des SVG an Bild anpassen
  overlay.setAttribute("viewBox", `0 0 ${roofImage.naturalWidth} ${roofImage.naturalHeight}`);
});

imageWrapper.addEventListener("click", (e) => {
  if (!imgLoaded) return;

  const rect = roofImage.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Koordinaten in Bild-Koordinaten umrechnen (wegen Skalierung)
  const scaleX = roofImage.naturalWidth / rect.width;
  const scaleY = roofImage.naturalHeight / rect.height;
  const imgX = x * scaleX;
  const imgY = y * scaleY;

  points.push({ x: imgX, y: imgY });
  redrawOverlay();
});

resetBtn.addEventListener("click", () => {
  points = [];
  clearOverlay();
  pointInfo.textContent = "";
});

function clearOverlay() {
  while (overlay.firstChild) {
    overlay.removeChild(overlay.firstChild);
  }
}

function redrawOverlay() {
  clearOverlay();

  // Linien
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i];
    const n = points[i + 1];

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", p.x);
    line.setAttribute("y1", p.y);
    line.setAttribute("x2", n.x);
    line.setAttribute("y2", n.y);
    line.setAttribute("stroke", "red");
    line.setAttribute("stroke-width", "2");
    overlay.appendChild(line);
  }

  // Punkte
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", p.x);
    circle.setAttribute("cy", p.y);
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", "red");
    circle.setAttribute("stroke", "white");
    circle.setAttribute("stroke-width", "1");
    overlay.appendChild(circle);
  }

  pointInfo.textContent = `Punkte: ${points.length}`;
}
