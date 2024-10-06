
//based on shaders.js from sturmun

export const SHADERS = {};

import { makeProgram } from './gl-helpers.mjs';

SHADERS.load = function SHADERS_load(gl) {
	SHADERS.color = makeProgram(gl,`#version 300 es
		layout(location=0) in vec4 Position;
		layout(location=1) in vec4 Color;
		uniform mat4 CLIP_FROM_LOCAL;
		out vec4 color;
		void main() {
			gl_Position = CLIP_FROM_LOCAL * Position;
			color = Color;
		}
	`,`#version 300 es
		in lowp vec4 color;
		layout(location=0) out lowp vec4 fragColor;
		void main() {
			fragColor = color;
		}
	`);

	SHADERS.world = makeProgram(gl,`#version 300 es
		layout(location=0) in vec4 Position;
		uniform mat3x2 WORLD_FROM_CLIP;
		out vec2 position;
		void main() {
			vec2 Position = vec2( 2*(gl_VertexID & 2)-1, 4*(gl_VertexID & 1)-1 );
			gl_Position = vec4(Position, 0.0, 1.0);
			position = WORLD_FROM_CLIP * vec3(Position, 1.0);
		}
	`,`#version 300 es
		in highp vec2 position;
		uniform uint BLOCKS_COUNT;
		uniform highp mat3 BLOCKS[100];
		uniform highp float TIME;
		precision highp float;


		//from iq's circular wave noise example: https://www.shadertoy.com/view/tldSRj

		//"don't use this" says the source text
		vec2 g( vec2 n ) { return sin(n.x*n.y*vec2(12,17)+vec2(1,2)); }
		//vec2 g( vec2 n ) { return sin(n.x*n.y+vec2(0,1.571)); } // if you want the gradients to lay on a circle
		float noise(in highp vec2 p, in highp float ofs) {
			const highp float kF = 2.0;  // make 6 to see worms
			highp vec2 i = floor(p);
			highp vec2 f = fract(p);
			f = f*f*(3.0-2.0*f);
			return mix(mix(sin(ofs+kF*dot(p,g(i+vec2(0,0)))),
			               sin(ofs+kF*dot(p,g(i+vec2(1,0)))),f.x),
			           mix(sin(ofs+kF*dot(p,g(i+vec2(0,1)))),
			               sin(ofs+kF*dot(p,g(i+vec2(1,1)))),f.x),f.y);
		}

		//from iq's list of 2D SDFs: https://iquilezles.org/articles/distfunctions2d/
		//modified for uniform radius
		float sdRoundedBox( in vec2 p, in vec2 b, in float r ) {
			vec2 q = abs(p)-b+r;
			return min(max(q.x,q.y),0.0) + length(max(q,0.0)) - r;
		}

		highp vec4 BLOCK(highp mat3 params, highp vec2 pt) {
			highp vec2 at = params[0].xy;
			highp float seed = params[0].z * 16.0;
			highp vec2 right = params[1].xy;
			highp float mode = params[1].z;
			highp vec2 radii = params[2].xy;
			highp float round = params[2].z;

			highp vec2 local = vec2(
				dot(pt-at,right),
				dot(pt-at,vec2(-right.y,right.x))
			);

			highp float dis = sdRoundedBox( local, radii, round );

			if (mode == 3.0) {
				highp float spacing = 2.0 * radii.y;
				highp float rad = radii.y;
				highp float wrap = (fract(local.x / spacing + fract(TIME / 10.0)) - 0.5 ) * spacing;
				dis = max(dis, sdRoundedBox( vec2(wrap, local.y), vec2(rad, radii.y), round ) );
			}

			dis += 0.2 * (noise(local / 1.5 + seed, 0.0) + 1.0);
			dis += 0.1 * (noise(local / 0.7 - 5.0 + seed, 0.0) + 1.0);

			if (mode == 2.0 || mode == 3.0) {
				highp float t = TIME * (300.0 * 2.0 * 3.1415926 / 300.0) + seed;
				dis += 0.05 * noise(local / 0.3, t);
			}
			if (mode == 0.0) {
				return vec4(dis, 10.0, 10.0, 10.0);
			} else if (mode == 1.0) {
				return vec4(10.0, dis, 10.0, 10.0);
			} else if (mode == 2.0 || mode == 3.0) {
				return vec4(10.0, 10.0f, dis, 10.0);
			} else {
				return vec4(10.0, 10.0f, 10.0, dis);
			}
		}
		layout(location=0) out lowp vec4 fragColor;

		//approxmiate circular smooth minimum from https://iquilezles.org/articles/smin/
		highp float smin( highp float a, highp float b, highp float k ) {
			k *= 1.0/(1.0-sqrt(0.5));
			highp float h = max( k-abs(a-b), 0.0 )/k;
			const highp float b2 = 13.0/4.0 - 4.0*sqrt(0.5);
			const highp float b3 =  3.0/4.0 - 1.0*sqrt(0.5);
			return min(a,b) - k*h*h*(h*b3*(h-4.0)+b2);
		}

		void main() {
			//r = ground, < 0 is inside
			//g = cave, < 0 is inside
			//b = water, < 0 is inside
			highp vec4 acc = vec4(10.0);
			for (highp uint i = 0u; i < BLOCKS_COUNT; ++i) {
				highp vec4 vals = BLOCK(BLOCKS[i], position);
				acc.r = smin(acc.r, vals.r, 0.2);
				acc.g = smin(acc.g, vals.g, 0.2);
				acc.b = smin(acc.b, vals.b, 0.2);
				acc.a = smin(acc.a, vals.a, 0.2);
			}

			float s = max(dFdx(position.x), dFdy(position.y));

			lowp vec3 color = vec3(0.0); //air
			if (acc.r < 0.0) {
				if (acc.g > 0.0) {
					//ground!
					if (acc.r >-0.1) {
						color = vec3(0.5, 0.5, 0.2);
						color *= (acc.r - -0.1) / s;
					} else {
						color = vec3(0.5, 0.7, 0.2);
					}
				} else {
					//cave!
					color = vec3(0.1, 0.2, 0.1);
					if (acc.b < 0.0) {
						//water on cave
						color = vec3(0.6, 0.6, 0.7);
					}
				}
			} else {
				//non-ground, non-cave!
				if (acc.b < 0.0) {
					//water
					color = vec3(0.65, 0.65, 0.8);
				}
			}
			
			fragColor = vec4(color, 1.0);
			/*
			highp float amt = sin(acc.r * 3.1415926 * 2.0) * 0.5 + 0.5;
			if (acc.r > 0.0) {
				fragColor = vec4(acc.r / 5.0 + amt, amt, amt, 1.0);
			} else {
				fragColor = vec4(amt, -acc.r / 5.0 + amt, amt, 1.0);
			}
			*/
		}
	`);
};
