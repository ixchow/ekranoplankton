
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

const MISC_BUFFER = gl.createBuffer(); //used for a bunch of debug drawing stuff

const TICK = 1.0 / 60.0;

class Camera {
	constructor() {
		this.at = [0,2.5];
		this.radius = 10; //square radius
		this.aspect = 1;
		this.updateBounds();
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
	updateBounds() {
		this.minX = -this.radius * Math.max(1, this.aspect) + this.at[0];
		this.minY = -this.radius * Math.max(1, 1 / this.aspect) + this.at[1];
		this.maxX =  this.radius * Math.max(1, this.aspect) + this.at[0];
		this.maxY =  this.radius * Math.max(1, 1 / this.aspect) + this.at[1];
	}
};

const CAMERA = new Camera();


/* something like this for checkpoints later:
if (document.location.search.match(/^\?\d+/)) {
	setLevel(parseInt(document.location.search.substr(1)));
} else {
	setLevel(0);
}
*/

const TURN_HALF_LIFE = 0.5;
const TURN_RATE = 2.0 * Math.PI / 0.5;

const HALF_LIFE_PERP_WING = 0.04;
const HALF_LIFE_PERP_WING_STALL = 0.2;
const HALF_LIFE_ALONG_FORWARD_WING = 10.0;
const HALF_LIFE_ALONG_BACKWARD_WING = 0.5;
const HALF_LIFE_BLOB = 0.2;


//in stall, perp behaves like blob and redirect doesn't work:
const MIN_STALL_AIRSPEED = 3.0;
const MAX_STALL_AIRSPEED = 4.0;

const GROUND_EFFECT_REDIRECT = 0.4;
const FREE_AIR_REDIREFCT = 0.1;


class Plankton {
	constructor(gl) {
		this.pos = [0,0];
		this.angle = 0;
		this.vel = [0,0];
		this.acc = 0;

		this.wing = 0;
		this.foil = 0;
	}

	tick(mouse, isAir) {
		this.prevPos = this.pos.slice();
		this.prevAngle = this.angle;
		this.prevWing = this.wing;

		let DIR = [
			mouse.worldX - this.pos[0],
			mouse.worldY - this.pos[1],
		];
		if (isNaN(DIR[0])) {
			DIR[0] = 0;
			DIR[1] = 1;
		}
		let ANG = Math.atan2(DIR[1], DIR[0]);

		//wing morph:
		if (mouse.down) {
			this.wing = Math.min(1, this.wing + TICK / 0.1);
		} else {
			this.wing = Math.max(0, this.wing - TICK / 0.05);
		}

		let dirBefore = [
			Math.cos(this.angle),
			Math.sin(this.angle)
		];

		{ //steering:
			let turn = (ANG - this.angle) % (2.0 * Math.PI);
			if (turn <-Math.PI) turn += 2.0 * Math.PI;
			if (turn > Math.PI) turn -= 2.0 * Math.PI;

			{ //exponential:
				const amt = (1.0 - (0.5 ** (TICK / TURN_HALF_LIFE))) * turn;
				turn -= amt;
				this.angle += amt;
			}

			if (turn < 0.0) {
				this.angle += Math.max(-TURN_RATE * TICK,turn);
			} else {
				this.angle += Math.min(TURN_RATE * TICK,turn);
			}

			this.angle = this.angle % (2.0 * Math.PI);
		}

		{ //foil morph:
			//TBD
		}

		let dir = [
			Math.cos(this.angle),
			Math.sin(this.angle)
		];

		//gravity:
		this.vel[0] += 0.0 * TICK;
		this.vel[1] += -10.0 * TICK;

		{ //wing dynamics stuff:
			//(also carry velocity!)
			let along = this.vel[0] * dir[0] + this.vel[1] * dir[1];
			let perp = this.vel[0] * -dir[1] + this.vel[1] * dir[0];

			let alongWing = along;
			let perpWing = perp;

			{ //wing stuff:

				let stall;
				if (along < MIN_STALL_AIRSPEED) stall = 1.0;
				else if (along > MAX_STALL_AIRSPEED) stall = 0.0;
				else stall = (along - MAX_STALL_AIRSPEED) / (MIN_STALL_AIRSPEED - MAX_STALL_AIRSPEED);

				if (alongWing > 0.0) {
					alongWing *= 0.5 ** (TICK / HALF_LIFE_ALONG_FORWARD_WING);
				} else {
					alongWing *= 0.5 ** (TICK / HALF_LIFE_ALONG_BACKWARD_WING);
				}

				let half_life_perp = stall * (HALF_LIFE_PERP_WING_STALL - HALF_LIFE_PERP_WING) + HALF_LIFE_PERP_WING;

				// a bold departure from physical theory:
				let removed = perpWing * (1.0 - 0.5 ** (TICK / half_life_perp));
				//alongWing += 0.1 * Math.abs(removed);
				perpWing -= removed;

			}

			let alongBlob = along;
			let perpBlob = perp;
			
			{
				alongBlob *= 0.5 ** (TICK / HALF_LIFE_BLOB);
				perpBlob *= 0.5 ** (TICK / HALF_LIFE_BLOB);
			}

			along = (alongWing - alongBlob) * this.wing + alongBlob;
			perp = (perpWing - perpBlob) * this.wing + perpBlob;

			this.vel = [
				along * dir[0] + perp * -dir[1],
				along * dir[1] + perp *  dir[0]
			];
		}

		this.pos[0] += this.vel[0] * TICK;
		this.pos[1] += this.vel[1] * TICK;

		//don't fall forever:
		if (this.pos[1] < 0.0) {
			this.pos[0] = 10.0;
			this.pos[1] = 10.0;
			this.vel[0] = 0.0;
			this.vel[1] = 0.0;
		}
	}

