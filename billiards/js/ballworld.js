'use strict'

var SERVER_URL = window.location.hostname === "teichmath.github.io"
    ? "https://web-production-208f4.up.railway.app"
    : "";

var SESSION_ID = localStorage.getItem("ballworld_session");
if (!SESSION_ID) {
    SESSION_ID = Math.random().toString(36).substr(2, 9) + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("ballworld_session", SESSION_ID);
}

var app;
var update_values;
var interact_values;
var intervalID;
var consecutiveErrors = 0;

// Cue stick state
var cueAngle = 0;
var dialDragging = false;

// Pocket state
var pocketMode = false;
var activePocketRadius = 0;
var knownPockets = [];

function showConnectionError() {
    clearInterval(intervalID);
    var overlay = document.getElementById("error-msg");
    if (overlay) overlay.style.display = "flex";
}

function createApp(canvas) {
    var c = canvas.getContext("2d");

    var drawBall = function(x, y, radius, color) {
        c.beginPath();
        c.arc(x, y, radius, 0, 6.3, false);
        c.closePath();
        c.fillStyle = color;
        c.fill();
        if(radius > 2) c.stroke();
    }

    var clear = function() {
        c.clearRect(0, 0, canvas.width, canvas.height);
    }

    var drawPocket = function(x, y, radius, flashColor) {
        c.save();
        c.beginPath();
        c.arc(x, y, radius, 0, Math.PI * 2);
        c.clip();

        // Background: darker-than-table grey, or flash color
        c.fillStyle = flashColor || "#a8a8a8";
        c.fillRect(x - radius, y - radius, radius * 2, radius * 2);

        // Diagonal black stripes at 45° by rotating the coordinate system
        c.translate(x, y);
        c.rotate(Math.PI / 4);
        c.fillStyle = "black";
        var sw = Math.max(2, radius * 0.15);
        for (var i = -radius * 3; i < radius * 3; i += sw * 2) {
            c.fillRect(i, -radius * 2, sw, radius * 4);
        }

        c.restore();
    }

    return {
        drawBall: drawBall,
        drawPocket: drawPocket,
        clear: clear
    }
}

function fitCanvas() {
    var canvas = document.getElementById("main-canvas");
    var overlay = document.getElementById("cue-overlay");
    var controls = document.getElementById("controls");
    var title = document.querySelector("h1");
    var availW = window.innerWidth - controls.offsetWidth - 26;
    var availH = window.innerHeight - title.offsetHeight - 16;
    var size = Math.min(availW, availH, 800);
    if (size > 0) {
        canvas.style.width = size + "px";
        canvas.style.height = size + "px";
        overlay.style.width = size + "px";
        overlay.style.height = size + "px";
        controls.style.height = (size + 4) + "px";
    }
}

// --- Cue dial ---

function initCueDial() {
    var dial = document.getElementById("cue-dial");
    drawDial(dial);

    dial.addEventListener("mousedown", function(e) {
        dialDragging = true;
        updateDialAngle(dial, e);
        e.preventDefault();
    });
    document.addEventListener("mousemove", function(e) {
        if (!dialDragging) return;
        updateDialAngle(dial, e);
    });
    document.addEventListener("mouseup", function() {
        dialDragging = false;
    });
}

function updateDialAngle(dial, e) {
    var rect = dial.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    cueAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    drawDial(dial);
}

function drawDial(dial) {
    var ctx = dial.getContext("2d");
    var w = dial.width, h = dial.height;
    var cx = w / 2, cy = h / 2;
    var r = Math.min(w, h) / 2 - 3;

    ctx.clearRect(0, 0, w, h);

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#2a5c2a";
    ctx.fill();
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tick marks at cardinal directions
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    [0, Math.PI/2, Math.PI, 3*Math.PI/2].forEach(function(a) {
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.stroke();
    });

    // Arrow shaft
    var arrowLen = r - 10;
    var tipX = cx + Math.cos(cueAngle) * arrowLen;
    var tipY = cy + Math.sin(cueAngle) * arrowLen;
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Arrowhead
    var headLen = 9;
    var headAngle = Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(cueAngle - headAngle),
               tipY - headLen * Math.sin(cueAngle - headAngle));
    ctx.lineTo(tipX - headLen * Math.cos(cueAngle + headAngle),
               tipY - headLen * Math.sin(cueAngle + headAngle));
    ctx.closePath();
    ctx.fillStyle = "white";
    ctx.fill();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = "white";
    ctx.fill();
}

