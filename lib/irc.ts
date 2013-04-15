/*
    irc.js - Browser IRC client library via WebSocket Bridge

    Original project: https://github.com/noraesae/node-irc

    (C) Copyright Burak Yigit Kaya 2013

    This library is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This library is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this library.  If not, see <http://www.gnu.org/licenses/>.
*/

import colors = module('colors');
import EventEmitter = module('EventEmitter');

var codes = colors.codes;
export interface Options {
    bridge: string;
    server: string;
    nick: string;
    nickMod?: number;
    password: string;
    userName: string;
    realName: string;
    port: number;
    debug: bool;
    showErrors: bool;
    autoConnect: bool;
    autoRejoin?: bool;
    channels: string[];
    retryCount: number;
    retryDelay: number;
    secure: bool;
    floodProtection: bool;
    floodProtectionDelay: number;
    stripColors: bool;
    channelPrefixes: string;
    messageSplit: number;
}

export interface ModesInfo {
    a: string;
    b: string;
    c: string;
    d: string;
}

export interface ChannelsInfo {
    idlength: number[];
    length: number;
    limit: number[];
    modes: ModesInfo;
    types: string;
}

export interface Channel {
    created?: string;
    key?: string;
    serverName?: string;
    users: { [nick: string]: string; };
    mode?: string;
    topic?: string;
    topicBy?: string;
}

export interface SupportInfo {
    channel: ChannelsInfo;
    kicklength: number;
    maxlist: number[];
    maxtargets: string[];
    modes: number;
    nicklength: number;
    topiclength: number;
    usermodes: string;
}

export interface Message {
    prefix?: string;
    nick?: string;
    user?: string;
    host?: string;
    server?: string;
    command: string;
    rawCommand: string;
    commandType: string;
    args: string[];
}

export class Client extends EventEmitter.EventEmitter {
    opt: Options;
    supported: SupportInfo;
    conn = null;
    nick:string;
    motd: string;
    channellist: Channel[];
    prefixForMode = {};
    modeForPrefix = {};
    chans: { [name: string]: Channel; };
    _whoisData: any = {};

