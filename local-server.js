#!/usr/bin/env node

/*
 * Local server that allows saving edited levels.
 *  (based very loosely on the tchow-tunes / shout.horse server)
 */

const port = 8888;

const http = require('http');
const fs = require('fs');
const fsPromises = fs.promises;

process.chdir(__dirname); //<-- server works relative to its own directory

const server = http.createServer();


const staticData = {
	'/':{file:'index.html', contentType:'text/html;charset=utf8'},
	'/world.json':{file:'world.json', contentType:'application/json'},
};

for (const file of fs.readdirSync('.')) {
	if (/^[^\.].*\.mjs$/.test(file)) {
		staticData[`/${file}`] = {file:file, contentType:"text/javascript"};
	}
}


server.on('request', async (request, response) => {
	let split = request.url.split('/');
	if (request.method === 'GET') {
		if (request.url in staticData) {
			sendFile(staticData[request.url].file, staticData[request.url].contentType, request, response);
			return;
		}
	} else if (request.method === 'PUT') {
		if (request.url === '/world.json') {

			//body-getting code inspired by:
			//  https://nodejs.org/en/learn/modules/anatomy-of-an-http-transaction
			let body = [];
			request.on('data', (chunk) => {
				body.push(chunk);
			});
			request.on('end', async () => {
				await fsPromises.writeFile('world.json.temp', Buffer.concat(body));
				await fsPromises.rename('world.json.temp', 'world.json');
				console.log(`Wrote world.json`);
				response.statusCode = 200;
				response.end();
			});
			request.on('error', (err) => {
				response.statusCode = 500;
				responmse.end();
			});
			return;
		}
	}
	console.log(`${request.method} ${request.url}`);
	//fall-through:
	response.statusCode = 404;
	response.end();
});

function sendFile(file, contentType, request, response) {
	console.log("  File: '" + file + "'" + (request.headers.range ? " with range '" + request.headers.range + "'" : "")); //DEBUG
	fs.open(file, (err, fd) => {
		if (err) {
			console.log("Opening '" + file + "':");
			console.log(err);
			response.statusCode = 500;
			response.end('Not Found');
			return;
		}
		fs.fstat(fd, (err, stats) => {
			if (err) {
				console.log("Stat-ing '" + file + "':");
				console.log(err);
				response.statusCode = 500;
				response.end('Failed');
				return;
			}

			response.setHeader('Content-Type', contentType);
			response.setHeader('Content-Length', stats.size);
			response.statusCode = 200;
			let readStream = fs.createReadStream('', {fd:fd, start:0, end:stats.size});

			readStream.pipe(response);
			readStream.on('error', function(err) {
				console.log("Sending '" + file + "':");
				console.log(err);
				response.statusCode = 500;
				response.end('Failed');
			});
		});
	});
}


console.log(`Listening (via http) on port ${port}.`);
server.listen(port);
