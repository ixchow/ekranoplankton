
//most of the framework based on sturmun's game.js ;
//adapted to s72-viewer's gl-helpers.mjs and webgl2 .

import { SHADERS } from './shaders.mjs';

import * as helpers from './gl-helpers.mjs';

const CANVAS = document.getElementsByTagName("canvas")[0];
const gl = CANVAS.getContext("webgl2", {
	colorSpace:"srgb",
	alpha:false,
	depth:false,
	stencil:false,
	preserveDrawingBuffer:false,
	antialias:false,
} );
if (gl === null) {
	alert("Unable to init webgl");
	throw new Error("Init failed.");
}

SHADERS.load(gl);
//TEXTURES.load();
//AUDIO.load();

const TICK = 1.0 / 60.0;

class Camera {
	constructor() {
		this.at = [0,2.5];
		this.radius = 10; //square radius
		this.aspect = 1;
	}
	makeClipFromWorld() {
		const sx = 2.0 / (2.0 * this.radius * Math.max(1, this.aspect) );
		const sy = 2.0 / (2.0 * this.radius * Math.max(1, 1 / this.aspect) );
		return new Float32Array([
			sx, 0.0, 0.0, 0.0,
			0.0, sy, 0.0, 0.0,
			0.0, 0.0, 1.0, 0.0,
			sx * -this.at[0], sy * -this.at[1], 0.0, 1.0
		]);
	}
};

let CAMERA = new Camera();


/* something like this for checkpoints later:
if (document.location.search.match(/^\?\d+/)) {
	setLevel(parseInt(document.location.search.substr(1)));
} else {
	setLevel(0);
}
*/


update.maxPending = 0;

function update(elapsed) {
	elapsed = Math.min(elapsed, 0.1);

	/*
	const pending = TEXTURES.pending + AUDIO.pending;
	update.maxPending = Math.max(update.maxPending, pending);
	if (pending > 0) {
		loadDraw(1.0 - (pending / update.maxPending));
		queueUpdate();
		return;
	}
	*/

	CAMERA.aspect = CANVAS.clientWidth / CANVAS.clientHeight;

	MOUSE.worldX = (MOUSE.x * 2 - 1) * Math.max(1, CAMERA.aspect) * CAMERA.radius + CAMERA.at[0];
	MOUSE.worldY = (MOUSE.y * 2 - 1) * Math.max(1, 1 / CAMERA.aspect) * CAMERA.radius + CAMERA.at[1];

	draw();

	queueUpdate();
}

const MISC_BUFFER = gl.createBuffer();

function loadDraw(amount) {
	const C = (0.25 - 0.0) * amount + 1.0;
	gl.clearColor(C,C,C,1);
	gl.clear(gl.COLOR_BUFFER_BIT);
}

function draw() {
	const size = {
		x:parseInt(CANVAS.width),
		y:parseInt(CANVAS.height)
	};
	gl.viewport(0,0,size.x,size.y);

	gl.clearColor(0.25,0.25,0.25,1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.enable(gl.BLEND);
	gl.blendEquation(gl.FUNC_ADD);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);


	const CLIP_FROM_WORLD = CAMERA.makeClipFromWorld();

	{ //some sort of grid:
		const attribs = [];
		attribs.push( 0,0, 1,0,0 );
		attribs.push( 1,0, 1,0,0 );
		attribs.push( 0,0, 0,1,0 );
		attribs.push( 0,1, 0,1,0 );

		attribs.push( MOUSE.worldX-0.5,MOUSE.worldY-0.5, 1,1,0 );
		attribs.push( MOUSE.worldX+0.5,MOUSE.worldY+0.5, 1,1,0 );
		attribs.push( MOUSE.worldX-0.5,MOUSE.worldY+0.5, 1,1,0 );
		attribs.push( MOUSE.worldX+0.5,MOUSE.worldY-0.5, 1,1,0 );

		const u = {
			CLIP_FROM_LOCAL:CLIP_FROM_WORLD,
		};
		const prog = SHADERS.color;
		gl.useProgram(prog);

		helpers.setUniforms(gl, prog, u);

		//upload and draw attribs:
		gl.bindBuffer(gl.ARRAY_BUFFER, MISC_BUFFER);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(attribs), gl.STREAM_DRAW);

		const stride = 2*4+3*4;
		//0 => Position
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
		//1 => Color
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 2*4);

		gl.drawArrays(gl.LINES, 0, attribs.length/(stride/4));

		gl.disableVertexAttribArray(1);
		gl.disableVertexAttribArray(0);
	}

}


