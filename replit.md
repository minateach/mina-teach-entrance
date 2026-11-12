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

## Student accounts and saved data

- `/account/` provides MINA TEACH AI sign-in, account settings, browser-data
  import, download, and deletion controls.
- Clerk sessions are checked by the server before account data is read or
  changed. Do not add bearer tokens to browser requests.
- Signed-in conversations, learning records, and preferences are stored in the
  Replit PostgreSQL development database and scoped to the Clerk user ID.
- Existing browser data remains local until the student explicitly imports it.
  Deleting saved Mina Teach data removes the account copy and the two supported
  browser copies; it does not delete the Clerk sign-in account.
- All users receive the `student` role by default. There is no self-service
  role elevation; do not enable educator management until the owner identifies
  the first trusted educator or administrator.