// --- Cue overlay cursor and click ---

function initCueOverlay() {
    var overlay = document.getElementById("cue-overlay");
    var octx = overlay.getContext("2d");

    overlay.addEventListener("mousemove", function(e) {
        var coords = overlayCoords(overlay, e);
        if (pocketMode) {
            drawPocketCursor(octx, coords.x, coords.y);
        } else {
            drawCueCursor(octx, coords.x, coords.y);
        }
    });

    overlay.addEventListener("mouseleave", function() {
        octx.clearRect(0, 0, overlay.width, overlay.height);
    });

    overlay.addEventListener("click", function(e) {
        var coords = overlayCoords(overlay, e);
        if (pocketMode) {
            placePocket(coords.x, coords.y, activePocketRadius);
        } else {
            var strength = parseInt(document.getElementById("cue-strength").value);
            fireImpulse(coords.x, coords.y, strength);
        }
    });
}

function overlayCoords(overlay, e) {
    var scaleX = overlay.width / overlay.offsetWidth;
    var scaleY = overlay.height / overlay.offsetHeight;
    return { x: e.offsetX * scaleX, y: e.offsetY * scaleY };
}

function drawCueCursor(ctx, cx, cy) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    var strength = parseInt(document.getElementById("cue-strength").value);
    var capLen = 10;
    var stickLen = strength * 5 + 10;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(cueAngle);

    // Yellow stick extending backward from the tip
    ctx.fillStyle = "#FFD700";
    ctx.fillRect(-(capLen + stickLen), -3, stickLen, 6);

    // White cap at the forward (arrow-head) end
    ctx.fillStyle = "white";
    ctx.fillRect(-capLen, -3, capLen, 6);

    ctx.restore();
}

function fireImpulse(x, y, strength) {
    console.log("impulse click x=" + x.toFixed(1) + " y=" + y.toFixed(1) + " angle=" + cueAngle.toFixed(3) + " strength=" + strength);
    $.post(SERVER_URL + "/impulse?sid=" + SESSION_ID,
        { x: x, y: y, angle: cueAngle, strength: strength },
        function() { console.log("impulse ok"); }, "json"
    ).fail(function(xhr) {
        console.warn("Impulse failed:", xhr.status, xhr.statusText);
    });
}

function drawPocketCursor(ctx, cx, cy) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    var r = activePocketRadius;
    var valid = isPocketValid(cx, cy, r);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = valid ? "white" : "red";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.restore();
}

function isPocketValid(x, y, r) {
    var canvas = document.getElementById("main-canvas");
    if (x < 0 || x > canvas.width || y < 0 || y > canvas.height) return false;
    for (var i = 0; i < knownPockets.length; i++) {
        var p = knownPockets[i];
        var dx = p.x - x, dy = p.y - y;
        if (Math.sqrt(dx * dx + dy * dy) < p.radius + r) return false;
    }
    return true;
}

function placePocket(x, y, radius) {
    if (!isPocketValid(x, y, radius)) return;
    $.post(SERVER_URL + "/pocket?sid=" + SESSION_ID,
        { x: x, y: y, radius: radius },
        function() {}, "json"
    ).fail(function(xhr) {
        console.warn("Pocket placement failed:", xhr.status, xhr.statusText);
    });
}

function clearPockets() {
    $.get(SERVER_URL + "/clearpockets?sid=" + SESSION_ID, function() {}, "json");
}

// --- Ball world ---