function resized() {
	const size = {x:CANVAS.clientWidth, y:CANVAS.clientHeight};
	CANVAS.width = Math.round(size.x * window.devicePixelRatio);
	CANVAS.height = Math.round(size.y * window.devicePixelRatio);
	queueUpdate();
}

window.addEventListener('resize', resized);
resized();

function queueUpdate() {
	if (queueUpdate.queued) return;
	queueUpdate.queued = true;
	window.requestAnimationFrame(function(timestamp){
		delete queueUpdate.queued;
		if (!('prevTimestamp' in queueUpdate)) {
			queueUpdate.prevTimestamp = timestamp;
		}
		const delta = (timestamp - queueUpdate.prevTimestamp);
		update(delta / 1000.0);
		queueUpdate.prevTimestamp = timestamp;
	});
}

queueUpdate();

function keydown(evt) {
	//AUDIO.interacted = true;
	if (evt.repeat) /* nothing */;
	else if (evt.code === 'KeyE') WORLD.limbs[0].grow = true;
	else if (evt.code === 'KeyW') WORLD.limbs[1].grow = true;
	else if (evt.code === 'KeyQ') WORLD.limbs[2].grow = true;
	else if (evt.code === 'KeyA') WORLD.limbs[3].grow = true;
	else if (evt.code === 'KeyD') WORLD.limbs[4].grow = true;
	else if (evt.code === 'KeyN') next();
	else if (evt.code === 'KeyP') prev();
	else if (evt.code === 'KeyR') reset();
}

function keyup(evt) {
	if      (evt.code === 'KeyE') WORLD.limbs[0].grow = false;
	else if (evt.code === 'KeyW') WORLD.limbs[1].grow = false;
	else if (evt.code === 'KeyQ') WORLD.limbs[2].grow = false;
	else if (evt.code === 'KeyA') WORLD.limbs[3].grow = false;
	else if (evt.code === 'KeyD') WORLD.limbs[4].grow = false;
}

window.addEventListener('keydown', keydown);
window.addEventListener('keyup', keyup);

const MOUSE = {x:NaN, y:NaN};

//based (loosely) on amoeba-escape's mouse handling:
function setMouse(evt) {
	var rect = CANVAS.getBoundingClientRect();
	MOUSE.x = (evt.clientX - rect.left) / rect.width;
	MOUSE.y = (evt.clientY - rect.bottom) / -rect.height;

	function inRect(name) {
		return name in RECTS && (
			RECTS[name].min[0] <= MOUSE.x && MOUSE.x <= RECTS[name].max[0]
			&& RECTS[name].min[1] <= MOUSE.y && MOUSE.y <= RECTS[name].max[1]
		);
	}
	/*
	MOUSE.overReset = inRect("reset");
	MOUSE.overNext = inRect("next");
	MOUSE.overPrev = inRect("prev");
	MOUSE.overTCHOW = inRect("tchow");
	MOUSE.overMute = inRect("mute");
	*/
}

function handleDown() {
	//AUDIO.interacted = true;
	if (MOUSE.overReset) {
		reset();
	} else if (MOUSE.overUndo) {
		undo();
	} else if (MOUSE.overNext) {
		next();
	} else if (MOUSE.overPrev) {
		prev();
	} else if (MOUSE.overTCHOW) {
		window.open('http://tchow.com', '_blank').focus();
	} else if (MOUSE.overMute) {
		AUDIO.mute();
	}
}

function handleUp() {
}

CANVAS.addEventListener('touchstart', function(evt){
	evt.preventDefault();
	setMouse(evt.touches[0]);
	handleDown(evt.touches[0]);
	return false;
});
CANVAS.addEventListener('touchmove', function(evt){
	evt.preventDefault();
	setMouse(evt.touches[0]);
	return false;
});
CANVAS.addEventListener('touchend', function(evt){
	handleUp();
	mouse.x = NaN;
	mouse.y = NaN;
	return false;
});

window.addEventListener('mousemove', function(evt){
	evt.preventDefault();
	setMouse(evt);
	return false;
});
window.addEventListener('mousedown', function(evt){
	evt.preventDefault();
	setMouse(evt);
	handleDown(evt);
	return false;
});

window.addEventListener('mouseup', function(evt){
	evt.preventDefault();
	setMouse(evt);
	handleUp();
	return false;
});


