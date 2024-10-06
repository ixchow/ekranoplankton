
import { SHADERS } from './shaders.mjs';
import * as helpers from './gl-helpers.mjs';

const MARGIN = 2.0; //want "SDF-like" behavior within margin of surface, so will expand out bounds of each block by this much

//and functions and what they mean:
// air: 1d, perp grad is flow?
// ground: 0.0 - 0.25 (free),  0.25 - 0.5 (boundary), 0.5-0.75 (solid)
// 

export const MODES = {
	GROUND:0,
	CAVE:1,
	WATER:2,
	WATER_PULSES:3,
};

//these are mirrored from the glsl for CPU-side sampling.

//based on https://iquilezles.org/articles/smin/
function smin( a, b, k ) {
	k *= 1.0/(1.0-Math.sqrt(0.5));
	const h = Math.max( k-Math.abs(a-b), 0.0 )/k;
	const b2 = 13.0/4.0 - 4.0*Math.sqrt(0.5);
	const b3 =  3.0/4.0 - 1.0*Math.sqrt(0.5);
	return Math.min(a,b) - k*h*h*(h*b3*(h-4.0)+b2);
}
//from iq's circular wave noise example: https://www.shadertoy.com/view/tldSRj
function g(/*vec2*/ n ) {
	return {
		x:Math.sin(n.x*n.y*12+1),
		y:Math.sin(n.x*n.y*17+2),
	};
}
function mix(a,b,t) {
	return (b-a)*t+a;
}
function dot(a,b) {
	return a.x * b.x + a.y * b.y;
}
function noise(/*vec2*/ p, ofs) {
	const kF = 2.0;  // make 6 to see worms
	const i = {
		x:Math.floor(p.x),
		y:Math.floor(p.y)
	};
	let f = {
		x:p.x - Math.floor(p.x),
		y:p.y - Math.floor(p.y)
	};
	f.x = f.x*f.x*(3.0-2.0*f.x);
	f.y = f.y*f.y*(3.0-2.0*f.y);


	return mix(mix(Math.sin(ofs+kF*dot(p,g({x:i.x+0,y:i.y+0}))),
	               Math.sin(ofs+kF*dot(p,g({x:i.x+1,y:i.y+0}))),f.x),
	           mix(Math.sin(ofs+kF*dot(p,g({x:i.x+0,y:i.y+1}))),
	               Math.sin(ofs+kF*dot(p,g({x:i.x+1,y:i.y+1}))),f.x),f.y);
}

//from iq's list of 2D SDFs: https://iquilezles.org/articles/distfunctions2d/
//modified for uniform radius
function sdRoundedBox( /*vec2*/ p, /*vec2*/ b, /*float*/ r ) {
	const q = {
		x:Math.abs(p.x)-b.x+r,
		y:Math.abs(p.y)-b.y+r
	};
	return Math.min(Math.max(q.x,q.y),0) + Math.hypot(Math.max(q.x,0), Math.max(q.y,0)) - r;
}


export class Block {
	constructor(mode, at, angle, radii, round, seed = 0.0) {
		this.mode = mode;
		this.at = [at[0], at[1]];
		this.angle = angle;
		this.radii = [radii[0], radii[1]];
		this.round = round;
		this.seed = seed;
		this.updateFrame();
	}

	static load(object) {
		const at = object.at;
		const angle = object.angle;
		const radii = object.radii;
		const round = object.round;
		const seed = object.seed;
		const mode = object.mode;
		return new Block(mode, at, angle, radii, round, seed);
	}
	save() {
		return {
			mode:this.mode,
			at:this.at.slice(),
			angle:this.angle,
			radii:this.radii.slice(),
			round:this.round,
			seed:this.seed,
		};
	}

	updateFrame() {
		this.right = [Math.cos(this.angle),Math.sin(this.angle)];
		this.up = [-this.right[1],this.right[0]];
	}
	
	//for edit mode checks:
	hovered(local) {
		return Math.abs(local[0]) < this.radii[0] && Math.abs(local[1]) < this.radii[1];
	}