var PHYSICS_SLIDERS = [
    {
        group: "Cloth Friction",
        params: [
            { id: "gEff",  label: "G_EFF",  min: 0.1, max: 5.0,  step: 0.1,   def: 1.0,
              desc: "Deceleration scale — master multiplier for how aggressively friction acts on the ball." },
            { id: "muK",   label: "MU_K",   min: 0.01, max: 1.0, step: 0.01,  def: 0.3,
              desc: "Sliding friction — how quickly a newly-struck ball spins up to a pure roll." },
            { id: "muR",   label: "MU_R",   min: 0.005, max: 0.5, step: 0.005, def: 0.1,
              desc: "Rolling friction — how slowly a rolling ball coasts to a stop." },
            { id: "muS",   label: "MU_S",   min: 0.005, max: 0.3, step: 0.005, def: 0.05,
              desc: "Spin decay — how quickly side-spin dissipates against the cloth." }
        ]
    },
    {
        group: "Rail / Cushion",
        params: [
            { id: "eps",   label: "EPS",    min: 0.1, max: 1.0,  step: 0.05,  def: 0.7,
              desc: "Rail restitution — fraction of normal speed kept after hitting a cushion. 0 = dead, 1 = full bounce." },
            { id: "muC",   label: "MU_C",   min: 0.0, max: 0.5,  step: 0.01,  def: 0.1,
              desc: "Rail friction — how much parallel (along-cushion) speed is scrubbed off on contact." },
            { id: "gamma", label: "GAMMA",  min: 0.0, max: 0.5,  step: 0.01,  def: 0.15,
              desc: "Rail spin kick — how much existing side-spin deflects the ball sideways off the rail." },
            { id: "beta",  label: "BETA",   min: 0.0, max: 1.0,  step: 0.05,  def: 0.5,
              desc: "Rail spin drain — fraction of side-spin absorbed by the cushion on contact." }
        ]
    },
    {
        group: "Ball-on-Ball",
        params: [
            { id: "eBall",  label: "E_BALL",  min: 0.5, max: 1.0, step: 0.01,  def: 0.95,
              desc: "Ball restitution — how elastic ball-to-ball collisions are." },
            { id: "muB",    label: "MU_B",    min: 0.0, max: 0.2, step: 0.005, def: 0.04,
              desc: "Throw friction — how much an angled hit deflects the struck ball sideways (even without spin)." },
            { id: "alphaB", label: "ALPHA_B", min: 0.0, max: 1.0, step: 0.05,  def: 0.5,
              desc: "Spin throw — how much the striking ball's side-spin drives the throw deflection." }
        ]
    },
    {
        group: "Cue",
        params: [
            { id: "cueScale", label: "CUE_SCALE", min: 1.0, max: 20.0, step: 0.5, def: 5.0,
              desc: "Cue power — sets the absolute speed of the 'Strong' end of the cue slider." }
        ]
    }
];

function buildPhysicsPanel() {
    var panel = document.getElementById("physics-panel");
    PHYSICS_SLIDERS.forEach(function(group) {
        var groupDiv = document.createElement("div");
        groupDiv.className = "phys-group";
        var title = document.createElement("div");
        title.className = "phys-group-title";
        title.textContent = group.group;
        groupDiv.appendChild(title);

        group.params.forEach(function(p) {
            var row = document.createElement("div");
            row.className = "phys-row";

            var header = document.createElement("div");
            header.className = "phys-header";
            var nameSpan = document.createElement("span");
            nameSpan.className = "phys-name";
            nameSpan.textContent = p.label;
            var valSpan = document.createElement("span");
            valSpan.className = "phys-val";
            valSpan.id = "pval-" + p.id;
            valSpan.textContent = p.def;
            header.appendChild(nameSpan);
            header.appendChild(valSpan);

            var slider = document.createElement("input");
            slider.type = "range";
            slider.min = p.min;
            slider.max = p.max;
            slider.step = p.step;
            slider.value = p.def;
            slider.id = "pcfg-" + p.id;
            slider.addEventListener("input", function() {
                var v = parseFloat(this.value);
                document.getElementById("pval-" + p.id).textContent = v;
                sendPhysicsParam(p.id, v);
            });

            var desc = document.createElement("div");
            desc.className = "phys-desc";
            desc.textContent = p.desc;

            row.appendChild(header);
            row.appendChild(slider);
            row.appendChild(desc);
            groupDiv.appendChild(row);
        });

        panel.appendChild(groupDiv);
    });
}

