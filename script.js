let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
let image = new Image();
let polygonPoints = [];
let isDragging = false;
let dragIndex = -1;
let closed = false;
let traufeLength = 0;
let ortgangLength = 0;
let moduleOpacity = 1;

let tileWidths = {
    "21x33": [0.21, 0.33],
    "24x40": [0.24, 0.40],
    "30x33": [0.30, 0.33],
    "30x40": [0.30, 0.40]
};

let selectedTileSize = tileWidths["21x33"];
let modules = [];

document.getElementById("fileInput").addEventListener("change", function (e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = function (event) {
        image.onload = () => {
            canvas.width = image.width;
            canvas.height = image.height;
            drawCanvas();
        };
        image.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

document.getElementById("tileType").addEventListener("change", function (e) {
    selectedTileSize = tileWidths[e.target.value];
    updateMeasurements();
});

document.getElementById("tileTraufe").addEventListener("input", updateMeasurements);
document.getElementById("tileOrtgang").addEventListener("input", updateMeasurements);

document.getElementById("moduleOpacity").addEventListener("input", function (e) {
    moduleOpacity = parseFloat(e.target.value);
    drawCanvas();
});

canvas.addEventListener("mousedown", function (e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!closed) {
        if (polygonPoints.length > 2 && distance(x, y, polygonPoints[0].x, polygonPoints[0].y) < 10) {
            closed = true;
            updateMeasurements();
            return;
        }
        polygonPoints.push({ x, y });
        drawCanvas();
    } else {
        for (let i = 0; i < polygonPoints.length; i++) {
            if (distance(x, y, polygonPoints[i].x, polygonPoints[i].y) < 10) {
                isDragging = true;
                dragIndex = i;
                return;
            }
        }
    }
});

canvas.addEventListener("mousemove", function (e) {
    if (isDragging) {
        const rect = canvas.getBoundingClientRect();
        polygonPoints[dragIndex].x = e.clientX - rect.left;
        polygonPoints[dragIndex].y = e.clientY - rect.top;
        updateMeasurements();
    }
});

canvas.addEventListener("mouseup", function () {
    isDragging = false;
    dragIndex = -1;
});

function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function updateMeasurements() {
    if (!closed || polygonPoints.length < 4) {
        document.getElementById("info").textContent = "Traufe: –, Ortgang: –, Fläche: –";
        return;
    }

    const traufeZiegel = parseInt(document.getElementById("tileTraufe").value);
    const ortgangZiegel = parseInt(document.getElementById("tileOrtgang").value);

    traufeLength = traufeZiegel * selectedTileSize[0];
    ortgangLength = ortgangZiegel * selectedTileSize[1];

    const area = traufeLength * ortgangLength;
    document.getElementById("info").textContent = `Traufe: ${traufeLength.toFixed(2)} m, Ortgang: ${ortgangLength.toFixed(2)} m, Fläche: ${area.toFixed(2)} m²`;

    drawCanvas();
}

function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);

    if (polygonPoints.length > 0) {
        ctx.beginPath();
        ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
        for (let i = 1; i < polygonPoints.length; i++) {
            ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
        }
        if (closed) {
            ctx.closePath();
        }
        ctx.strokeStyle = "green";
        ctx.lineWidth = 2;
        ctx.stroke();

        polygonPoints.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = "cyan";
            ctx.fill();
        });
    }

    if (closed) {
        drawModules();
    }
}

function drawModules() {
    const cols = Math.floor(traufeLength / 1.2);
    const rows = Math.floor(ortgangLength / 1.8);
    const startX = polygonPoints[0].x;
    const startY = polygonPoints[0].y + 30;

    ctx.fillStyle = `rgba(0, 0, 0, ${moduleOpacity})`;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            ctx.fillRect(startX + c * 122, startY + r * 182, 120, 180);
        }
    }
}