	//negative: inside, positive: outside
	sample(at, time) {
		const local = {
			x:(at[0]-this.at[0])*this.right[0] + (at[1]-this.at[1])*this.right[1],
			y:(at[0]-this.at[0])*-this.right[1] + (at[1]-this.at[1])*this.right[0]
		};
		const seed = this.seed * 16;

		let dis = sdRoundedBox( local, {x:this.radii[0], y:this.radii[1]}, this.round );

		if (this.mode === MODES.WATER_PULSES) {
			const spacing = 2 * this.radii[1];
			const rad = this.radii[1];
			function fract(x) { return x - Math.floor(x); }
			const wrap = (fract(local.x / spacing + fract(time / 10.0)) - 0.5 ) * spacing;
			dis = Math.max(dis, sdRoundedBox( {x:wrap, y:local.y}, {x:rad, y:this.radii[1]}, this.round ) );
		}

		dis += 0.2 * (noise({x:local.x / 1.5 + seed, y:local.y / 1.5 + seed}, 0.0) + 1.0);
		dis += 0.1 * (noise({x:local.x / 0.7 - 5.0 + seed, y:local.y / 0.7 - 5.0 + seed}, 0.0) + 1.0);

		if (this.mode === MODES.WATER || this.mode == MODES.WATER_PULSES) {
			const t = time * (300.0 * 2.0 * 3.1415926 / 300.0) + seed;
			dis += 0.05 * noise({x:local.x / 0.3, y:local.y / 0.3}, t);
		}

		return dis;
	}
}

//layers:
// - air?
// - water (displaced by (ground - cave) )
// - ground (displaced by cave)
// - cave

//computed:
// light?
// breeze?

class World {
	constructor() {
		this.blocks = [
			new Block(MODES.GROUND, [0,0], 0.0, [6,1.5], 1.5),
			new Block(MODES.GROUND, [5,-2],-0.3, [2,1], 1),
			new Block(MODES.CAVE, [3,-1],Math.PI * 0.5, [4,1.5], 2),
			new Block(MODES.WATER, [-3,-3],0.0, [2,2], 2),
		];

		this.pending = 1;
		this.time = 0.0; //300-second loop

		let do_load = async () => {
			const response = await fetch('/world.json');
			const data = await response.json();
			this.blocks = [];

			for (const block of data.blocks) {
				this.blocks.push(Block.load(block));
			}

			this.pending = 0;
		};

		do_load();
	}

	requestSave() {
		if (this.savePending) {
			this.saveRequested = true;
			return;
		}

		this.savePending = true;
		this.saveRequested = false;

		let do_save = async (data) => {
			const response = await fetch('/world.json', {
				method:"PUT",
				body:data
			});
			console.log(response.status);
			this.savePending = false;
			if (this.saveRequested) {
				this.requestSave(); //will actually run another save
			}
		};

		const saved = {
			blocks:[],
		};

		for (const block of this.blocks) {
			saved.blocks.push(block.save());
		}

		do_save(JSON.stringify(saved));
	}

	sample(at) {
		//TODO: acceleration structure
		let ground = 10.0;
		let cave = 10.0;
		let water = 10.0;
		for (const block of this.blocks) {
			const dis = block.sample(at,this.time);
			if (block.mode == MODES.GROUND) {
				ground = smin(ground, dis, 0.2);
			} else if (block.mode == MODES.CAVE) {
				cave = smin(cave, dis, 0.2);
			} else if (block.mode == MODES.WATER || block.mode == MODES.WATER_PULSES) {
				water = smin(water, dis, 0.2);
			}
		}
		if (ground < 0.0) {
			if (cave < 0.0) {
				if (water < 0.0) {
					//cave water
					return {water:-water, cave:true, dis:water};
				} else {
					//cave air
					return {air:-cave, cave:true, dis:cave};
				}
			} else {
				//ground
				return {ground:-ground, dis:ground};
			}
		} else {
			if (water < 0.0) {
				//water
				return {water:-water, dis:water};
			} else {
				//air
				return {air:ground, dis:-ground};
			}
		}
	}

	underMouse(MOUSE) {
		const list = [];
		for (const block of this.blocks) {
			const local = [
				(MOUSE.worldX - block.at[0]) * block.right[0] + (MOUSE.worldY - block.at[1]) * block.right[1],
				(MOUSE.worldX - block.at[0]) * block.up[0] + (MOUSE.worldY - block.at[1]) * block.up[1]
			];
			if (block.hovered(local)) {
				list.push(block);
			}
		}
		return list;
	}

