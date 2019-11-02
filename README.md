# Moebius - A Modern ANSI & ASCII Art Editor
    
**Official website:** http://www.andyh.org/moebius/

- [Introduction](#introduction)
- [Info: Installing from Source](#info-installing-from-source)
- [Download Packages and Executables](#download-packages-and-executables)
- [Documentation](#documentation)
- [Acknowledgements](#acknowledgements)


# Introduction:
    
**Moebius** is a new, cross-platform and fully [FOSS](https://en.wikipedia.org/wiki/Free_and_open-source_software) ANSI Editor for Linux, MacOS, and Windows. 
    
The major feature that differentiates *Moebius* from [PabloDraw](https://github.com/blocktronics/pablodraw) is the 'half-block' brush which allows editing in a style closer to Photoshop than a text editor, although you can still use the function and cursor keys to draw with, and you should find that most of the text editing features from PD are carried over to this editor.
    
The editor is still a work in progress, but anyone who wants to try using it is also encouraged to log [feature requests and bugs](https://github.com/blocktronics/moebius/issues) on the project's GitHub page.

Moebius uses a modified version of Google's Material Icons. https://material.io/icons/    


# Info: Installing from Source

## To build and install Moebius from source

### Prerequisites

We're assuming an installation for GNU/Linux. This has been tested on Debian Buster and Bullseye, but should work on most
Modern Linux distros, BSD flavors, and other Unices such as Solaris or SCO UNIX.

The first thing is to make sure that a Node Package Manager for JavaScript has been installed, such as [Yarn](https://github.com/yarnpkg/yarn/) or
[Entropic](https://github.com/entropic-dev/entropic). We're going to use [npm](https://github.com/npm/cli) here.

We also need to ensure that a current verision of _Node.js_ (Node) is installed.

* First, check to see if npm is installed:

```
$ which npm
/usr/bin/npm
```
If nothing was returned, we need to install npm.

* As root, install npm _and other source build deps_ by issuing the following:

```
# apt-get -y install npm curl build-essentials
```

* Now to check for Node and it's version:

```
$ which node
/usr/bin/node
$ node --version
v10.15.2
```
This version of Node.js is too old for us, and the Moebius build will complain about it.
If node was NOT already installed, then once again, as root, issue `apt-get -y install nodejs` (a/o 01 NOV 2019, npm
will still complain about the version of _nodejs_ installed from the default Debian repos); otherwise, and because
there may be other users on your system using the particular system-wide version of Node.js that is installed, we
will install the latest version using [nvm](https://github.com/nvm-sh/nvm):

```
$ cd ~
$ curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.0/install.sh | bash
```
You will now be prompted to run the following (You may cut & paste it):

```
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
```

Now we will install the latest LTS version of _Node.js_ (a/o 01 NOV 2019)

```
$ nvm current
system
$ nvm install 12.13.0
Downloading and installing node v12.13.0...
Downloading https://nodejs.org/dist/v12.13.0/node-v12.13.0-linux-x64.tar.xz...
####################################################################### 100.0%
Computing checksum with sha256sum
Checksums matched!
Now using node v12.13.0 (npm v6.12.0)
Creating default alias: default -> 12.13.0 (-> v12.13.0)
$ nvm current
v12.13.0
```
**Note:** We first checked the current default, which reports _system_, aka version 10.15.2 in our
particular circumstance. Then we installed 12.13.0 and nvm defaults to using the most recently
installed version, which was verified in that last command of `nvm current`.

**Note:** With this, the most flexibile setup, you will not (under normal circumstances) be able
to run _node_ on a port number below 1024. Also, you will probably want to run node in conjunction
with the Apache, Caddy, or Nginx HTTP (web) servers acting as proxy servers for _node_, which is
beyond the scope of this document, but the following at [StackOverflow will show you how](https://stackoverflow.com/questions/5009324/node-js-nginx-what-now)


### Clone, Build, and run *Moebius* on Debian GNU/Linux:

* Having met our prerequisites for Node.js and npm, let's clone the git repo into our project folder and install *Moebius*:

```
$ mkdir -pv ~/projects
$ cd ~/projects
$ git clone git@github.com:blocktronics/moebius.git
$ cd moebius
$ npm install
$ npm start
```


# Download Packages and Executables:

Several binaries and packages are available for download enabling you to merely install for your OS and run *Moebius*.

* Linux - [Debian Package](http://www.andyh.org/moebius/M%C5%93bius.deb) as a .deb package file
* OS X - [Apple MacOS X Package](http://www.andyh.org/moebius/M%C5%93bius.dmg) as a .dmg file
* Windows - [Microsoft Windows System Installer](http://www.andyh.org/moebius/M%C5%93bius%20Setup.exe)
* Windows - [Microsoft Windows Portable EXE file](http://www.andyh.org/moebius/M%C5%93bius.exe)


# Documentation:

### ToDo

- [x] Table of contents with links
- [x] Convert plain text to nice, shiney README.md markdown doc
- [x] Introduction
- [x] Building from source - prereqs & deps
- [x] Building from source - cloning *Moebius* repo and building with npm
- [x] Downloads section
- [x] Acknowledgements
- [ ] Create docs/ dir and separate document for building/installing dependencies, prerequisites, and Nginx proxy for *Node.js*
- [ ] Brief Documentation in this section with links to complete docs & user manual in docs/
- [ ] Initialize Wiki and duplicate *some* documentation there (NOTE: Wiki's aren't part of a clone or a mirror repo)
- [ ] Specify and clarify the particular OSes and respective versioning that *Moebius* is supported under (for binary d/l's)
- [ ] Create packages for Arch, Slackware, SuSE, and CentOS
- [ ] Other foshizzles TBD.


# Acknowledgements:

1. Authors
   - Copyright 2019 - [Andy Herbert](https://github.com/andyherbert)

2. Contributors
   - Moebius includes fonts from, and has a fantastic splash screen drawn by members of the following groups
     - Blocktronics'
       - AlphaKing
     - Fuel's
       - burps
   - Documentation
     - tallship 12:2/104 & 1337:3/116 (V'Ger)

3. License
   - Licensed under terms of the [Apache License, version 2.0](https://github.com/blocktronics/moebius/blob/master/LICENSE.txt)

