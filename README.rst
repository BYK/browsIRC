browsIRC is an IRC client library written in TypeScript_ for modern browsers.
It is based on the awesome `node-irc`_ library.

It uses a direct WebSocket-to-IRC bridge such as irc2ws_

.. _TypeScript: http://typescriptlang.org
.. _`node-irc`: http://node-irc.readthedocs.org/
.. _irc2ws: https://github.com/BYK/irc2ws


You can access more detailed documentation for this module at `Read the Docs`_


Building
-------------

Simply run `make build` or `tsc "@compileopts"` to build the library. It has two
modules and an external module, EventEmitter_ for browsers, and uses the AMD_
module system.

.. _EventEmitter: https://github.com/creationix/eventemitter-browser
.. _AMD: https://github.com/cujojs/curl#what-is-amd

Basic Usage
-------------

This library provides basic IRC client functionality. In the simplest case you
can connect to an IRC server like so::

    curl('irc', function (irc) {
        var client = new irc.Client('irc2.ws:1988', 'irc.freenode.com', 'myNick', {
            channels: ['#blah']
        });
    });

Of course it's not much use once it's connected if that's all you have!

The client emits a large number of events that correlate to things you'd
normally see in your favourite IRC client. Most likely the first one you'll want
to use is::

    client.addListener('message', function (from, to, message) {
        console.log(from + ' => ' + to + ': ' + message);
    });

or if you're only interested in messages to the bot itself::

    client.addListener('pm', function (from, message) {
        console.log(from + ' => ME: ' + message);
    });

or to a particular channel::

    client.addListener('message#yourchannel', function (from, message) {
        console.log(from + ' => #yourchannel: ' + message);
    });

At the moment there are functions for joining::

    client.join('#yourchannel yourpass');

parting::

    client.part('#yourchannel');

talking::

    client.say('#yourchannel', "I'm a bot!");
    client.say('nonbeliever', "SRSLY, I AM!");

and many others. Check out the API documentation for a complete reference.

For any commands that there aren't methods for you can use the send() method
which sends raw messages to the server::

    client.send('MODE', '#yourchannel', '+o', 'yournick');


Further Documentation
-----------------------

The API is exactly the same with node-irc and you can find the full reference
available in reStructuredText format in the docs/ folder of this project, or
online at `Read the Docs`_.

.. _`Read the Docs`: http://readthedocs.org/docs/node-irc/en/latest/