	update(elapsed, mouse) {
		this.acc += elapsed;
		while (this.acc > 0) {
			this.tick(mouse, true);
			this.acc -= TICK;
		}
	}

	draw(gl, CLIP_FROM_WORLD) {
		const attribs = [];

		//TODO: backstepping
		const pos = this.pos.slice();
		const angle = this.angle;
		const wing = this.wing;

		const dir = [
			Math.cos(angle),
			Math.sin(angle)
		];

		for (let i = 0; i <= 32; i += 1) {
			const d = [
				Math.cos(i / 32 * Math.PI * 2.0),
				Math.sin(i / 32 * Math.PI * 2.0),
			];
			const r = 1.0;
			d[1] *= wing * (0.2 - 1.0) + 1.0;
			attribs.push(
				r * (dir[0] * d[0] + -dir[1] * d[1]) + pos[0],
				r * (dir[1] * d[0] +  dir[0] * d[1]) + pos[1],

				1,1,1
			);
		}

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


const PLANKTON = new Plankton(gl);
window.PLANKTON = PLANKTON;


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

	MOUSE.worldX = MOUSE.x * (CAMERA.maxX - CAMERA.minX) + CAMERA.minX;
	MOUSE.worldY = MOUSE.y * (CAMERA.maxY - CAMERA.minY) + CAMERA.minY;

	PLANKTON.update(elapsed, MOUSE);

	MOUSE.downs = 0;

	CAMERA.at[0] += (PLANKTON.pos[0] - CAMERA.at[0]) * (1.0 - 0.5 ** (elapsed / 1.0));
	CAMERA.at[1] += (PLANKTON.pos[1] - CAMERA.at[1]) * (1.0 - 0.5 ** (elapsed / 1.0));

	{
		let to = [
			PLANKTON.pos[0] - CAMERA.at[0],
			PLANKTON.pos[1] - CAMERA.at[1]
		];
		let len = Math.hypot(to[0], to[1]);
		let keep = 0.5 ** (elapsed / 1.0);
		keep = Math.max(keep - elapsed / 5.0, 0.0);

		CAMERA.at[0] += to[0] * (1.0 - keep);
		CAMERA.at[1] += to[1] * (1.0 - keep);
	}

	CAMERA.aspect = CANVAS.clientWidth / CANVAS.clientHeight;
	CAMERA.updateBounds();

	draw();
	queueUpdate();
}


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

		{
			const GRID_STEP = 0.75;
			const minXi = Math.floor(CAMERA.minX / GRID_STEP);
			const maxXi = Math.ceil(CAMERA.maxX / GRID_STEP);
			const minYi = Math.floor(CAMERA.minY / GRID_STEP);
			const maxYi = Math.ceil(CAMERA.maxY / GRID_STEP);
			for (let xi = minXi; xi <= maxXi; xi += 1) {
				attribs.push( GRID_STEP * xi,CAMERA.minY, 0.5,0.5,0.5 );
				attribs.push( GRID_STEP * xi,CAMERA.maxY, 0.5,0.5,0.5 );
			}
			for (let yi = minYi; yi <= maxYi; yi += 1) {
				if (yi == 0) {
					attribs.push( CAMERA.minX,GRID_STEP * yi, 1,1,1 );
					attribs.push( CAMERA.maxX,GRID_STEP * yi, 1,1,1 );
				} else {
					attribs.push( CAMERA.minX,GRID_STEP * yi, 0.5,0.5,0.5 );
					attribs.push( CAMERA.maxX,GRID_STEP * yi, 0.5,0.5,0.5 );
				}
			}
		}


		attribs.push( 0,0, 1,0,0 );
		attribs.push( 1,0, 1,0,0 );
		attribs.push( 0,0, 0,1,0 );
		attribs.push( 0,1, 0,1,0 );

		attribs.push( MOUSE.worldX-0.5,MOUSE.worldY-0.5, 1,1,0 );
		attribs.push( MOUSE.worldX+0.5,MOUSE.worldY+0.5, 1,1,0 );
		attribs.push( MOUSE.worldX-0.5,MOUSE.worldY+0.5, 1,1,0 );
		attribs.push( MOUSE.worldX+0.5,MOUSE.worldY-0.5, 1,1,0 );

		if (MOUSE.down) {
			attribs.push( MOUSE.worldX-0.25,MOUSE.worldY-0.25, 1,1,0 );
			attribs.push( MOUSE.worldX+0.25,MOUSE.worldY-0.25, 1,1,0 );
			attribs.push( MOUSE.worldX+0.25,MOUSE.worldY-0.25, 1,1,0 );
			attribs.push( MOUSE.worldX+0.25,MOUSE.worldY+0.25, 1,1,0 );
			attribs.push( MOUSE.worldX+0.25,MOUSE.worldY+0.25, 1,1,0 );
			attribs.push( MOUSE.worldX-0.25,MOUSE.worldY+0.25, 1,1,0 );
			attribs.push( MOUSE.worldX-0.25,MOUSE.worldY+0.25, 1,1,0 );
			attribs.push( MOUSE.worldX-0.25,MOUSE.worldY-0.25, 1,1,0 );
		}


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

	PLANKTON.draw(gl, CLIP_FROM_WORLD);

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

const MOUSE = {x:NaN, y:NaN, down:false, downs:0};

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
		//AUDIO.mute();
	}
	MOUSE.down = true;
	MOUSE.downs += 1;
}

function handleUp() {
	MOUSE.down = false;
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


