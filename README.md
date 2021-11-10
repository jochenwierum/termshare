# Termshare

Share your terminal session over the web.

## Why?

I once gave a presentation in reveal.js and shared my slides over the web. I searched for a way to include a console in
the presentation. While it was easy on the presenter side (there were tools like [ttyd](https://github.com/tsl0922/ttyd)
or [butterfly.py](https://github.com/paradoxxxzero/butterfly)), I did not find a satisfying solution to share the
content in a save and read only way over the web.

So I started my own little hobby project for this problem :)

## Introducing Termshare

Termshare is a nodejs project that takes a console application as an input. The application is either started directly
in the terminal or exposed via web interface. The output of the running application is mirrored to a separate web
interface. There are multiple configurations possible.

## Termshare Modes

Termshare can operate in multiple modes:

### Mode: combined, Input: console

This is the simplest case which is the default if no arguments are provided

```text
  +------------------------------------------+       +-----------------------------------+
  | termshare -m combined -i console         |  <--  | Webbrowser: http://127.0.0.1:8080 |
  |                                          |       +-----------------------------------+
  |  +-------------------------------------+ |
  |  | bash (subprocess, attached to tty)  | |       +-----------------------------------+
  |  +-------------------------------------+ |  <--  | Webbrowser: http://public-ip:8080 |
  |                                          |       +-----------------------------------+
  | bound socket to 0.0.0.0:8080             |
  +------------------------------------------+ 
```

### Mode: combined, Input: web

The input can also be a browser session. Termshare listens on 127.0.0.1 by default.

```text
  +---------------------------------+       +-----------------------------------+
  | termshare -m combined -i web    |  <--  | Webbrowser: http://127.0.0.1:8081 |
  |                                 |       +-----------------------------------+
  |  +--------------------+         |
  |  | bash (subprocess)  |         |       +-----------------------------------+
  |  +--------------------+         |  <--  | Webbrowser: http://127.0.0.1:8080 |
  |                                 |       +-----------------------------------+ 
  | bound socket to   0.0.0.0:8080  |
  | bound socket to 127.0.0.1:8081  |       +-----------------------------------+
  +---------------------------------+  <--  | Webbrowser: http://public-ip:8080 |  
                                            +-----------------------------------+
```

### Mode: presenter/repeater, Input: console

It is also possible to forward the input to a dedicated 'repeater'. The repeater can host multiple sessions. Each
session must have a unique session name (`-s`). The audience must also append the session name to the url.

Termshare does not secure any of its http connection. It is recommended secure the repeater connection (e.g. by using a
SSH tunnel).

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
  
  +--------------------------------+       +--------------------------------------------+
  | termshare -m repeater          |  <--  | Webbrowser: http://public-ip:8080/session1 |
  |                                |       +--------------------------------------------+
  |                                | 
  | bound socket to   0.0.0.0:8080 |       +--------------------------------------------+
  | bound socket to 127.0.0.1:8082 |  <--  | Webbrowser: http://public-ip:8080/session1 |
  +--------------------------------+       +--------------------------------------------+
```

### Mode: presenter/repeater, Input: web

```text
  +-------------------------------------------+       +-----------------------------------+
  | termshare -m presenter -i web -s session1 |  <--  | Webbrowser: http://127.0.0.1:8081 |
  |                                           |       +-----------------------------------+
  |  +--------------------+                   |
  |  | bash (subprocess)  |                   |
  |  +--------------------+                   |
  |                                           |
  | bound socket to 127.0.0.1:8081            |
  +-------------------------------------------+
  
                      |
                      |  (e.g. ssh -L 8082:127.0.0.1:8082 -N)
                      v
  
  +--------------------------------+       +--------------------------------------------+
  | termshare -m repeater          |  <--  | Webbrowser: http://public-ip:8080/session1 |
  |                                |       +--------------------------------------------+
  |                                | 
  | bound socket to   0.0.0.0:8080 |       +--------------------------------------------+
  | bound socket to 127.0.0.1:8082 |  <--  | Webbrowser: http://public-ip:8080/session1 |
  +--------------------------------+       +--------------------------------------------+
```

## Configuration Parameters

In addition to `--mode` and `--presenter-input`, the following tweaks are possible:

| Parameter | Short | Environment variable | Possible values | Description |
|-----------|-------|----------------------|-----------------|-------------|
| `--help` | `-h` | | | Shows the help |
| `--mode` | `-m` | `TERMSHARE_MODE` | `combined`, `presenter` or `repeater` | The mode (see above) |
| `--presenter-input` | `-i` | `TERMSHARE_PRESENTER_INPUT` | `console` or `web` | The input (see above) |
| `--custom-css-dir` | `-c` | `TERMSHARE_CSS_DIR` | directory | a directory which must contain a `custom.css`, can be used to define additional `@font-face`s. |
| `--font-family` | `-f` | `TERMSHARE_FONT_FAMILY` | string | font family used in the webbrowser, may be defined in `custom.css` |
| `--kill-signal` | `-k` | `TERMSHARE_KILL_SIGNAL` | signal-name | signal used to kill the embedded process (default: `SIGHUP`) |
| `--presenter-session` | `-s` | `TERMSHARE_PRESENTER_SESSION` | string | name of the session in presenter mode (see above) |
| `--decoration` | `-d` | `TERMSHARE_DECORATION` | - | Draw a decoration in the webbrowser (xtitle) |
| `--presenter-width` | `-w` | `TERMSHARE_PRESENTER_WIDTH` | integer | Use a fixed width for the input |
| `--presenter-height` | `-h` | `TERMSHARE_PRESENTER_HEIGHT` | integer | Use a fixed height for the input |
| `--repeater-server` | `-r` | `TERMSHARE_REPEATER_SERVER` | address | Server to connect to in presenter mode (default: `127.0.0.1:8082`) |
| `--audience-bind` | `-a` | `TERMSHARE_AUDIENCE_BIND` | bind-address | Address to bind the audience port to (default: `0.0.0.0:8080`) |
| `--presenter-bind` | `-b` | `TERMSHARE_PRESENTER_BIND` | bind-address | Address to bind the presenter port to (default: `0.0.0.0:8081`) | 
| `--repeater-bind` | `-p` | `TERMSHARE_REPEATER_BIND` | bind-address | Address to bind the repeater port to (default: `127.0.0.1:8082`) |
| `--debug` | | | - | Logs messages in debug mode |

## Running in Docker

It is also possible to start termshare in Docker. This is only useful for the repeater.
Therefore, the Docker file has different defaults:

| Name | Value |
|------|-------|
| `--mode` | `repeater` |
| `--repeater-bind` | `0.0.0.0:8082` |
