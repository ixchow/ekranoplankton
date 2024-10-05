
//most of the framework based on sturmun's game.js ;
//adapted to s72-viewer's gl-helpers.mjs and webgl2 .

import { SHADERS } from './shaders.mjs';

import { WORLD, Block } from './terrain.mjs';

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

const PLAY_RADIUS = 10.0;

class Camera {
	constructor() {
		this.at = [0,2.5];
		this.radius = PLAY_RADIUS; //square radius
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
	setMouseWorld(MOUSE) {
		MOUSE.worldX = MOUSE.x * (this.maxX - this.minX) + this.minX;
		MOUSE.worldY = MOUSE.y * (this.maxY - this.minY) + this.minY;
	}
};

const CAMERA = new Camera();
window.CAMERA = CAMERA;

let EDIT_MODE = true;

let SELECTION = [];

let ACTION = null;

class ActionGrab {
	constructor(selection) {
		this.targets = selection.slice();
		this.before = [];
		this.base = [MOUSE.worldX, MOUSE.worldY];
		for (const target of this.targets) {
			this.before.push(target.at.slice());
		}
	}
	update() {
		const offset = [
			MOUSE.worldX - this.base[0],
			MOUSE.worldY - this.base[1],
		];
		for (let i = 0; i < this.targets.length; ++i) {
			this.targets[i].at[0] = this.before[i][0] + offset[0];
			this.targets[i].at[1] = this.before[i][1] + offset[1];
			this.targets[i].updateFrame();
		}
	}
	commit() {
		update();
	}
	cancel() {
		for (let i = 0; i < this.targets.length; ++i) {
			this.targets[i].at[0] = this.before[i][0];
			this.targets[i].at[1] = this.before[i][1];
			this.targets[i].updateFrame();
		}
	}
};

class ActionRotate {
	constructor(selection) {
		this.targets = selection.slice();
		this.beforeAt = [];
		this.beforeAngle = [];
		this.center = [0,0];
		for (const target of this.targets) {
			this.center[0] += target.at[0];
			this.center[1] += target.at[1];
			this.beforeAt.push(target.at.slice());
			this.beforeAngle.push(target.angle);
		}
		this.center[0] /= this.targets.length;
		this.center[1] /= this.targets.length;
		this.baseAngle = Math.atan2(
			MOUSE.worldY - this.center[1],
			MOUSE.worldX - this.center[0]
		);
	}
	update() {
		const delta = Math.atan2(
			MOUSE.worldY - this.center[1],
			MOUSE.worldX - this.center[0]
		) - this.baseAngle;

		const right = [
			Math.cos(delta),
			Math.sin(delta)
		];
		const up = [
			-right[1],
			right[0]
		];

		for (let i = 0; i < this.targets.length; ++i) {
			let x = this.beforeAt[i][0] - this.center[0];
			let y = this.beforeAt[i][1] - this.center[1];

			this.targets[i].at[0] = x * right[0] + y * up[0] + this.center[0];
			this.targets[i].at[1] = x * right[1] + y * up[1] + this.center[1];

			this.targets[i].angle = this.beforeAngle[i] + delta;

			this.targets[i].updateFrame();
		}
	}
	commit() {
		update();
	}
	cancel() {
		for (let i = 0; i < this.targets.length; ++i) {
			this.targets[i].at[0] = this.beforeAt[i][0];
			this.targets[i].at[1] = this.beforeAt[i][1];
			this.targets[i].angle = this.beforeAngle[i];

			this.targets[i].updateFrame();
		}
	}
};

class ActionResize {
	constructor(selection, roundMode) {
		this.roundMode = roundMode;
		this.targets = selection.slice();
		this.base = [MOUSE.worldX, MOUSE.worldY];
		this.beforeRadii = [];
		this.beforeRound = [];
		for (const target of this.targets) {
			this.beforeRadii.push(target.radii.slice());
			this.beforeRound.push(target.round);
		}
	}
	update() {
		const delta = [
			MOUSE.worldX - this.base[0],
			MOUSE.worldY - this.base[1]
		];

		if (this.roundMode) {
			for (let i = 0; i < this.targets.length; ++i) {
				let r = Math.max(0.0, this.beforeRound[i] + delta[0]);
				console.log(r);
				this.targets[i].round = r;
				this.targets[i].updateFrame();
			}
		} else {
			for (let i = 0; i < this.targets.length; ++i) {
				let rx = Math.max(0.5, this.beforeRadii[i][0] + delta[0]);
				let ry = Math.max(0.5, this.beforeRadii[i][1] + delta[1]);

				this.targets[i].radii[0] = rx;
				this.targets[i].radii[1] = ry;

				this.targets[i].updateFrame();
			}
		}
	}
	commit() {
		update();
	}
	cancel() {
		for (let i = 0; i < this.targets.length; ++i) {
			this.targets[i].radii[0] = this.beforeRadii[i][0];
			this.targets[i].radii[1] = this.beforeRadii[i][1];
			this.targets[i].round = this.beforeRound[i];

			this.targets[i].updateFrame();
		}
	}
};




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
			this.pos[0] = 0.0;
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

