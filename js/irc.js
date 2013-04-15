var __extends = this.__extends || function (d, b) {
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
define(["require", "exports", 'colors', 'EventEmitter'], function(require, exports, __colors__, __EventEmitter__) {
    var colors = __colors__;

    var EventEmitter = __EventEmitter__;

    var codes = colors.codes;
    var Client = (function (_super) {
        __extends(Client, _super);
        function Client(bridge, server, nick, opt) {
            var _this = this;
                _super.call(this);
            this.conn = null;
            this.prefixForMode = {
            };
            this.modeForPrefix = {
            };
            this._whoisData = {
            };
            this.opt = {
                bridge: bridge,
                server: server,
                nick: nick,
                password: null,
                userName: 'browserbot',
                realName: 'browsIRC client',
                port: 6667,
                debug: false,
                showErrors: false,
                autoRejoin: true,
                autoConnect: true,
                channels: [],
                retryCount: null,
                retryDelay: 2000,
                secure: false,
                floodProtection: false,
                floodProtectionDelay: 1000,
                stripColors: false,
                channelPrefixes: "&#",
                messageSplit: 512
            };
            this.supported = {
                channel: {
                    idlength: [],
                    length: 200,
                    limit: [],
                    modes: {
                        a: '',
                        b: '',
                        c: '',
                        d: ''
                    },
                    types: this.opt.channelPrefixes
                },
                kicklength: 0,
                maxlist: [],
                maxtargets: [],
                modes: 3,
                nicklength: 9,
                topiclength: 0,
                usermodes: ''
            };
            if(typeof arguments[3] == 'object') {
                var keys = Object.keys(this.opt);
                for(var i = 0; i < keys.length; i++) {
                    var k = keys[i];
                    if(arguments[3][k] !== undefined) {
                        this.opt[k] = arguments[3][k];
                    }
                }
            }
            if(this.opt.floodProtection) {
                this.activateFloodProtection();
            }
            if(this.opt.autoConnect === true) {
                this.connect();
            }
            this.addListener("raw", function (message) {
                switch(message.command) {
                    case "001":
                        _this.nick = message.args[0];
                        _this.emit('registered', message);
                        break;
                    case "002":
                    case "003":
                    case "rpl_myinfo":
                        _this.supported.usermodes = message.args[3];
                        break;
                    case "rpl_isupport":
                        message.args.forEach(function (arg) {
                            var match;
                            if(match = arg.match(/([A-Z]+)=(.*)/)) {
                                var param = match[1];
                                var value = match[2];
                                switch(param) {
                                    case 'CHANLIMIT':
                                        value.split(',').forEach(function (val) {
                                            val = val.split(':');
                                            _this.supported.channel.limit[val[0]] = parseInt(val[1]);
                                        });
                                        break;
                                    case 'CHANMODES':
                                        value = value.split(',');
                                        var type = [
                                            'a', 
                                            'b', 
                                            'c', 
                                            'd'
                                        ];
                                        for(var i = 0; i < type.length; i++) {
                                            _this.supported.channel.modes[type[i]] += value[i];
                                        }
                                        break;
                                    case 'CHANTYPES':
                                        _this.supported.channel.types = value;
                                        break;
                                    case 'CHANNELLEN':
                                        _this.supported.channel.length = parseInt(value);
                                        break;
                                    case 'IDCHAN':
                                        value.split(',').forEach(function (val) {
                                            val = val.split(':');
                                            _this.supported.channel.idlength[val[0]] = val[1];
                                        });
                                        break;
                                    case 'KICKLEN':
                                        _this.supported.kicklength = value;
                                        break;
                                    case 'MAXLIST':
                                        value.split(',').forEach(function (val) {
                                            val = val.split(':');
                                            _this.supported.maxlist[val[0]] = parseInt(val[1], 10);
                                        });
                                        break;
                                    case 'NICKLEN':
                                        _this.supported.nicklength = parseInt(value);
                                        break;
                                    case 'PREFIX':
                                        if(match = value.match(/\((.*?)\)(.*)/)) {
                                            match[1] = match[1].split('');
                                            match[2] = match[2].split('');
                                            while(match[1].length) {
                                                _this.modeForPrefix[match[2][0]] = match[1][0];
                                                _this.supported.channel.modes.b += match[1][0];
                                                _this.prefixForMode[match[1].shift()] = match[2].shift();
                                            }
                                        }
                                        break;
                                    case 'STATUSMSG':
                                        break;
                                    case 'TARGMAX':
                                        value.split(',').forEach(function (val) {
                                            val = val.split(':');
                                            val[1] = (!val[1]) ? 0 : parseInt(val[1]);
                                            _this.supported.maxtargets[val[0]] = val[1];
                                        });
                                        break;
                                    case 'TOPICLEN':
                                        _this.supported.topiclength = parseInt(value);
                                        break;
                                }
                            }
                        });
                        break;
                    case "rpl_luserclient":
                    case "rpl_luserop":
                    case "rpl_luserchannels":
                    case "rpl_luserme":
                    case "rpl_localusers":
                    case "rpl_globalusers":
                    case "rpl_statsconn":
                        break;
                    case "err_nicknameinuse":
                        if(typeof (_this.opt.nickMod) == 'undefined') {
                            _this.opt.nickMod = 0;
                        }
                        _this.opt.nickMod++;
                        _this.send("NICK", _this.opt.nick + _this.opt.nickMod);
                        _this.nick = _this.opt.nick + _this.opt.nickMod;
                        break;
                    case "PING":
                        _this.send("PONG", message.args[0]);
                        _this.emit('ping', message.args[0]);
                        break;
                    case "NOTICE":
                        var from = message.nick;
                        var to = message.args[0];
                        if(!to) {
                            to = null;
                        }
                        var text = message.args[1];
                        if(text[0] === '\1' && text.lastIndexOf('\1') > 0) {
                            _this._handleCTCP(from, to, text, 'notice');
                            break;
                        }
                        _this.emit('notice', from, to, text, message);
                        if(_this.opt.debug && to == _this.nick) {
                            console.log('GOT NOTICE from ' + (from ? '"' + from + '"' : 'the server') + ': "' + text + '"');
                        }
                        break;
                    case "MODE":
                        if(_this.opt.debug) {
                            console.log("MODE:" + message.args[0] + " sets mode: " + message.args[1]);
                        }
                        var channel = _this.chanData(message.args[0]);
                        if(!channel) {
                            break;
                        }
                        var modeList = message.args[1].split('');
                        var adding = true;
                        var modeArgs = message.args.slice(2);
                        modeList.forEach(function (mode) {
                            if(mode == '+') {
                                adding = true;
                                return;
                            }
                            if(mode == '-') {
                                adding = false;
                                return;
                            }
                            if(mode in _this.prefixForMode) {
                                var user = modeArgs.shift();
                                if(adding) {
                                    if(channel.users[user].indexOf(_this.prefixForMode[mode]) === -1) {
                                        channel.users[user] += _this.prefixForMode[mode];
                                    }
                                    _this.emit('+mode', message.args[0], message.nick, mode, user, message);
                                } else {
                                    channel.users[user] = channel.users[user].replace(_this.prefixForMode[mode], '');
                                    _this.emit('-mode', message.args[0], message.nick, mode, user, message);
                                }
                            } else {
                                var modeArg;
                                if(mode.match(/^[bkl]$/)) {
                                    modeArg = modeArgs.shift();
                                    if(modeArg.length === 0) {
                                        modeArg = undefined;
                                    }
                                }
                                if(adding) {
                                    if(channel.mode.indexOf(mode) === -1) {
                                        channel.mode += mode;
                                    }
                                    _this.emit('+mode', message.args[0], message.nick, mode, modeArg, message);
                                } else {
                                    channel.mode = channel.mode.replace(mode, '');
                                    _this.emit('-mode', message.args[0], message.nick, mode, modeArg, message);
                                }
                            }
                        });
                        break;
                    case "NICK":
                        if(message.nick == _this.nick) {
                            _this.nick = message.args[0];
                        }
                        if(_this.opt.debug) {
                            console.log("NICK: " + message.nick + " changes nick to " + message.args[0]);
                        }
                        var channels = [];
                        for(var channame in _this.chans) {
                            var channel = _this.chans[channame];
                            if('string' == typeof channel.users[message.nick]) {
                                channel.users[message.args[0]] = channel.users[message.nick];
                                delete channel.users[message.nick];
                                channels.push(channame);
                            }
                        }
                        _this.emit('nick', message.nick, message.args[0], channels, message);
                        break;
                    case "rpl_motdstart":
                        _this.motd = message.args[1] + "\n";
                        break;
                    case "rpl_motd":
                        _this.motd += message.args[1] + "\n";
                        break;
                    case "rpl_endofmotd":
                    case "err_nomotd":
                        _this.motd += message.args[1] + "\n";
                        _this.emit('motd', _this.motd);
                        break;
                    case "rpl_namreply":
                        var channel = _this.chanData(message.args[2]);
                        var users = message.args[3].trim().split(/ +/);
                        if(channel) {
                            users.forEach(function (user) {
                                var match = user.match(/^(.)(.*)$/);
                                if(match) {
                                    if(match[1] in _this.modeForPrefix) {
                                        channel.users[match[2]] = match[1];
                                    } else {
                                        channel.users[match[1] + match[2]] = '';
                                    }
                                }
                            });
                        }
                        break;
                    case "rpl_endofnames":
                        var channel = _this.chanData(message.args[1]);
                        if(channel) {
                            _this.emit('names', message.args[1], channel.users);
                            _this.emit('names' + message.args[1], channel.users);
                            _this.send('MODE', message.args[1]);
                        }
                        break;
                    case "rpl_topic":
                        var channel = _this.chanData(message.args[1]);
                        if(channel) {
                            channel.topic = message.args[2];
                        }
                        break;
                    case "rpl_away":
                        _this._addWhoisData(message.args[1], 'away', message.args[2], true);
                        break;
                    case "rpl_whoisuser":
                        _this._addWhoisData(message.args[1], 'user', message.args[2]);
                        _this._addWhoisData(message.args[1], 'host', message.args[3]);
                        _this._addWhoisData(message.args[1], 'realname', message.args[5]);
                        break;
                    case "rpl_whoisidle":
                        _this._addWhoisData(message.args[1], 'idle', message.args[2]);
                        break;
                    case "rpl_whoischannels":
                        _this._addWhoisData(message.args[1], 'channels', message.args[2].trim().split(/\s+/));
                        break;
                    case "rpl_whoisserver":
                        _this._addWhoisData(message.args[1], 'server', message.args[2]);
                        _this._addWhoisData(message.args[1], 'serverinfo', message.args[3]);
                        break;
                    case "rpl_whoisoperator":
                        _this._addWhoisData(message.args[1], 'operator', message.args[2]);
                        break;
                    case "330":
                        _this._addWhoisData(message.args[1], 'account', message.args[2]);
                        _this._addWhoisData(message.args[1], 'accountinfo', message.args[3]);
                        break;
                    case "rpl_endofwhois":
                        _this.emit('whois', _this._clearWhoisData(message.args[1]));
                        break;
                    case "rpl_liststart":
                        _this.channellist = [];
                        _this.emit('channellist_start');
                        break;
                    case "rpl_list":
                        var channel = {
                            name: message.args[1],
                            users: message.args[2],
                            topic: message.args[3]
                        };
                        _this.emit('channellist_item', channel);
                        _this.channellist.push(channel);
                        break;
                    case "rpl_listend":
                        _this.emit('channellist', _this.channellist);
                        break;
                    case "333":
                        var channel = _this.chanData(message.args[1]);
                        if(channel) {
                            channel.topicBy = message.args[2];
                            _this.emit('topic', message.args[1], channel.topic, channel.topicBy, message);
                        }
                        break;
                    case "TOPIC":
                        _this.emit('topic', message.args[0], message.args[1], message.nick, message);
                        var channel = _this.chanData(message.args[0]);
                        if(channel) {
                            channel.topic = message.args[1];
                            channel.topicBy = message.nick;
                        }
                        break;
                    case "rpl_channelmodeis":
                        var channel = _this.chanData(message.args[1]);
                        if(channel) {
                            channel.mode = message.args[2];
                        }
                        break;
                    case "329":
                        var channel = _this.chanData(message.args[1]);
                        if(channel) {
                            channel.created = message.args[2];
                        }
                        break;
                    case "JOIN":
                        if(_this.nick == message.nick) {
                            _this.chanData(message.args[0], true);
                        } else {
                            var channel = _this.chanData(message.args[0]);
                            channel.users[message.nick] = '';
                        }
                        _this.emit('join', message.args[0], message.nick, message);
                        _this.emit('join' + message.args[0], message.nick, message);
                        if(message.args[0] != message.args[0].toLowerCase()) {
                            _this.emit('join' + message.args[0].toLowerCase(), message.nick, message);
                        }
                        break;
                    case "PART":
                        _this.emit('part', message.args[0], message.nick, message.args[1], message);
                        _this.emit('part' + message.args[0], message.nick, message.args[1], message);
                        if(message.args[0] != message.args[0].toLowerCase()) {
                            _this.emit('part' + message.args[0].toLowerCase(), message.nick, message.args[1], message);
                        }
                        if(_this.nick == message.nick) {
                            var channel = _this.chanData(message.args[0]);
                            delete _this.chans[channel.key];
                        } else {
                            var channel = _this.chanData(message.args[0]);
                            delete channel.users[message.nick];
                        }
                        break;
                    case "KICK":
                        _this.emit('kick', message.args[0], message.args[1], message.nick, message.args[2], message);
                        _this.emit('kick' + message.args[0], message.args[1], message.nick, message.args[2], message);
                        if(message.args[0] != message.args[0].toLowerCase()) {
                            _this.emit('kick' + message.args[0].toLowerCase(), message.args[1], message.nick, message.args[2], message);
                        }
                        if(_this.nick == message.args[1]) {
                            var channel = _this.chanData(message.args[0]);
                            delete _this.chans[channel.key];
                        } else {
                            var channel = _this.chanData(message.args[0]);
                            delete channel.users[message.args[1]];
                        }
                        break;
                    case "KILL":
                        var nick = message.args[0];
                        var channels = [];
                        for(var channel in _this.chans) {
                            if(_this.chans[channel].users[nick]) {
                                channels.push(channel);
                            }
                            delete _this.chans[channel].users[nick];
                        }
                        _this.emit('kill', nick, message.args[1], channels, message);
                        break;
                    case "PRIVMSG":
                        var from = message.nick;
                        var to = message.args[0];
                        var text = message.args[1];
                        if(text[0] === '\1' && text.lastIndexOf('\1') > 0) {
                            _this._handleCTCP(from, to, text, 'privmsg');
                            break;
                        }
                        _this.emit('message', from, to, text, message);
                        if(_this.supported.channel.types.indexOf(to.charAt(0)) !== -1) {
                            _this.emit('message#', from, to, text, message);
                            _this.emit('message' + to, from, text, message);
                            if(to != to.toLowerCase()) {
                                _this.emit('message' + to.toLowerCase(), from, text, message);
                            }
                        }
                        if(to == _this.nick) {
                            _this.emit('pm', from, text, message);
                        }
                        if(_this.opt.debug && to == _this.nick) {
                            console.log('GOT MESSAGE from ' + from + ': ' + text);
                        }
                        break;
                    case "INVITE":
                        var from = message.nick;
                        var to = message.args[0];
                        var channel = message.args[1];
                        _this.emit('invite', channel, from, message);
                        break;
                    case "QUIT":
                        if(_this.opt.debug) {
                            console.log("QUIT: " + message.prefix + " " + message.args.join(" "));
                        }
                        if(_this.nick == message.nick) {
                            break;
                        }
                        var channels = [];
                        var channelObj;
                        for(var channame in _this.chans) {
                            channelObj = _this.chans[channame];
                            if('string' == typeof channelObj.users[message.nick]) {
                                delete channelObj.users[message.nick];
                                channels.push(channame);
                            }
                        }
                        _this.emit('quit', message.nick, message.args[0], channels, message);
                        break;
                    case "err_umodeunknownflag":
                        if(_this.opt.showErrors) {
                            console.log("\033[01;31mERROR: ", message, "\033[0m");
                        }
                        break;
                    default:
                        if(message.commandType == 'error') {
                            _this.emit('error', message);
                            if(_this.opt.showErrors) {
                                console.log("\033[01;31mERROR: ", message, "\033[0m");
                            }
                        } else {
                            if(_this.opt.debug) {
                                console.log("\033[01;31mUnhandled message: ", message, "\033[0m");
                            }
                        }
                        break;
                }
            });
            this.addListener('kick', function (channel, who, by, reason) {
                if(_this.opt.autoRejoin) {
                    _this.send.apply(_this, [
                        'JOIN'
                    ].concat(channel.split(' ')));
                }
            });
            this.addListener('motd', function (motd) {
                _this.opt.channels.forEach(function (channel) {
                    _this.send.apply(_this, [
                        'JOIN'
                    ].concat(channel.split(' ')));
                });
            });
        }
        Client.prototype.chanData = function (name, create) {
            var key = name.toLowerCase();
            if(create) {
                this.chans[key] = this.chans[key] || {
                    key: key,
                    serverName: name,
                    users: {
                    },
                    mode: ''
                };
            }
            return this.chans[key];
        };
        Client.prototype.connect = function (retryCount) {
            var _this = this;
            retryCount = retryCount || 0;
            this.chans = {
            };
            var scheme = (this.opt.secure) ? 'wss://' : 'ws://';
            var url = scheme + this.opt.bridge + '/' + encodeURI(this.opt.server) + ':' + this.opt.port;
            this.conn = new WebSocket(url);
            this.conn.addEventListener("open", function () {
                if(_this.opt.password !== null) {
                    _this.send("PASS", _this.opt.password);
                }
                _this.send("NICK", _this.opt.nick);
                _this.nick = _this.opt.nick;
                _this.send("USER", _this.opt.userName, 8, "*", _this.opt.realName);
                _this.emit("connect");
            });
            this.conn.addEventListener("message", function (evt) {
                var message = parseMessage(evt.data, _this.opt.stripColors);
                try  {
                    _this.emit('raw', message);
                } catch (err) {
                    if(_this.conn.readyState !== WebSocket.CLOSING) {
                        throw err;
                    }
                }
            });
            this.conn.addEventListener("close", function (evt) {
                if(_this.opt.debug) {
                    console.log('Connection got "close" event');
                }
                if(evt.wasClean) {
                    return;
                }
                if(_this.opt.debug) {
                    console.log('Disconnected: reconnecting');
                }
                if(_this.opt.retryCount !== null && retryCount >= _this.opt.retryCount) {
                    if(_this.opt.debug) {
                        console.log('Maximum retry count (' + _this.opt.retryCount + ') reached. Aborting');
                    }
                    _this.emit('abort', _this.opt.retryCount);
                    return;
                }
                if(_this.opt.debug) {
                    console.log('Waiting ' + _this.opt.retryDelay + 'ms before retrying');
                }
                setTimeout(function () {
                    _this.connect(retryCount + 1);
                }, _this.opt.retryDelay);
            });
            this.conn.addEventListener("error", function (exception) {
                _this.emit("netError", exception);
            });
        };
        Client.prototype.disconnect = function (message) {
            message = message || "browsIRC says goodbye";
            if(this.conn.readyState === WebSocket.OPEN) {
                this.send("QUIT", message);
            }
            this.conn.close();
        };
        Client.prototype.send = function (command) {
            var args = [];
            for (var _i = 0; _i < (arguments.length - 1); _i++) {
                args[_i] = arguments[_i + 1];
            }
            var args = Array.prototype.slice.call(arguments);
            if(args[args.length - 1].match(/\s/) || args[args.length - 1].match(/^:/) || args[args.length - 1] === "") {
                args[args.length - 1] = ":" + args[args.length - 1];
            }
            if(this.opt.debug) {
                console.log('SEND: ' + args.join(" "));
            }
            if(this.conn.readyState === WebSocket.OPEN) {
                this.conn.send(args.join(" "));
            }
        };
        Client.prototype.activateFloodProtection = function (interval) {
            var _this = this;
            var cmdQueue = [], safeInterval = interval || this.opt.floodProtectionDelay, origSend = this.send, dequeue;
            this.send = function () {
                cmdQueue.push(arguments);
            };
            dequeue = function () {
                var args = cmdQueue.shift();
                if(args) {
                    origSend.apply(_this, args);
                }
            };
            setInterval(dequeue, safeInterval);
            dequeue();
        };
        Client.prototype.join = function (channel, callback) {
            var _this = this;
            this.once('join' + channel, function () {
                if(_this.opt.channels.indexOf(channel) == -1) {
                    _this.opt.channels.push(channel);
                }
                if(typeof (callback) == 'function') {
                    return callback.apply(_this, arguments);
                }
            });
            this.send.apply(this, [
                'JOIN'
            ].concat(channel.split(' ')));
        };
        Client.prototype.part = function (channel, callback) {
            if(typeof (callback) == 'function') {
                this.once('part' + channel, callback);
            }
            if(this.opt.channels.indexOf(channel) != -1) {
                this.opt.channels.splice(this.opt.channels.indexOf(channel), 1);
            }
            this.send('PART', channel);
        };
        Client.prototype.say = function (target, text) {
            var _this = this;
            if(typeof text !== 'undefined') {
                text.toString().split(/\r?\n/).filter(function (line) {
                    return line.length > 0;
                }).forEach(function (line) {
                    var messagePart;
                    var r = new RegExp(".{1," + _this.opt.messageSplit + "}", "g");
                    while((messagePart = r.exec(line)) != null) {
                        _this.send('PRIVMSG', target, messagePart[0]);
                        _this.emit('thisMessage', target, messagePart[0]);
                    }
                });
            }
        };
        Client.prototype.action = function (channel, text) {
            var _this = this;
            if(typeof text !== 'undefined') {
                text.toString().split(/\r?\n/).filter(function (line) {
                    return line.length > 0;
                }).forEach(function (line) {
                    _this.say(channel, '\u0001ACTION ' + line + '\u0001');
                });
            }
        };
        Client.prototype.notice = function (target, text) {
            this.send('NOTICE', target, text);
        };
        Client.prototype.whois = function (nick, callback) {
            var _this = this;
            if(typeof callback === 'function') {
                var callbackWrapper = function (info) {
                    if(info.nick == nick) {
                        _this.removeListener('whois', callbackWrapper);
                        return callback.apply(_this, arguments);
                    }
                };
                this.addListener('whois', callbackWrapper);
            }
            this.send('WHOIS', nick);
        };
        Client.prototype.list = function () {
            var args = Array.prototype.slice.call(arguments, 0);
            args.unshift('LIST');
            this.send.apply(this, args);
        };
        Client.prototype._addWhoisData = function (nick, key, value, onlyIfExists) {
            if(onlyIfExists && !this._whoisData[nick]) {
                return;
            }
            this._whoisData[nick] = this._whoisData[nick] || {
                nick: nick
            };
            this._whoisData[nick][key] = value;
        };
        Client.prototype._clearWhoisData = function (nick) {
            this._addWhoisData(nick, 'nick', nick);
            var data = this._whoisData[nick];
            delete this._whoisData[nick];
            return data;
        };
        Client.prototype._handleCTCP = function (from, to, text, type) {
            text = text.slice(1);
            text = text.slice(0, text.indexOf('\1'));
            var parts = text.split(' ');
            this.emit('ctcp', from, to, text, type);
            this.emit('ctcp-' + type, from, to, text);
            if(type === 'privmsg' && text === 'VERSION') {
                this.emit('ctcp-version', from, to);
            }
            if(parts[0] === 'ACTION' && parts.length > 1) {
                this.emit('action', from, to, parts.slice(1).join(' '));
            }
            if(parts[0] === 'PING' && type === 'privmsg' && parts.length > 1) {
                this.ctcp(from, 'notice', text);
            }
        };
        Client.prototype.ctcp = function (to, type, text) {
            return this[type === 'privmsg' ? 'say' : 'notice'](to, '\1' + text + '\1');
        };
        return Client;
    })(EventEmitter.EventEmitter);
    exports.Client = Client;    
    function parseMessage(line, stripColors) {
        var message = {
            command: null,
            rawCommand: null,
            commandType: null,
            args: []
        };
        var match;
        if(stripColors) {
            line = line.replace(/[\x02\x1f\x16\x0f]|\x03\d{0,2}(?:,\d{0,2})?/g, "");
        }
        if(match = line.match(/^:([^ ]+) +/)) {
            message.prefix = match[1];
            line = line.replace(/^:[^ ]+ +/, '');
            if(match = message.prefix.match(/^([_a-zA-Z0-9\[\]\\`^{}|-]*)(!([^@]+)@(.*))?$/)) {
                message.nick = match[1];
                message.user = match[3];
                message.host = match[4];
            } else {
                message.server = message.prefix;
            }
        }
        match = line.match(/^([^ ]+) */);
        message.command = match[1];
        message.rawCommand = match[1];
        message.commandType = 'normal';
        line = line.replace(/^[^ ]+ +/, '');
        if(codes[message.rawCommand]) {
            message.command = codes[message.rawCommand].name;
            message.commandType = codes[message.rawCommand].type;
        }
        var middle, trailing;
        if(line.search(/^:|\s+:/) != -1) {
            match = line.match(/(.*?)(?:^:|\s+:)(.*)/);
            middle = match[1].trimRight();
            trailing = match[2];
        } else {
            middle = line;
        }
        if(middle.length) {
            message.args = middle.split(/ +/);
        }
        if(typeof (trailing) != 'undefined' && trailing.length) {
            message.args.push(trailing);
        }
        return message;
    }
    exports.parseMessage = parseMessage;
})
