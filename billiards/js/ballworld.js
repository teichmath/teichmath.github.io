'use strict'

var SERVER_URL = window.location.hostname === "teichmath.github.io"
    ? "https://web-production-208f4.up.railway.app"
    : "";

var app;
var update_values;
var interact_values;
var intervalID;

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

    return {
        drawBall: drawBall,
        clear: clear
    }
}

function fitCanvas() {
    var canvas = document.getElementById("main-canvas");
    var controls = document.getElementById("controls");
    var title = document.querySelector("h1");
    var availW = window.innerWidth - controls.offsetWidth - 26; // gap + margins
    var availH = window.innerHeight - title.offsetHeight - 16; // body margins
    var size = Math.min(availW, availH, 800);
    if (size > 0) {
        canvas.style.width = size + "px";
        canvas.style.height = size + "px";
        controls.style.height = size + "px";
    }
}

window.onload = function() {
    $.ajaxSetup({ xhrFields: { withCredentials: true } });
    app = createApp(document.getElementById("main-canvas"));
    canvasDims();
    fitCanvas();
    window.addEventListener("resize", fitCanvas);
    intervalID = setInterval(updateBallWorld, 100);

    $("#btn-load-norm").click(function () {
        loadBall();
    });
    $("#btn-clear").click(function () {
        resetBallWorld();
    });
}

function loadBall() {
    setUpValues();
    $.post(SERVER_URL + "/load", {switcher: false, updatestrategies: update_values, interactstrategies:
        interact_values}, function (data, status) {
        app.drawBall(data.loc.x, data.loc.y, data.radius, data.color);
    }, "json");
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
    $.get(SERVER_URL + "/update", function(data, status) {
        clear();
        data.obs.forEach(function(element) {
            app.drawBall(element.loc.x, element.loc.y, element.radius, element.color);
        });
    }, "json");
}

function canvasDims() {
    var c = document.getElementById("main-canvas");
    $.get(SERVER_URL + "/canvas/" + c.width + "/" + c.height, function(data, status){}, "json");
}

function resetBallWorld() {
    $.get(SERVER_URL + "/clear", function (data, status) {
        clear();
    }, "json");
}

function clear() {
    app.clear();
}