	CAMERA.setMouseWorld(MOUSE);

	MOUSE.hovered = null;

	if (!EDIT_MODE) {

		PLANKTON.update(elapsed, MOUSE);

		MOUSE.downs = 0;

		{
			let to = [
				PLANKTON.pos[0] - CAMERA.at[0],
				PLANKTON.pos[1] - CAMERA.at[1]
			];
			let len = Math.hypot(to[0], to[1]);
			let keep = 0.5 ** (elapsed / 1.0);
			keep = Math.max(keep - elapsed / 2.0, 0.0);
	
			CAMERA.at[0] += to[0] * (1.0 - keep);
			CAMERA.at[1] += to[1] * (1.0 - keep);
		}
	} else {

		if (ACTION) {
			ACTION.update();
		}



		let under = WORLD.underMouse(MOUSE);

		if (under.length) {
			MOUSE.hovered = under[MOUSE.selectOffset % under.length];
		}

		MOUSE.downs = 0;
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

	WORLD.draw(gl, {CAMERA, CLIP_FROM_WORLD, EDIT_MODE, hovered:MOUSE.hovered, SELECTION} );

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
	else if (evt.code === 'Enter') {
		EDIT_MODE = !EDIT_MODE;
		if (!EDIT_MODE) {
			CAMERA.radius = PLAY_RADIUS;
		}
	}
	if (EDIT_MODE) {
		if (ACTION) {
			if (evt.code === 'Escape') {
				ACTION.cancel();
				ACTION = null;
			}
		} else {
			if (evt.code === 'Equal') {
				MOUSE.selectOffset += 1;
			} else if (evt.code === 'Space') {
				for (const block of SELECTION) {
					block.seed = Math.random();
				}
			} else if (evt.code === 'KeyA') {
				if (SELECTION.length) {
					SELECTION = [];
				} else {
					SELECTION = WORLD.blocks.slice();
				}
			} else if (evt.code === 'KeyG') {
				if (SELECTION.length) {
					ACTION = new ActionGrab(SELECTION);
				}
			} else if (evt.code === 'KeyR') {
				if (SELECTION.length) {
					ACTION = new ActionRotate(SELECTION);
				}
			} else if (evt.code === 'KeyS') {
				if (SELECTION.length) {
					ACTION = new ActionResize(SELECTION, evt.shiftKey);
				}
			} else if (evt.code === 'KeyD' && evt.shiftKey) {
				if (SELECTION.length) {
					for (let i = 0; i < SELECTION.length; ++i) {
						SELECTION[i] = Block.load(SELECTION[i].save());
					}
					WORLD.blocks.push(...SELECTION);
					ACTION = new ActionGrab(SELECTION);
				}
			} else if (evt.code === 'KeyX') {
				for (const block of SELECTION) {
					const idx = WORLD.blocks.indexOf(block);
					if (idx !== -1) {
						WORLD.blocks.splice(idx,1);
					}
				}
				SELECTION = [];
			}
		}
	}

	console.log(evt.code);
}

function keyup(evt) {
	//nothing ATM
}

window.addEventListener('keydown', keydown);
window.addEventListener('keyup', keyup);

const MOUSE = {x:NaN, y:NaN, down:false, downs:0, hovered:null, selectOffset:0};

//based (loosely) on amoeba-escape's mouse handling:
function setMouse(evt) {

	const old = [MOUSE.worldX, MOUSE.worldY];

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

	//middle-mouse to pan:
	if (EDIT_MODE && (evt.buttons & 4)) {
		CAMERA.setMouseWorld(MOUSE);
		CAMERA.at[0] += old[0] - MOUSE.worldX;
		CAMERA.at[1] += old[1] - MOUSE.worldY;
		CAMERA.updateBounds();
		CAMERA.setMouseWorld(MOUSE);
	}
}

function handleDown(evt) {
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
	if (EDIT_MODE) {
		if (ACTION) {
			ACTION.commit();
			ACTION = null;
		} else {
			if (!evt.shiftKey) {
				SELECTION = [];
			}
			if (MOUSE.hovered) {
				const idx = SELECTION.indexOf(MOUSE.hovered);
				if (idx === -1) {
					SELECTION.push(MOUSE.hovered);
				} else {
					SELECTION.splice(idx,1);
				}
			}
		}
	}

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

window.addEventListener('wheel', function(evt){
	evt.preventDefault();

	let zoom = 2.0 ** (evt.deltaY / 138.0 * 0.1);


	CAMERA.setMouseWorld(MOUSE);
	let old = [MOUSE.worldX, MOUSE.worldY];

	CAMERA.radius *= zoom;

	CAMERA.updateBounds();
	CAMERA.setMouseWorld(MOUSE);
	CAMERA.at[0] += old[0] - MOUSE.worldX;
	CAMERA.at[1] += old[1] - MOUSE.worldY;
	CAMERA.updateBounds();
	CAMERA.setMouseWorld(MOUSE);

	return false;
});

