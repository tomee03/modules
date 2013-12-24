var fs = require('fs');

function FileCache() {
	this.list = {};
	this.length = 0;
}

FileCache.prototype.init = function(framework) {
	framework.on('service', function(counter) {
		if (counter % 5 === 0)
			framework.module('filecache').clear();
	});
}

FileCache.prototype.has = function(id) {
	var obj = this.list[id];
	if (typeof(obj) === 'undefined')
		return false;
	return obj.expire.getTime() < new Date().getTime();
};

FileCache.prototype.add = function(file, expire, id, callback) {

	var self = this;
	var type = typeof(id);

	if (type === 'function') {
		var tmp = callback;
		callback = id;
		id = tmp;
		type = typeof(id);
	}

	if (type === 'undefined')
		id = utils.GUID(20);
	else if (typeof(self.list[id]) === 'undefined')
		self.length++;

	self.list[id] = { expire: expire, contentType: file.contentType, filename: file.filename, length: file.length };

	if (!callback) {
		file.copy(framework.path.temp(id + '.filecache'));
		return id;
	}

	file.copy(framework.path.temp(id + '.filecache'), function() {
		callback(id, self.list[id]);
	});

	return id;
};

FileCache.prototype.read = function(id, callback, remove) {

	var self = this;

	if (typeof(self.list[id]) === 'undefined') {
		callback(new Error('File not found.'));
		return;
	}

	var obj = self.list[id];

	if (obj.expire.getTime() < new Date().getTime()) {
		self.remove(id);
		callback(new Error('File not found.'));
		return;
	}

	var stream = fs.createReadStream(framework.path.temp(id + '.filecache'));

	if (remove) {
		stream.on('close', function() {
			self.remove(id);
		});
	}

	callback(null, obj, stream);
	return self;
};

FileCache.prototype.fileserver = function(name, id, callback, headers) {

	var self = this;

	if (!(id instanceof Array))
		id = [id];

	var arr = [];
	var length = id.length;

	for (var i = 0; i < length; i++) {
		var file = self.list[id[i]];
		if (typeof(file) === 'undefined')
			continue;
		arr.push({ name: id[i], contentType: file.contentType, filename: file.filename, path: framework.path.temp(id[i] + '.filecache') });
	}

	if (arr.length === 0) {
		callback(new Error('Collection doesn\'t contain files.'))
		return false;
	}

	self.module('fileserver').upload(name, arr, callback, headers);
	return true;
};

FileCache.prototype.remove = function(id) {

	var self = this;

	if (!(id instanceof Array))
		id = [id];

	var arr = [];
	var length = id.length;

	for (var i = 0; i < length; i++) {

		var key = id[i];
		var file = self.list[key];

		if (typeof(file) === 'undefined')
			continue;

		delete self.list[key];
		self.length--;
		arr.push(framework.path.temp(id + '.filecache'));
	}

	arr.waiting(function(path, next) {
		fs.unlink(path, function() {
			next();
		});
	});

	return self;
};

FileCache.prototype.clear = function() {

	var self = this;
	var arr = Object.keys(self.list);
	var length = arr.length;
	var tmp = [];
	var now = new Date().getTime();

	for (var i = 0; i < length; i++) {
		var obj = self.list[arr[i]];

		if (obj.expire.getTime() >= now)
			continue;

		delete self.list[arr[i]];
		tmp.push(framework.path.temp(arr[i] + '.filecache'));
		self.length--;
	}

	if (tmp.length > 0)
		framework._clear(tmp);

	return self;
};

var filecache = new FileCache();

module.exports = filecache;
module.exports.install = function(framework) {
	filecache.init(framework);
};