    constructor (bridge: string, server: string, nick: string, opt: Options) {
        super();
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

        // Features supported by the server
        // (initial values are RFC 1459 defaults. Zeros signify
        // no default or unlimited value)
        this.supported = {
            channel: {
                idlength: [],
                length: 200,
                limit: [],
                modes: { a: '', b: '', c: '', d: ''},
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

        if (typeof arguments[3] == 'object') {
            var keys = Object.keys(this.opt);
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                if (arguments[3][k] !== undefined)
                    this.opt[k] = arguments[3][k];
            }
        }

        if (this.opt.floodProtection) {
            this.activateFloodProtection();
        }

        // TODO - fail if nick or server missing
        // TODO - fail if username has a space in it
        if (this.opt.autoConnect === true) {
            this.connect();
        }

        this.addListener("raw", (message) => {
            switch ( message.command ) {
            case "001":
                // Set nick to whatever the server decided it really is
                // (normally this is because you chose something too long and
                // the server has shortened it
                this.nick = message.args[0];
                this.emit('registered', message);
                break;
            case "002":
            case "003":
            case "rpl_myinfo":
                this.supported.usermodes = message.args[3];
                break;
            case "rpl_isupport":
                message.args.forEach((arg) => {
                    var match;
                    if ( match = arg.match(/([A-Z]+)=(.*)/) ) {
                        var param = match[1];
                        var value = match[2];
                        switch(param) {
                        case 'CHANLIMIT':
                            value.split(',').forEach((val) => {
                                val = val.split(':');
                                this.supported.channel.limit[val[0]] = parseInt(val[1]);
                            });
                            break;
                        case 'CHANMODES':
                            value = value.split(',');
                            var type = ['a','b','c','d'];
                            for (var i = 0; i < type.length; i++) {
                                this.supported.channel.modes[type[i]] += value[i];
                            }
                            break;
                        case 'CHANTYPES':
                            this.supported.channel.types = value;
                            break;
                        case 'CHANNELLEN':
                            this.supported.channel.length = parseInt(value);
                            break;
                        case 'IDCHAN':
                            value.split(',').forEach((val) => {
                                val = val.split(':');
                                this.supported.channel.idlength[val[0]] = val[1];
                            });
                            break;
                        case 'KICKLEN':
                            this.supported.kicklength = value;
                            break;
                        case 'MAXLIST':
                            value.split(',').forEach((val) => {
                                val = val.split(':');
                                this.supported.maxlist[val[0]] = parseInt(val[1], 10);
                            });
                            break;
                        case 'NICKLEN':
                            this.supported.nicklength = parseInt(value);
                            break;
                        case 'PREFIX':
                            if (match = value.match(/\((.*?)\)(.*)/)) {
                                match[1] = match[1].split('');
                                match[2] = match[2].split('');
                                while ( match[1].length ) {
                                    this.modeForPrefix[match[2][0]] = match[1][0];
                                    this.supported.channel.modes.b += match[1][0];
                                    this.prefixForMode[match[1].shift()] = match[2].shift();
                                }
                            }
                            break;
                        case 'STATUSMSG':
                            break;
                        case 'TARGMAX':
                            value.split(',').forEach((val) => {
                                val = val.split(':');
                                val[1] = (!val[1]) ? 0 : parseInt(val[1]);
                                this.supported.maxtargets[val[0]] = val[1];
                            });
                            break;
                        case 'TOPICLEN':
                            this.supported.topiclength = parseInt(value);
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
                // Random welcome crap, ignoring
                break;
            case "err_nicknameinuse":
                if ( typeof(this.opt.nickMod) == 'undefined' )
                    this.opt.nickMod = 0;
                this.opt.nickMod++;
                this.send("NICK", this.opt.nick + this.opt.nickMod);
                this.nick = this.opt.nick + this.opt.nickMod;
                break;
            case "PING":
                this.send("PONG", message.args[0]);
                this.emit('ping', message.args[0]);
                break;
            case "NOTICE":
                var from = message.nick;
                var to   = message.args[0];
                if (!to) {
                    to   = null;
                }
                var text = message.args[1];
                if (text[0] === '\1' && text.lastIndexOf('\1') > 0) {
                    this._handleCTCP(from, to, text, 'notice');
                    break;
                }
                this.emit('notice', from, to, text, message);

                if ( this.opt.debug && to == this.nick )
                    console.log('GOT NOTICE from ' + (from?'"'+from+'"':'the server') + ': "' + text + '"');
                break;
            case "MODE":
                if ( this.opt.debug )
                    console.log("MODE:" + message.args[0] + " sets mode: " + message.args[1]);

                var channel = this.chanData(message.args[0]);
                if ( !channel ) break;
                var modeList = message.args[1].split('');
                var adding = true;
                var modeArgs = message.args.slice(2);
                modeList.forEach((mode) => {
                    if ( mode == '+' ) { adding = true; return; }
                    if ( mode == '-' ) { adding = false; return; }
                    if ( mode in this.prefixForMode ) {
                        // channel user modes
                        var user = modeArgs.shift();
                        if ( adding ) {
                            if ( channel.users[user].indexOf(this.prefixForMode[mode]) === -1 )
                                channel.users[user] += this.prefixForMode[mode];

                            this.emit('+mode', message.args[0], message.nick, mode, user, message);
                        }
                        else {
                            channel.users[user] = channel.users[user].replace(this.prefixForMode[mode], '');
                            this.emit('-mode', message.args[0], message.nick, mode, user, message);
                        }
                    }
                    else {
                        var modeArg;
                        // channel modes
                        if ( mode.match(/^[bkl]$/) ) {
                            modeArg = modeArgs.shift();
                            if ( modeArg.length === 0 )
                                modeArg = undefined;
                        }
                        // TODO - deal nicely with channel modes that take args
                        if ( adding ) {
                            if ( channel.mode.indexOf(mode) === -1 )
                                channel.mode += mode;

                            this.emit('+mode', message.args[0], message.nick, mode, modeArg, message);
                        }
                        else {
                            channel.mode = channel.mode.replace(mode, '');
                            this.emit('-mode', message.args[0], message.nick, mode, modeArg, message);
                        }
                    }
                });
                break;
            case "NICK":
                if ( message.nick == this.nick )
                // the user just changed their own nick
                    this.nick = message.args[0];

                if ( this.opt.debug )
                    console.log("NICK: " + message.nick + " changes nick to " + message.args[0]);

                var channels = [];

                // TODO better way of finding what channels a user is in?
                for ( var channame in this.chans ) {
                    var channel = this.chans[channame];
                    if ( 'string' == typeof channel.users[message.nick] ) {
                        channel.users[message.args[0]] = channel.users[message.nick];
                        delete channel.users[message.nick];
                        channels.push(channame);
                    }
                }

                // old nick, new nick, channels
                this.emit('nick', message.nick, message.args[0], channels, message);
                break;
            case "rpl_motdstart":
                this.motd = message.args[1] + "\n";
                break;
            case "rpl_motd":
                this.motd += message.args[1] + "\n";
                break;
            case "rpl_endofmotd":
            case "err_nomotd":
                this.motd += message.args[1] + "\n";
                this.emit('motd', this.motd);
                break;
            case "rpl_namreply":
                var channel = this.chanData(message.args[2]);
                var users = message.args[3].trim().split(/ +/);
                if ( channel ) {
                    users.forEach((user) => {
                        var match = user.match(/^(.)(.*)$/);
                        if ( match ) {
                            if ( match[1] in this.modeForPrefix ) {
                                channel.users[match[2]] = match[1];
                            }
                            else {
                                channel.users[match[1] + match[2]] = '';
                            }
                        }
                    });
                }
                break;
            case "rpl_endofnames":
                var channel = this.chanData(message.args[1]);
                if ( channel ) {
                    this.emit('names', message.args[1], channel.users);
                    this.emit('names' + message.args[1], channel.users);
                    this.send('MODE', message.args[1]);
                }
                break;
            case "rpl_topic":
                var channel = this.chanData(message.args[1]);
                if ( channel ) {
                    channel.topic = message.args[2];
                }
                break;
            case "rpl_away":
                this._addWhoisData(message.args[1], 'away', message.args[2], true);
                break;
            case "rpl_whoisuser":
                this._addWhoisData(message.args[1], 'user', message.args[2]);
                this._addWhoisData(message.args[1], 'host', message.args[3]);
                this._addWhoisData(message.args[1], 'realname', message.args[5]);
                break;
            case "rpl_whoisidle":
                this._addWhoisData(message.args[1], 'idle', message.args[2]);
                break;
            case "rpl_whoischannels":
                this._addWhoisData(message.args[1], 'channels', message.args[2].trim().split(/\s+/)); // TODO - clean this up?
                break;
            case "rpl_whoisserver":
                this._addWhoisData(message.args[1], 'server', message.args[2]);
                this._addWhoisData(message.args[1], 'serverinfo', message.args[3]);
                break;
            case "rpl_whoisoperator":
                this._addWhoisData(message.args[1], 'operator', message.args[2]);
                break;
            case "330": // rpl_whoisaccount?
                this._addWhoisData(message.args[1], 'account', message.args[2]);
                this._addWhoisData(message.args[1], 'accountinfo', message.args[3]);
                break;
            case "rpl_endofwhois":
                this.emit('whois', this._clearWhoisData(message.args[1]));
                break;
            case "rpl_liststart":
                this.channellist = [];
                this.emit('channellist_start');
                break;
            case "rpl_list":
                var channel = {
                    name: message.args[1],
                    users: message.args[2],
                    topic: message.args[3]
                };
                this.emit('channellist_item', channel);
                this.channellist.push(channel);
                break;
            case "rpl_listend":
                this.emit('channellist', this.channellist);
                break;
            case "333":
                // TODO emit?
                var channel = this.chanData(message.args[1]);
                if ( channel ) {
                    channel.topicBy = message.args[2];
                    // channel, topic, nick
                    this.emit('topic', message.args[1], channel.topic, channel.topicBy, message);
                }
                break;
            case "TOPIC":
                // channel, topic, nick
                this.emit('topic', message.args[0], message.args[1], message.nick, message);

                var channel = this.chanData(message.args[0]);
                if ( channel ) {
                    channel.topic = message.args[1];
                    channel.topicBy = message.nick;
                }
                break;
            case "rpl_channelmodeis":
                var channel = this.chanData(message.args[1]);
                if ( channel ) {
                    channel.mode = message.args[2];
                }
                break;
            case "329":
                var channel = this.chanData(message.args[1]);
                if ( channel ) {
                    channel.created = message.args[2];
                }
                break;
            case "JOIN":
                // channel, who
                if ( this.nick == message.nick ) {
                    this.chanData(message.args[0], true);
                }
                else {
                    var channel = this.chanData(message.args[0]);
                    channel.users[message.nick] = '';
                }
                this.emit('join', message.args[0], message.nick, message);
                this.emit('join' + message.args[0], message.nick, message);
                if ( message.args[0] != message.args[0].toLowerCase() ) {
                    this.emit('join' + message.args[0].toLowerCase(), message.nick, message);
                }
                break;
            case "PART":
                // channel, who, reason
                this.emit('part', message.args[0], message.nick, message.args[1], message);
                this.emit('part' + message.args[0], message.nick, message.args[1], message);
                if ( message.args[0] != message.args[0].toLowerCase() ) {
                    this.emit('part' + message.args[0].toLowerCase(), message.nick, message.args[1], message);
                }
                if ( this.nick == message.nick ) {
                    var channel = this.chanData(message.args[0]);
                    delete this.chans[channel.key];
                }
                else {
                    var channel = this.chanData(message.args[0]);
                    delete channel.users[message.nick];
                }
                break;
            case "KICK":
                // channel, who, by, reason
                this.emit('kick', message.args[0], message.args[1], message.nick, message.args[2], message);
                this.emit('kick' + message.args[0], message.args[1], message.nick, message.args[2], message);
                if ( message.args[0] != message.args[0].toLowerCase() ) {
                    this.emit('kick' + message.args[0].toLowerCase(), message.args[1], message.nick, message.args[2], message);
                }

                if ( this.nick == message.args[1] ) {
                    var channel = this.chanData(message.args[0]);
                    delete this.chans[channel.key];
                }
                else {
                    var channel = this.chanData(message.args[0]);
                    delete channel.users[message.args[1]];
                }
                break;
            case "KILL":
                var nick = message.args[0];
                var channels = [];
                for ( var channel in this.chans ) {
                    if ( this.chans[channel].users[nick])
                        channels.push(channel);

                    delete this.chans[channel].users[nick];
                }
                this.emit('kill', nick, message.args[1], channels, message);
                break;
            case "PRIVMSG":
                var from = message.nick;
                var to   = message.args[0];
                var text = message.args[1];
                if (text[0] === '\1' && text.lastIndexOf('\1') > 0) {
                    this._handleCTCP(from, to, text, 'privmsg');
                    break;
                }
                this.emit('message', from, to, text, message);
                if ( this.supported.channel.types.indexOf(to.charAt(0)) !== -1 ) {
                    this.emit('message#', from, to, text, message);
                    this.emit('message' + to, from, text, message);
                    if ( to != to.toLowerCase() ) {
                        this.emit('message' + to.toLowerCase(), from, text, message);
                    }
                }
                if ( to == this.nick ) this.emit('pm', from, text, message);

                if ( this.opt.debug && to == this.nick )
                    console.log('GOT MESSAGE from ' + from + ': ' + text);
                break;
            case "INVITE":
                var from = message.nick;
                var to   = message.args[0];
                var channel = message.args[1];
                this.emit('invite', channel, from, message);
                break;
            case "QUIT":
                if ( this.opt.debug )
                    console.log("QUIT: " + message.prefix + " " + message.args.join(" "));
                if ( this.nick == message.nick ) {
                    // TODO handle?
                    break;
                }
                // handle other people quitting

                var channels = [];

                // TODO better way of finding what channels a user is in?
                var channelObj;
                for ( var channame in this.chans ) {
                    channelObj = this.chans[channame];
                    if ( 'string' == typeof channelObj.users[message.nick] ) {
                        delete channelObj.users[message.nick];
                        channels.push(channame);
                    }
                }

                // who, reason, channels
                this.emit('quit', message.nick, message.args[0], channels, message);
                break;
            case "err_umodeunknownflag":
                if ( this.opt.showErrors )
                    console.log("\033[01;31mERROR: ", message, "\033[0m");
                break;
            default:
                if ( message.commandType == 'error' ) {
                    this.emit('error', message);
                    if ( this.opt.showErrors )
                        console.log("\033[01;31mERROR: ", message, "\033[0m");
                }
                else {
                    if ( this.opt.debug )
                        console.log("\033[01;31mUnhandled message: ", message, "\033[0m");
                }
                break;
            }
        });

        this.addListener('kick', (channel, who, by, reason) => {
            if ( this.opt.autoRejoin )
                this.send.apply(this, ['JOIN'].concat(channel.split(' ')));
        });
        this.addListener('motd', (motd) => {
            this.opt.channels.forEach((channel) => {
                this.send.apply(this, ['JOIN'].concat(channel.split(' ')));
            });
        });
    }

    chanData (name: string, create?: bool) {
        var key = name.toLowerCase();
        if (create) {
            this.chans[key] = this.chans[key] || {
                key:        key,
                serverName: name,
                users:      {},
                mode:       ''
            };
        }
        return this.chans[key];
    }

    connect(retryCount?: number) {
        retryCount = retryCount || 0;

        this.chans = {};
        var scheme = (this.opt.secure) ? 'wss://' : 'ws://';
        var url = scheme + this.opt.bridge + '/' +
                  encodeURI(this.opt.server) + ':' + this.opt.port;

        // try to connect to the server
        this.conn = new WebSocket(url);

        this.conn.addEventListener("open", () => {
            if (this.opt.password !== null) {
                this.send("PASS", this.opt.password);
            }
            this.send("NICK", this.opt.nick);
            this.nick = this.opt.nick;
            this.send("USER", this.opt.userName, 8, "*", this.opt.realName);
            this.emit("connect");
        });
        this.conn.addEventListener("message", (evt) => {
            var message = parseMessage(evt.data, this.opt.stripColors);

            try {
                this.emit('raw', message);
            } catch (err) {
                if (this.conn.readyState !== WebSocket.CLOSING) {
                    throw err;
                }
            }
        });
        this.conn.addEventListener("close", (evt) => {
            if (this.opt.debug)
                console.log('Connection got "close" event');
            if (evt.wasClean)
                return;  // self disconnect

            if (this.opt.debug)
                console.log('Disconnected: reconnecting');
            if (this.opt.retryCount !== null && retryCount >= this.opt.retryCount) {
                if (this.opt.debug) {
                    console.log('Maximum retry count (' + this.opt.retryCount + ') reached. Aborting');
                }
                this.emit('abort', this.opt.retryCount);
                return;
            }

            if (this.opt.debug) {
                console.log('Waiting ' + this.opt.retryDelay + 'ms before retrying');
            }
            setTimeout(() => {
                this.connect(retryCount + 1);
            }, this.opt.retryDelay);
        });
        this.conn.addEventListener("error", (exception) => {
            this.emit("netError", exception);
        });
    }

    disconnect (message) {
        message = message || "browsIRC says goodbye";

        if (this.conn.readyState === WebSocket.OPEN) {
            this.send("QUIT", message);
        }
        this.conn.close();
    }

    send (command, ...args:any[]) {
        var args = Array.prototype.slice.call(arguments);

        // Note that the command arg is included in the args array as the first element

        if (args[args.length - 1].match(/\s/) || args[args.length - 1].match(/^:/) || args[args.length - 1] === "") {
            args[args.length - 1] = ":" + args[args.length - 1];
        }

        if (this.opt.debug)
            console.log('SEND: ' + args.join(" "));

        if (this.conn.readyState === WebSocket.OPEN) {
            this.conn.send(args.join(" "));
        }
    }

    activateFloodProtection(interval?: number) {
        var cmdQueue = [],
            safeInterval = interval || this.opt.floodProtectionDelay,
            origSend = this.send,
            dequeue;

        // Wrapper for the original function. Just put everything to on central
        // queue.
        this.send = () => {
            cmdQueue.push(arguments);
        };

        dequeue = () => {
            var args = cmdQueue.shift();
            if (args) {
                origSend.apply(this, args);
            }
        };

        // Slowly unpack the queue without flooding.
        setInterval(dequeue, safeInterval);
        dequeue();
    }

    join (channel, callback) {
        this.once('join' + channel, () => {
            // if join is successful, add this channel to opts.channels
            // so that it will be re-joined upon reconnect (as channels
            // specified in options are)
            if (this.opt.channels.indexOf(channel) == -1) {
                this.opt.channels.push(channel);
            }

            if (typeof(callback) == 'function') {
                return callback.apply(this, arguments);
            }
        });
        this.send.apply(this, ['JOIN'].concat(channel.split(' ')));
    }

    part (channel, callback) {
        if (typeof(callback) == 'function') {
            this.once('part' + channel, callback);
        }

        // remove this channel from this.opt.channels so we won't rejoin
        // upon reconnect
        if (this.opt.channels.indexOf(channel) != -1) {
            this.opt.channels.splice(this.opt.channels.indexOf(channel), 1);
        }

        this.send('PART', channel);
    }

    say (target, text) {
        if (typeof text !== 'undefined') {
            text.toString().split(/\r?\n/).filter((line) => {
                return line.length > 0;
            }).forEach((line) => {
                    var messagePart;
                    var r = new RegExp(".{1," + this.opt.messageSplit + "}", "g");
                    while ((messagePart = r.exec(line)) != null) {
                        this.send('PRIVMSG', target, messagePart[0]);
                        this.emit('thisMessage', target, messagePart[0]);
                    }
                });
        }
    }

    action (channel, text) {
        if (typeof text !== 'undefined') {
            text.toString().split(/\r?\n/).filter((line) => {
                return line.length > 0;
            }).forEach((line) => {
                    this.say(channel, '\u0001ACTION ' + line + '\u0001');
                });
        }
    }

    notice (target, text) {
        this.send('NOTICE', target, text);
    }

    whois (nick, callback) {
        if (typeof callback === 'function') {
            var callbackWrapper = (info) => {
                if (info.nick == nick) {
                    this.removeListener('whois', callbackWrapper);
                    return callback.apply(this, arguments);
                }
            };
            this.addListener('whois', callbackWrapper);
        }
        this.send('WHOIS', nick);
    }

    list () {
        var args = Array.prototype.slice.call(arguments, 0);
        args.unshift('LIST');
        this.send.apply(this, args);
    }

    _addWhoisData (nick: string, key: string, value: string, onlyIfExists?: bool) {
        if (onlyIfExists && !this._whoisData[nick]) return;
        this._whoisData[nick] = this._whoisData[nick] || {nick: nick};
        this._whoisData[nick][key] = value;
    }

    _clearWhoisData (nick) {
        // Ensure that at least the nick exists before trying to return
        this._addWhoisData(nick, 'nick', nick);
        var data = this._whoisData[nick];
        delete this._whoisData[nick];
        return data;
    }

    _handleCTCP (from, to, text: string, type: string) {
        text = text.slice(1);
        text = text.slice(0, text.indexOf('\1'));
        var parts = text.split(' ');
        this.emit('ctcp', from, to, text, type);
        this.emit('ctcp-' + type, from, to, text);
        if (type === 'privmsg' && text === 'VERSION')
            this.emit('ctcp-version', from, to);
        if (parts[0] === 'ACTION' && parts.length > 1)
            this.emit('action', from, to, parts.slice(1).join(' '));
        if (parts[0] === 'PING' && type === 'privmsg' && parts.length > 1)
            this.ctcp(from, 'notice', text);
    }

    ctcp(to, type, text) {
        return this[type === 'privmsg' ? 'say' : 'notice'](to, '\1' + text + '\1');
    }
}

/*
 * parseMessage(line, stripColors)
 *
 * takes a raw "line" from the IRC server and turns it into an object with
 * useful keys
 */
export function parseMessage(line: string, stripColors: bool): Message {
    var message: Message = {
        command: null,
        rawCommand: null,
        commandType: null,
        args: []
    };
    var match;

    if (stripColors) {
        line = line.replace(/[\x02\x1f\x16\x0f]|\x03\d{0,2}(?:,\d{0,2})?/g, "");
    }

    // Parse prefix
    if ( match = line.match(/^:([^ ]+) +/) ) {
        message.prefix = match[1];
        line = line.replace(/^:[^ ]+ +/, '');
        if ( match = message.prefix.match(/^([_a-zA-Z0-9\[\]\\`^{}|-]*)(!([^@]+)@(.*))?$/) ) {
            message.nick = match[1];
            message.user = match[3];
            message.host = match[4];
        }
        else {
            message.server = message.prefix;
        }
    }

    // Parse command
    match = line.match(/^([^ ]+) */);
    message.command = match[1];
    message.rawCommand = match[1];
    message.commandType = 'normal';
    line = line.replace(/^[^ ]+ +/, '');

    if ( codes[message.rawCommand] ) {
        message.command     = codes[message.rawCommand].name;
        message.commandType = codes[message.rawCommand].type;
    }

    var middle, trailing;

    // Parse parameters
    if ( line.search(/^:|\s+:/) != -1 ) {
        match = line.match(/(.*?)(?:^:|\s+:)(.*)/);
        middle = match[1].trimRight();
        trailing = match[2];
    }
    else {
        middle = line;
    }

    if ( middle.length )
        message.args = middle.split(/ +/);

    if ( typeof(trailing) != 'undefined' && trailing.length )
        message.args.push(trailing);

    return message;
}
