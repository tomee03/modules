var path = require('path');
var parser = require('url');
var http = require('http');
var https = require('https');
var fs = require('fs');
var NEWLINE = '\r\n';
var ERROR = 'You haven\'t defined URL address to file server. Define a server: module.configure(name, url)';
var setting = {};

exports.upload = function(name, files, callback, headers) {

	if (typeof(setting[name]) === 'undefined') {
		if (callback)
			callback(new Error(ERROR));
		return;
	}

	if (!(files instanceof Array))
		files = [files];

	send(setting[name], name, files, callback, headers);
};

exports.info = function(name, id, callback, headers) {

	if (typeof(setting[name]) === 'undefined') {
		if (callback)
			callback(new Error(ERROR));
		return;
	}

	utils.request(utils.path(setting[name]) + name + '/info/' + id + '/', 'GET', null, function(err, data, status) {

		if (status !== 200) {
			callback(new Error(status));
			return;
		}

		callback(null, JSON.parse(data));
	}, headers);
};

exports.remove = function(name, id, callback, headers) {

	if (typeof(setting[name]) === 'undefined') {
		if (callback)
			callback(new Error(ERROR));
		return;
	}

	utils.request(utils.path(setting[name]) + name + '/' + (id instanceof Array ? id.join('-') : id) + '/', 'DELETE', null, function(err, data, status) {

		if (status !== 200) {
			callback(new Error(status));
			return;
		}

		callback(null);
	}, headers);
};


exports.count = function(name, callback, headers) {

	if (typeof(setting[name]) === 'undefined') {
		if (callback)
			callback(new Error(ERROR));
		return;
	}

	utils.request(utils.path(setting[name]) + name + '/count/', 'GET', null, function(err, data, status) {

		if (status !== 200) {
			callback(new Error(status));
			return;
		}

		callback(null, JSON.parse(data));
	}, headers);
};

exports.listing = function(name, callback, headers) {

	if (typeof(setting[name]) === 'undefined') {
		if (callback)
			callback(new Error(ERROR));
		return;
	}

	utils.request(utils.path(setting[name]) + name + '/listing/', 'GET', null, function(err, data, status) {

		if (status !== 200) {
			callback(new Error(status));
			return;
		}

		callback(null, JSON.parse(data));
	}, headers);
};

exports.read = function(name, id, callback, headers) {

	if (typeof(setting[name]) === 'undefined') {
		if (callback)
			callback(new Error(ERROR));
		return;
	}

	var uri = parser.parse(utils.path(setting[name]) + name + '/' + id + '/');
	var options = { protocol: uri.protocol, auth: uri.auth, method: 'GET', hostname: uri.hostname, port: uri.port, path: uri.path, agent: false, headers: h };

	var h = {};

	if (headers)
		utils.extend(h, headers);

	h['Cache-Control'] = 'max-age=0';
	h['X-Powered-By'] = 'partial.js v' + framework.version;

	var connection = options.protocol === 'https:' ? https : http;
	var req = connection.request(options, function(res) {
		var filename = (res.headers['content-disposition'] || '').replace('attachment; filename=', '').trim();
		callback(null, res, filename, res.headers['content-type'] || '', res.headers['content-length'], (res.headers['x-image-width'] || '0').parseInt(), (res.headers['x-image-height'] || '0').parseInt());
	});

	req.end();
};

exports.pipe = function(req, res, name, id, headers) {
	exports.read(name, id, function(err, stream, filename, contentType, length, width, height) {
		framework.responseStream(req, res, contentType, stream, filename);
	}, headers);
};

exports.pipe_image = function(req, res, name, id, fnProcess, headers, useImageMagick) {

	if (typeof(setting[name]) === 'undefined') {
		framework.response500(req, res, new Error(ERROR));
		return;
	}

	exports.read(name, id, function(err, stream, filename, contentType, length, width, height) {

		if (err) {
			framework.response500(req, res, err);
			return;
		}

		if (contentType.indexOf('image/') === -1) {
			framework.response404(req, res);
			return;
		}

		framework.responseImage(req, res, stream, fnProcess, null, null, useImageMagick);

	}, headers);
};

exports.pipe_image_withoutcache = function(req, res, name, id, fnProcess, headers, useImageMagick) {

	if (typeof(setting[name]) === 'undefined') {
		framework.response500(req, res, new Error(ERROR));
		return;
	}

	exports.read(name, id, function(err, stream, filename, contentType, length, width, height) {
		if (contentType.indexOf('image/') === -1) {
			framework.response404(req, res);
			return;
		}
		framework.responseImageWithoutCache(req, res, stream, fnProcess, null, null, useImageMagick);
	}, headers);
};

exports.configure = function(name, url) {
	setting[name] = url;
};

function send(url, name, files, callback, headers) {

	var self = this;

	var BOUNDARY = '----' + Math.random().toString(16).substring(2);
	var h = {};

	if (headers)
		utils.extend(h, headers);

	name = path.basename(name);

	h['Cache-Control'] = 'max-age=0';
	h['Content-Type'] = 'multipart/form-data; boundary=' + BOUNDARY;
	h['X-Powered-By'] = 'partial.js v' + framework.version;

	var uri = parser.parse(utils.path(url) + name + '/');
	var options = { protocol: uri.protocol, auth: uri.auth, method: 'PUT', hostname: uri.hostname, port: uri.port, path: uri.path, agent: false, headers: h };

	var response = function(res) {

		if (!callback)
			return;

		res.body = '';

		res.on('data', function(chunk) {
			this.body += chunk.toString('utf8');
		});

		res.on('end', function() {
			var isError = !res.body.isJSON();
			callback(isError ? new Error(res.body) : null, isError ? null : JSON.parse(res.body));
		});

	};

	var connection = options.protocol === 'https:' ? https : http;
	var req = connection.request(options, response);

	if (callback) {
		req.on('error', function(err) {
			callback(err, null);
		});
	}

	send_write(files, req, BOUNDARY, 0);
	return self;
}

function send_write(files, req, boundary, index) {

	var file = files.shift();

	if (typeof(file) === 'undefined') {
		req.end(NEWLINE + NEWLINE + '--' + boundary + '--');
		return;
	}

	var header = NEWLINE + NEWLINE + '--' + boundary + NEWLINE + 'Content-Disposition: form-data; name="' + (file.name || 'file' + index) + '"; filename="' + file.filename + '"' + NEWLINE + 'Content-Type: ' + file.contentType + NEWLINE + NEWLINE;
	req.write(header);

	var stream = fs.createReadStream(file.path, { flags: 'r' });

	stream.on('error', function(err) {
		send_write(files, req, boundary, index++);
	});

	stream.once('end', function() {
		send_write(files, req, boundary, index++);
	});

	stream.pipe(req, { end: false });
}