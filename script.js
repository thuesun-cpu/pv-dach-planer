body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  margin: 16px;
}

h1 {
  font-size: 20px;
  margin-bottom: 12px;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  max-width: 900px;
}

.control-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
}

.control-group label {
  font-size: 13px;
}

.control-group input[type="number"] {
  width: 70px;
}

#imageWrapper {
  position: relative;
  display: inline-block;
  border: 1px solid #ccc;
  margin-top: 8px;
  max-width: 100%;
}

#roofImage {
  display: block;
  max-width: 100%;
  cursor: crosshair;
}

#overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* Module sollen anklickbar sein */
  pointer-events: auto;
}

.hint {
  margin-top: 12px;
  font-size: 13px;
  color: #555;
}
