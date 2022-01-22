# Termshare

Share your terminal session over the web.


## Why?

I once gave a presentation in [reveal.js](https://revealjs.com/) and [shared my slides over the web](https://github.com/cologneintelligence/reveal.js-remote).
I was looking for a way to include a console in the presentation which I could reuse in several slides.
While it was easy on the presenter side (there were tools like [ttyd](https://github.com/tsl0922/ttyd),
[GoTTY](https://golangrepo.com/repo/sorenisanerd-gotty-go-web-applications) or
[butterfly.py](https://github.com/paradoxxxzero/butterfly)), I did not find a satisfying solution to share the
content in a safe and read only way over some kind of repeater to the web.

So I started my own little hobby project for this problem :)


## Introducing Termshare

Termshare is a node.js project that takes a console application as a parameter.
The application is either started directly in the terminal or exposed via web interface to be included in presentations (or wherever you like).
The output of the running application is mirrored to a separate web interface in a read-only way.
Optionally, a repeater component can be used as a broadcaster (see Modes below).
There are multiple configurations possible:


## Termshare Modes

Termshare can operate in multiple modes:


### Mode: combined, Input: console

This is the simplest case which is the default if no arguments are provided:

```text
+-----------------------------------------+     +-----------------------+
| termshare -m combined -i console myapp  | <-- | Webbrowser:           |
|                                         |     | http://127.0.0.1:8080 |
|  +-----------------------------------+  |     +-----------------------+
|  | myapp                             |  |
|  | (subprocess, attached to tty)     |  |     +-----------------------+
|  +-----------------------------------+  | <-- | Webbrowser:           |
|                                         |     | http://public-ip:8080 |
| listening on socket:                    |     +-----------------------+
| 0.0.0.0:8080                            |
+-----------------------------------------+
```

The mode (`-m`) `combined` means that the provided app is started locally.
The listeners connect to the same process via port 8080 (the „audience port)“.
The port can be configured (`-a` or `--audience-bind`), see below.
The application runs locally in the terminal that invoked `termshare` (`-i console`).

The same setup can be achieved by just invoking `termshare myapp` or even `termshare`:
in this case, termshare starts the shell that's specified in the `$SHELL` environment variable.

### Mode: combined, Input: web

The input can also be a browser session. Termshare listens on 127.0.0.1:8081 by default.

```text
                                           +-----------------------+
+------------------------------------+     | Webbrowser:           |
| termshare -m combined -i web myapp | <-- | http://127.0.0.1:8081 |
|                                    |     +-----------------------+
|  +--------------------+            |
|  | myapp (subprocess) |            |     +-----------------------+
|  +--------------------+            | <-- | Webbrowser:           |
|                                    |     | http://127.0.0.1:8080 |
| listening on sockets:              |     +-----------------------+
|   0.0.0.0:8080                     |
| 127.0.0.1:8081                     | <-- +-----------------------+
+------------------------------------+     | Webbrowser:           |
                                           | http://public-ip:8080 |
                                           +-----------------------+
```

Here, the app is exposed on two ports. The first port (8080) works like the example above.
The second port (8081, the „presenter port“) gives write access to the application
I.e. this address can be embedded in an iframe.

Multiple clients can connect to the presenter port. But only one client has write access.
This client also controls the size of the terminal window.


### Mode: presenter/repeater, Input: console

It is also possible to forward the input to a dedicated „repeater“. The repeater can host multiple sessions at the same time.
Each session must have a unique session name (`-s` or `--presenter-session`).
The audience must also append this session name to the url.

Termshare does not secure any of its http connections!
It is recommended to secure at least the access to the repeater connection (e.g. by using an SSH tunnel).

```text
+-----------------------------------------------+
| termshare -m presenter -i console -s session1 |
|                                               |
|  +-------------------------------------+      |
|  | bash (subprocess, attached to tty)  |      |
|  +-------------------------------------+      |
+-----------------------------------------------+

             |
             |  (e.g. ssh -L 8082:127.0.0.1:8082 -N)
             v

+--------------------------+     +--------------------------------+
| termshare -m repeater    | <-- | Webbrowser:                    |
|                          |     | http://public-ip:8080/session1 |
| listening on sockets:    |     +--------------------------------+
|   0.0.0.0:8080           |
| 127.0.0.1:8082           | <-- +--------------------------------+
+--------------------------+     | Webbrowser:                    |
                                 | http://public-ip:8080/session1 |
                                 +--------------------------------+
```

Here, termshare runs in two different modes (in contrast to the `combined` mode above): presenter and repeater.
The repeater's address can be provided with the parameter (`-r` or `--repeater-server`).
By default, it assumes some kind of tunnel like the ssh scenario above and connects to 127.0.0.1:8082.


### Mode: presenter/repeater, Input: web

```text
+---------------------------------------+     +-----------------------+
| termshare -m presenter -i web -s demo | <-- | Webbrowser:           |
|                                       |     | http://127.0.0.1:8081 |
|  +--------------------+               |     +-----------------------+
|  | bash (subprocess)  |               |
|  +--------------------+               |
|                                       |
| bound socket to 127.0.0.1:8081        |
+---------------------------------------+

             |
             |  (e.g. ssh -L 8082:127.0.0.1:8082 -N)
             v

+--------------------------------+     +----------------------------+
| termshare -m repeater          | <-- | Webbrowser:                |
|                                |     | http://public-ip:8080/demo |
| listening on sockets:          |     +----------------------------+
|   0.0.0.0:8080                 |
| 127.0.0.1:8082                 | <-- +----------------------------+
+--------------------------------+     | Webbrowser:                |
                                       | http://public-ip:8080/demo |
                                       +----------------------------+
```

This configuration combines the web input with the repeater.

## Configuration Parameters

In addition to `--mode` and `--presenter-input`, the following tweaks are possible:

| Parameter             | Short | Environment variable          | Possible values                       | Description                                                                                    |
|-----------------------|-------|-------------------------------|---------------------------------------|------------------------------------------------------------------------------------------------|
| `--help`              | `-h`  | -                             | -                                     | Shows the help                                                                                 |
| `--mode`              | `-m`  | `TERMSHARE_MODE`              | `combined`, `presenter` or `repeater` | The mode (see above)                                                                           |
| `--presenter-input`   | `-i`  | `TERMSHARE_PRESENTER_INPUT`   | `console` or `web`                    | The input (see above)                                                                          |
| `--custom-css-dir`    | `-c`  | `TERMSHARE_CSS_DIR`           | directory                             | a directory which must contain a `custom.css`, can be used to define additional `@font-face`s. |
| `--font-family`       | `-f`  | `TERMSHARE_FONT_FAMILY`       | string                                | font family used in the webbrowser, may be defined in `custom.css`                             |
| `--kill-signal`       | `-k`  | `TERMSHARE_KILL_SIGNAL`       | signal-name                           | signal used to kill the embedded process (default: `SIGHUP`)                                   |
| `--presenter-session` | `-s`  | `TERMSHARE_PRESENTER_SESSION` | string                                | name of the session in presenter mode (see above)                                              |
| `--decoration`        | `-d`  | `TERMSHARE_DECORATION`        | -                                     | Draw a decoration in the webbrowser (xtitle)                                                   |
| `--presenter-width`   | `-w`  | `TERMSHARE_PRESENTER_WIDTH`   | integer                               | Use a fixed width for the input                                                                |
| `--presenter-height`  | `-h`  | `TERMSHARE_PRESENTER_HEIGHT`  | integer                               | Use a fixed height for the input                                                               |
| `--repeater-server`   | `-r`  | `TERMSHARE_REPEATER_SERVER`   | address                               | Server to connect to in presenter mode (default: `127.0.0.1:8082`)                             |
| `--presenter-bind`    | `-p`  | `TERMSHARE_PRESENTER_BIND`    | bind-address                          | Address to bind the presenter port to (default: `0.0.0.0:8081`)                                |
| `--audience-bind`     | `-a`  | `TERMSHARE_AUDIENCE_BIND`     | bind-address                          | Address to bind the audience port to (default: `0.0.0.0:8080`)                                 |
| `--repeater-bind`     | `-R`  | `TERMSHARE_REPEATER_BIND`     | bind-address                          | Address to bind the repeater port to (default: `127.0.0.1:8082`)                               |
| `--debug`             |       | -                             | -                                     | Logs messages in debug mode                                                                    |


## Running in Docker

It is also possible to start termshare in Docker. This is only useful for the repeater.
Therefore, the Docker file has different defaults:

| Name              | Value          |
|-------------------|----------------|
| `--mode`          | `repeater`     |
| `--repeater-bind` | `0.0.0.0:8082` |


## How to build this software?

1. Checkout
2. Run `npm run install-all` to download all npm dependencies.
3. Run `npm run build` to compile the software.
4. Run `npm link` to create a link to `termshare` in `$PATH`.
5. `termshare` is now available!

## Why is this even complicated?

Mirroring a terminal is not as easy as it seems.
At lest not, if you don't want to replay the full session everytime a new client connects.

Terminal applications use a variety of [ansi sequences codes](https://en.wikipedia.org/wiki/ANSI_escape_code).
Some of them are poorly documented.
These codes are mostly used to control the output.
Very common sequences change the text color, move the cursor or clean the screen.
But there are more codes than that. Some hide the cursor, switch to an alternate display
(that's what `less` or `vim` are typically doing), set scrolling regions,
tell the terminal to interact with the mouse or the numpad, etc.

If a client connects in the middle of a session, we could just send everything that he missed so far. It would work.
However, this is not a good idea, especially for long sessions. What we need instead is some kind of "screenshot"
together with a dump of the internal state (for example the current scrolling regions).

The bad news is, that there is no way to create such dump.
The state of the terminal is implemented in your terminal applications and there is no proper way to export that state.
Even worse, such an export functionality would not be portable.
Some tools like screen or tmux have to rebuild the state, if a new client connects.
But they don't have an API to export that state either.

So the only way to solve this problem is to wrap the [PTY](https://en.wikipedia.org/wiki/Pseudoterminal)
of the invoked command and keep track of the current state on our own.
Whenever a new client connects, we can derive the current state.
This sounds easy, but the number of ansi sequences is really huge, not every sequence is documented and
handling unicode in a terminal is not funny either.

The best solution I found was [xterm.js](https://xtermjs.org/).
It's [serialize addon](https://github.com/xtermjs/xterm.js/tree/master/addons/xterm-addon-serialize) isn't complete,
but it is the best solution I could find.
It exports the currently visible screen and the most important terminal state.
However, a big portion of the state (like the mouse interaction) is not exported yet.
But for most use cases, it is still perfect!
And it is a *much* better solution than I am able to write myself (believe me, I tried!).

On the serverside, termshare uses xterm.js headless to simulate a virtual terminal.
Whenever a client connects, the terminal is serialized and sent to the client.
This includes the currently visible content of the screen and some state.
The clients also use xterm.js in the browser to render the terminal.
All following changes are pushed to the client as they happen.