	drawBackground(gl, CAMERA) {
		//mat3's contain block position + params (last row)
		const BLOCKS = [];

		for (const block of this.blocks) {
			BLOCKS.push(
				block.at[0], block.at[1], block.seed,
				block.right[0], block.right[1], block.mode,
				block.radii[0], block.radii[1], block.round,
			);
		}

		const u = {
			WORLD_FROM_CLIP:new Float32Array([
				0.5 * (CAMERA.maxX - CAMERA.minX), 0,
				0, 0.5 * (CAMERA.maxY - CAMERA.minY),
				0.5 * (CAMERA.maxX + CAMERA.minX), 0.5 * (CAMERA.maxY + CAMERA.minY),
			]),
			BLOCKS_COUNT:new Uint32Array([this.blocks.length]),
			"BLOCKS[0]":new Float32Array(BLOCKS),
			TIME:[this.time],
		};
		const prog = SHADERS.world;
		gl.useProgram(prog);

		helpers.setUniforms(gl, prog, u);

		//no arrays actually needed:
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	draw(gl, {CAMERA, CLIP_FROM_WORLD, EDIT_MODE, hovered, SELECTION} ) {
		this.drawBackground(gl, CAMERA);

		if (!('LINES_BUFFER' in this)) this.LINES_BUFFER = gl.createBuffer();
		const LINES_BUFFER = this.LINES_BUFFER;

		//TODO: acceleration structure?
	
		const attribs = [];

		if (EDIT_MODE) {
			for (const block of this.blocks) {
				let col;
				if (SELECTION.indexOf(block) !== -1) {
					col = [0.9, 0.9,0];
				} else {
					col = [0.5, 0.5, 0.2];
				}
				if (block === hovered) {
					col[0] += 0.1;
					col[1] += 0.1;
					col[2] += 0.1;
				}
				attribs.push(
					block.at[0] - block.radii[0] * block.right[0] - block.radii[1] * block.up[0],
					block.at[1] - block.radii[0] * block.right[1] - block.radii[1] * block.up[1],
					...col
				);
				attribs.push(
					block.at[0] + block.radii[0] * block.right[0] - block.radii[1] * block.up[0],
					block.at[1] + block.radii[0] * block.right[1] - block.radii[1] * block.up[1],
					...col
				);
				attribs.push(
					block.at[0] + block.radii[0] * block.right[0] - block.radii[1] * block.up[0],
					block.at[1] + block.radii[0] * block.right[1] - block.radii[1] * block.up[1],
					...col
				);
				attribs.push(
					block.at[0] + block.radii[0] * block.right[0] + block.radii[1] * block.up[0],
					block.at[1] + block.radii[0] * block.right[1] + block.radii[1] * block.up[1],
					...col
				);
				attribs.push(
					block.at[0] + block.radii[0] * block.right[0] + block.radii[1] * block.up[0],
					block.at[1] + block.radii[0] * block.right[1] + block.radii[1] * block.up[1],
					...col
				);
				attribs.push(
					block.at[0] - block.radii[0] * block.right[0] + block.radii[1] * block.up[0],
					block.at[1] - block.radii[0] * block.right[1] + block.radii[1] * block.up[1],
					...col
				);
				attribs.push(
					block.at[0] - block.radii[0] * block.right[0] + block.radii[1] * block.up[0],
					block.at[1] - block.radii[0] * block.right[1] + block.radii[1] * block.up[1],
					...col
				);
				attribs.push(
					block.at[0] - block.radii[0] * block.right[0] - block.radii[1] * block.up[0],
					block.at[1] - block.radii[0] * block.right[1] - block.radii[1] * block.up[1],
					...col
				);
	
			}
		}

		const u = {
			CLIP_FROM_LOCAL:CLIP_FROM_WORLD,
		};
		const prog = SHADERS.color;
		gl.useProgram(prog);

		helpers.setUniforms(gl, prog, u);

		//upload and draw attribs:
		gl.bindBuffer(gl.ARRAY_BUFFER, LINES_BUFFER);
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

export const WORLD = new World();
window.WORLD = WORLD;
