# Running Mina Teach Entrance on Replit

## Start the web app

Start the Replit web workflow with:

```bash
npm start
```

The Node server listens on `0.0.0.0:5000`, serves the existing HTML pages, and
provides the AI tutor API. Install project packages with `npm install`.

## AI tutor connection

The tutor calls MiniMax only from the server through the Replit Connectors SDK.
Provider credentials are not sent to the browser. If the MiniMax connection or
credential is unavailable, the tutor displays a setup message instead of
pretending to answer.

This connection uses MiniMax's Global API endpoint. If the tutor reports an
authentication problem, update the MiniMax credential in Replit Integrations
with a Global-platform key; a Mainland China platform key will not work here.
Restart the app after updating the connection.

## Existing project files

- `index.html` is the home page served at `/`.
- `Index.HTml` contains the exam-practice prototype and a learning-dashboard
  snippet.
- `Index.html` contains the study-planner prototype.

Keep these files when extending the project. The prototypes are not yet joined
to the home page; integrate them carefully rather than deleting or replacing
existing work.