function sendPhysicsParam(paramId, value) {
    $.post(SERVER_URL + "/config", paramId + "=" + value)
        .fail(function() { console.warn("config update failed for " + paramId); });
}

window.onload = function() {
    $.ajaxSetup({ cache: false });
    app = createApp(document.getElementById("main-canvas"));
    canvasDims();
    fitCanvas();
    window.addEventListener("resize", fitCanvas);
    intervalID = setInterval(updateBallWorld, 20);

    buildPhysicsPanel();
    initCueDial();
    initCueOverlay();

    $("#btn-load-norm").click(function () {
        loadBall();
    });
    $("#btn-clear-balls").click(function () {
        resetBallWorld();
    });
    $("#btn-clear-pockets").click(function () {
        clearPockets();
    });

    $("#btn-pick-up-cue").click(function () {
        pocketMode = false;
        activePocketRadius = 0;
        $(".pocket-btn").removeClass("active");
        $(this).addClass("active");
    });

    $(".pocket-btn").click(function () {
        var r = parseInt($(this).data("radius"));
        if (pocketMode && activePocketRadius === r) {
            pocketMode = false;
            activePocketRadius = 0;
            $(".pocket-btn").removeClass("active");
            $("#btn-pick-up-cue").addClass("active");
        } else {
            pocketMode = true;
            activePocketRadius = r;
            $(".pocket-btn").removeClass("active");
            $(this).addClass("active");
            $("#btn-pick-up-cue").removeClass("active");
        }
    });
}

function loadBall() {
    setUpValues();
    var colorVal = document.getElementById("slt-color").value;
    $.post(SERVER_URL + "/load?sid=" + SESSION_ID, {switcher: false, updatestrategies: update_values, interactstrategies:
        interact_values, color: colorVal}, function (data, status) {
        app.drawBall(data.loc.x, data.loc.y, data.radius, data.color);
    }, "json").fail(showConnectionError);
}

function setUpValues() {
    update_values = "";
    interact_values = "";

    var slts = ["slt-updatestrategy", "slt-interactstrategy"];
    var my_choices;

    for (var i = 0; i < 2; i++) {
        my_choices = document.getElementById(slts[i]);
        for (var j = 0; j < my_choices.length; j++) {
            if (my_choices[j].selected === true) {
                if (i === 0) update_values += my_choices[j].value + " ";
                else interact_values += my_choices[j].value + " ";
            }
        }
    }
}

function updateBallWorld() {
    $.get(SERVER_URL + "/update?sid=" + SESSION_ID, function(data, status) {
        consecutiveErrors = 0;
        clear();
        knownPockets = data.pockets || [];
        knownPockets.forEach(function(p) {
            app.drawPocket(p.x, p.y, p.radius, p.flashColor || null);
        });
        data.obs.forEach(function(element) {
            app.drawBall(element.loc.x, element.loc.y, element.radius, element.color);
        });
    }, "json").fail(function() {
        if (++consecutiveErrors >= 3) showConnectionError();
    });
}

function canvasDims() {
    var c = document.getElementById("main-canvas");
    $.get(SERVER_URL + "/canvas/" + c.width + "/" + c.height + "?sid=" + SESSION_ID, function(data, status){}, "json");
}

function resetBallWorld() {
    $.get(SERVER_URL + "/clear?sid=" + SESSION_ID, function (data, status) {
        clear();
    }, "json");
}

function clear() {
    app.clear();
}
