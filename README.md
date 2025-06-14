# ALP Experimental

Seestar ALP experimental repo. This is an experimental copy of what I hope to
eventually get integrated into Seestar ALP.

There are two parts: the `server` written in Python and `ui` written in NextJS.
Both pieces need to be run at the same time.

At some point soon I will add a `docker-compose` file for those who have
`docker` installed.

# Server

```shell
cd server
uv run main.py server
```

The above should autodetect any Seestars on the network.

# UI

```shell
cd ui
npm install --legacy-peer-deps   # Only need to run first time
npm run dev
```

# Running

After the above are run, go to `http://localhost:3000/`. It will have
automatically discovered any Seestars on the network.

