# Raw Local Tunnel

Quick easy way to expose an application listening on a port. Similiar to localtunnel.me.
However, there is no public server or subdomains.
(If somebody is willing to host a public server, I will make it available)


```
npm install -g rawlocaltunnel
```

### Server
Server portion will listen for clients, and dynamically allocate a port to forward traffic to the local machine

e.g. on my.server.com

```
rawlocaltunnelserver
```

### Client
Connect localclient to your server

```
rawlocaltunnel --port 1234 --host my.server.com
```

That's it!

inspired by https://github.com/localtunnel/localtunnel/issues/23
