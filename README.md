# nameless Browsergame
simple MOBA RTS Browsergame about floating islands.


# Demo
visit live demo of current production state:

http://master.gamez.mynode.space

[![pipeline status](https://gitlab.mynode.space/browsergame/browsergame/badges/master/pipeline.svg)](https://gitlab.mynode.space/browsergame/browsergame/commits/master)
[![pipeline status](https://gitlab.mynode.space/browsergame/browsergame/badges/development/pipeline.svg)](https://gitlab.mynode.space/browsergame/browsergame/commits/development)

# Architecture

## Backend
Rest API written with ASP.Net core

## Frontend
written in JS using vue.js, jQuery and Bootstrap


# How to Develop?
Main IDEs are VisualStudio 2017 and VisualStudio Code

additional info see: [How to Develop](./docs/DEVELOP.MD)

# Challenges
Since this is a project to learn new stuff here is a list of challenges includes:
 * OOP - mainly in backend for stuff like buildings, troops, maptiles,...
 * Design Patterns - also mainly in backend: stragies, factories, dependency injection,...
 * RestAPI - as interface between Backend & Frontend
 * Websockets - as realtime communication between backend & frontend; protocol used is not clear yet: SignalR, Socket.IO,...
 * Css enhanced: Sass, Less
 * Single Page Application: use vue.js as frontend framework
 * git - since it's a team project there will be: branches, merges,...
 * CI and Continuous Deployment: build newest commit on branch automatically and deploy to stageing
 * Markdown - for documentation
 * Docker - for application containers
 * Databases: MongoDB or MariaDB
 * NuGet: package manager for C#, we will use different packages for: logging, db communication, websockets,...
 * ASP.Net Core: we will use C# on a platform independent technology; running standalone with Krestel; Authentication and so on will be tightly integrated with ASP.Net Core